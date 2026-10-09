"""元信息抽取网关：LLM 主路径 + 规则降级 + 结果级缓存（与 `keywords.py` 同一范式）

两级能力：
  1. `induce_schema()` —— 喂若干文档样本摘要，让 LLM 归纳出**语料级共享 schema**；
  2. `extract()`        —— 按 schema 对单份文档抽值（**一次调用抽全部字段**，带证据与置信度）。

三条硬约束（医学知识库，宁缺毋滥）：
  · **LLM 不可用/失败/超预算 → 规则降级并显式告警**，绝不把规则结果伪装成 LLM 结果；
  · 抽取只依据喂进去的内容 —— 我们只喂「标题树 + 前 N 字正文」，所以结果里必须如实记下
    喂了多少、是否截断（长文档尾部确实可能漏，这比假装抽全了要诚实）；
  · 每个字段都带 `evidence`（原文片段）与 `confidence`，便于人工核对。

缓存：结果落在 `corpus/{doc_id}/llm/metadata.json`，键是 `brief_hash + schema_hash + model`。
不新开数据库表 —— 这份文件本身就是"这份文档的元信息抽取结果"，缓存与产物是同一份东西。
"""
from __future__ import annotations

import hashlib
import json
import os
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from ..config import Settings
from ..logger import get_logger
from .schema import BASE_KEYS, fields_hash, load_schema, normalize_fields, save_schema, schema_path

log = get_logger(__name__)

DEFAULT_BASE_URL = "https://api.deepseek.com"
DEFAULT_MODEL = "deepseek-v4-flash"     # 与 keywords.py 保持一致（同一个 DeepSeek 通道）
PROMPTS_DIR = Path(__file__).resolve().parents[3] / "prompts"

# 规则降级用的领域词典（可随语料演进追加）
ALLERGEN_TERMS = ["牛奶蛋白", "牛奶", "花生", "鸡蛋", "小麦", "大豆", "鱼", "虾", "坚果", "芝麻"]
FORMULA_TERMS = ["深度水解", "氨基酸配方", "适度水解", "部分水解", "普通配方", "豆基配方",
                 "羊奶配方", "eHF", "AAF", "pHF"]
RISK_TERMS = ["禁忌", "禁用", "慎用", "警示", "休克", "死亡", "心跳呼吸骤停", "立即转诊",
              "急诊", "肾上腺素", "严重过敏反应"]
DOSE_RE = re.compile(r"\d+(?:\.\d+)?\s*(?:mg|ml|g|μg|ug)\s*(?:/\s*kg)?", re.IGNORECASE)


def _sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def _now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def load_prompt(task: str, version: str = "v1") -> str:
    p = PROMPTS_DIR / task / f"{version}.md"
    if p.exists():
        return p.read_text(encoding="utf-8")
    return ""


@dataclass
class DocBrief:
    """喂给 LLM 的文档摘要（**有界**，因此必须把喂了什么如实记下来）"""

    doc_id: str
    region: str
    title: str
    headings: list[str]
    head_text: str
    page_count: int
    max_chars: int

    @property
    def truncated(self) -> bool:
        return len(self.head_text) >= self.max_chars

    def render(self) -> str:
        heads = "\n".join(f"- {h}" for h in self.headings[:120]) or "（无标题）"
        return (
            f"文件名（**线索**，可能含年份/来源；可作为参考，但更希望用正文证据）：{self.doc_id}\n"
            f"地区：{'国内' if self.region == 'cn' else '国际'}\n"
            f"页数：{self.page_count}\n"
            f"标题树：\n{heads}\n\n"
            f"正文（前 {len(self.head_text)} 字{'，已截断' if self.truncated else '，全文'}）：\n"
            f"{self.head_text}"
        )


def build_brief(doc_id: str, region: str, md_text: str, page_count: int, max_chars: int) -> DocBrief:
    """从归一化 md 造一份摘要：**标题树（全部）+ 正文前 N 字**

    为什么是这两个：标题树给出全文骨架（覆盖到尾部章节），前 N 字给出最密集的元信息
    （标题页、机构、年份、摘要都在开头）。这是有界成本与覆盖率的折中，不是"读完了全文"。
    """
    lines = md_text.splitlines()
    headings = [ln.lstrip("#").strip() for ln in lines if ln.lstrip().startswith("#")]
    title = headings[0] if headings else doc_id
    head = md_text[:max_chars]
    return DocBrief(doc_id=doc_id, region=region, title=title, headings=headings,
                    head_text=head, page_count=page_count, max_chars=max_chars)


class MetadataLLMGateway:
    """元信息 schema 归纳 + 单文档抽值"""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        # ⚠️ 从 Settings 取（它由 pydantic-settings 的 env_file 填），**不是** os.environ ——
        # env_file 不会把 .env 导出到进程环境，用 os.environ 在服务进程里恒为空。
        # os.environ 仅作为显式 `load_dotenv()`（脚本/CLI 临时用）时的兜底。
        self.api_key = settings.deepseek_api_key or os.environ.get("DEEPSEEK_API_KEY", "")
        self.base_url = settings.kb_llm_base_url or os.environ.get("KB_LLM_BASE_URL", DEFAULT_BASE_URL)
        self.model = settings.kb_llm_model or os.environ.get("KB_LLM_MODEL", DEFAULT_MODEL)
        self.budget_calls = settings.llm_cfg.budget_calls_per_doc
        self.budget_tokens = settings.llm_cfg.budget_tokens_per_doc

    @property
    def available(self) -> bool:
        return bool(self.api_key)

    # ── LLM 调用 ────────────────────────────────────────────────────────
    def _chat(self, system: str, user: str, timeout: int = 90) -> tuple[dict | None, int, str]:
        """返回 (解析后的 JSON, 输入 token 估算, 错误信息)；失败不抛异常"""
        est = int((len(system) + len(user)) * 0.8)
        if not self.api_key:
            return None, est, "缺少 DEEPSEEK_API_KEY"
        try:
            import httpx

            r = httpx.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}",
                         "Content-Type": "application/json"},
                json={
                    "model": self.model,
                    "messages": [{"role": "system", "content": system},
                                 {"role": "user", "content": user}],
                    "response_format": {"type": "json_object"},
                    "temperature": 0,
                },
                timeout=timeout,
            )
            if r.status_code != 200:
                return None, est, f"HTTP {r.status_code}: {r.text[:200]}"
            body = r.json()
            raw = body["choices"][0]["message"]["content"]
            tokens = int(body.get("usage", {}).get("prompt_tokens") or est)
            return json.loads(raw), tokens, ""
        except Exception as e:  # noqa: BLE001 - 网络/解析失败一律降级，不抛给上层
            return None, est, f"{type(e).__name__}: {e}"

    # ── ① 归纳语料级 schema ─────────────────────────────────────────────
    def induce_schema(self, briefs: list[DocBrief]) -> tuple[dict[str, Any] | None, dict[str, Any]]:
        stats: dict[str, Any] = {"calls": 0, "tokens_in": 0, "samples": len(briefs), "warnings": []}
        prompt = load_prompt("metadata_schema")
        if not prompt:
            stats["warnings"].append("缺少 prompts/metadata_schema/v1.md，无法归纳")
            return None, stats
        if not self.available:
            stats["warnings"].append("缺少 DEEPSEEK_API_KEY：无法用 LLM 归纳 schema")
            return None, stats

        user = "\n\n".join(f"=== 样本 {i + 1} ===\n{b.render()}" for i, b in enumerate(briefs))
        got, tokens, err = self._chat(prompt, user, timeout=180)
        stats["calls"] += 1
        stats["tokens_in"] += tokens
        if got is None:
            stats["warnings"].append(f"LLM 归纳失败：{err}")
            return None, stats

        fields = normalize_fields(got.get("fields"))
        schema = {
            "version": f"llm-{_now()[:10]}",
            "source": "llm",
            "created_at": _now(),
            "model": self.model,
            "sample_docs": [b.doc_id for b in briefs],
            "note": str(got.get("reasoning") or ""),
            "fields": fields,
        }
        return schema, stats

    # ── ② 单文档抽值 ────────────────────────────────────────────────────
    def extract(
        self,
        brief: DocBrief,
        schema: dict[str, Any],
        *,
        llm_root: Path,
        fallback_values: dict[str, Any] | None = None,
        force: bool = False,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        """按 schema 抽值；返回 (结果, 统计)。结果落盘到 `llm_root/metadata.json`。"""
        fields = schema.get("fields") or []
        rendered = brief.render()
        cache_key = {
            "brief_hash": _sha(rendered),
            # 用 schema.fields_hash 而不是自己拼 JSON —— 覆盖率视图也用它判"结果是否过期"，
            # 两处算法必须完全一致，否则会出现"缓存命中判定说过期、覆盖率判定说没过期"。
            "schema_hash": fields_hash(fields),
            "model": self.model,
        }
        stats: dict[str, Any] = {"calls": 0, "tokens_in": 0, "warnings": [], **cache_key}

        cached = self._read_result(llm_root)
        if cached and not force and all(cached.get(k) == v for k, v in cache_key.items()):
            stats["cached"] = True
            return cached, stats

        values: dict[str, Any]
        source = "llm"
        if self.available:
            prompt = load_prompt("metadata_extraction")
            user = (
                "字段 schema：\n"
                + json.dumps({"fields": fields}, ensure_ascii=False, indent=1)
                + "\n\n文档摘要：\n"
                + rendered
            )
            got, tokens, err = self._chat(prompt, user, timeout=180)
            stats["calls"] += 1
            stats["tokens_in"] += tokens
            if got is not None and isinstance(got.get("values"), dict):
                values = self._coerce(got["values"], fields)
            else:
                values = self.rule_extract(fields, rendered, fallback_values or {})
                source = "rule"
                stats["warnings"].append(f"LLM 抽取失败，降级为规则抽取：{err}")
        else:
            values = self.rule_extract(fields, rendered, fallback_values or {})
            source = "rule"
            stats["warnings"].append("缺少 DEEPSEEK_API_KEY：本次为规则抽取")

        filled = sum(1 for v in values.values() if _is_filled(v.get("value")))
        result = {
            "doc_id": brief.doc_id,
            **cache_key,
            "source": source,
            "extracted_at": _now(),
            "brief": {"chars": len(brief.head_text), "headings": len(brief.headings),
                      "truncated": brief.truncated, "max_chars": brief.max_chars},
            "schema_version": schema.get("version"),
            "stats": {**stats, "fields": len(fields), "filled": filled},
            "values": values,
        }
        self._write_result(llm_root, result)
        return result, stats

    # ── 规则降级 ────────────────────────────────────────────────────────
    def rule_extract(self, fields: list[dict], rendered: str,
                     fallback: dict[str, Any]) -> dict[str, Any]:
        """LLM 不可用时的确定性抽取：能算的算，算不出的留空（不编）

        `fallback` 由调用方传入（台账字段 + `corpus.prefill` 的抽取值）——
        那套两级瀑布（文件名规则 → 正文抽取）本来就是这个项目既有的规则路径，直接复用。
        """
        out: dict[str, Any] = {}
        for f in fields:
            key = f["key"]
            val = fallback.get(key)
            evidence = ""
            conf = 0.0
            if not _is_filled(val):
                val = None
                # 少数几个字段可以纯规则抽
                if key == "topics":
                    from ..keywords import MED_TERMS
                    hits = [t for t in MED_TERMS if t in rendered][:8]
                    val = hits or None
                elif key == "allergens":
                    val = [t for t in ALLERGEN_TERMS if t in rendered][:8] or None
                elif key == "formula_types":
                    val = [t for t in FORMULA_TERMS if t in rendered][:8] or None
                elif key == "risk_notes":
                    val = [t for t in RISK_TERMS if t in rendered][:8] or None
                elif key == "dosing_info":
                    hits = DOSE_RE.findall(rendered)
                    val = "、".join(dict.fromkeys(hits))[:200] or None
                elif key == "age_range_months":
                    m = re.search(r"(\d{1,2})\s*[-~至]\s*(\d{1,2})\s*(?:月龄|个月)", rendered)
                    val = f"{m.group(1)}-{m.group(2)}" if m else None
                if _is_filled(val):
                    conf = 0.4      # 规则命中：给个低置信度，界面上一眼能看出不是 LLM 抽的
                    evidence = "（规则命中，非 LLM）"
            else:
                conf = 0.6          # 来自台账/prefill：有人工或文件名规则背书
                evidence = "（来自台账 / 文件名规则抽取）"
            if isinstance(val, str) and f.get("type") == "array":
                val = [s.strip() for s in re.split(r"[,，、;；]", val) if s.strip()]
            out[key] = {"value": val, "evidence": evidence, "confidence": conf, "source": "rule"}
        return out

    @staticmethod
    def _coerce(raw: dict, fields: list[dict]) -> dict[str, Any]:
        """把 LLM 的返回值收敛到 schema 的字段与类型上（缺的字段补空，多的丢掉）"""
        by_key = {f["key"]: f for f in fields}
        out: dict[str, Any] = {}
        for key, spec in by_key.items():
            item = raw.get(key)
            if not isinstance(item, dict):
                item = {"value": item} if item is not None else {}
            val = item.get("value")
            typ = spec.get("type")
            if typ == "array":
                if isinstance(val, str):
                    val = [s.strip() for s in re.split(r"[,，、;；]", val) if s.strip()]
                if not isinstance(val, list):
                    val = []
                val = [str(v).strip() for v in val if str(v).strip()][:12] or None
            elif typ == "number":
                try:
                    val = float(val) if val not in (None, "") else None
                    if val is not None and val.is_integer():
                        val = int(val)
                except (TypeError, ValueError):
                    val = None
            elif typ == "enum":
                allowed = spec.get("values") or []
                val = val if (val in allowed) else None
            else:
                val = (str(val).strip() or None) if val is not None else None
            try:
                conf = float(item.get("confidence") or 0)
            except (TypeError, ValueError):
                conf = 0.0
            out[key] = {
                "value": val,
                "evidence": str(item.get("evidence") or "")[:200],
                "confidence": max(0.0, min(1.0, conf)),
                "source": "llm",
            }
        return out

    # ── 结果读写 ────────────────────────────────────────────────────────
    @staticmethod
    def _result_path(llm_root: Path) -> Path:
        return Path(llm_root) / "metadata.json"

    def load_result(self, llm_root: Path) -> dict[str, Any] | None:
        """读已落盘的抽取结果（只读端点用；没有或损坏时返回 None）"""
        return self._read_result(llm_root)

    def _read_result(self, llm_root: Path) -> dict[str, Any] | None:
        p = self._result_path(llm_root)
        if not p.exists():
            return None
        try:
            got = json.loads(p.read_text(encoding="utf-8"))
            return got if isinstance(got, dict) else None
        except (ValueError, OSError):
            return None

    def _write_result(self, llm_root: Path, result: dict[str, Any]) -> None:
        p = self._result_path(llm_root)
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix(".tmp")
        tmp.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, p)


def _is_filled(v: Any) -> bool:
    if v is None:
        return False
    if isinstance(v, str):
        return bool(v.strip())
    if isinstance(v, (list, tuple, dict)):
        return len(v) > 0
    return True
