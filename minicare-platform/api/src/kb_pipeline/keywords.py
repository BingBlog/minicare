"""关键词网关（US-09 / TECH-015 §4.5 §8.9）

主路径 LLM，**不可用时降级规则抽取并告警**；结果按**块内容 hash 缓存**（同内容不重复调用）。
- LLM：OpenAI 兼容接口（复用 agent-poc 同款 DeepSeek 通道），key 取 `DEEPSEEK_API_KEY`
- 规则：标题词 ∪ 医学词典命中 ∪ 正文高频 2–6 字词
- 预算：单文档调用数与 token 上限可配，超限即降级（不是报错中断）
"""
from __future__ import annotations

import json
import os
import re
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeoutError
from pathlib import Path
from typing import Callable

from .artifact import content_hash
from .config import Settings
from .platform_db import PlatformDB

DEFAULT_BASE_URL = "https://api.deepseek.com"
DEFAULT_MODEL = "deepseek-v4-flash"
PROMPTS_DIR = Path(__file__).resolve().parents[2] / "prompts"

# 关键词数量上限（进 FULLTEXT，过多会稀释检索精度）
KEYWORD_LIMIT = 8

# ── LLM 调用的**硬超时**保护（2026-10-09 实机问题驱动）──
# `httpx` 自带的 timeout 管不住 **DNS 解析阶段**：同步 `getaddrinfo` 是阻塞调用，
# 在 Clash/系统 DNS 抖动时会无限挂起（实测 validate 卡住 200s+ 无输出，
# 每块的 read timeout=30 形同虚设 —— 请求根本没能进入"已连接"状态）。
# 这里把整个 LLM 调用包进线程池 + `result(timeout=)`，任何形式的挂起都能落地为
# 「降级为规则抽取」。超时后**熔断本批次后续块**（`_llm_hang`），否则每块白等 45s。
# 挂起线程最多泄漏 `max_workers` 个（本机一次性批处理场景，可接受）。
_LLM_POOL = ThreadPoolExecutor(max_workers=2, thread_name_prefix="kw-llm")
_LLM_HARD_TIMEOUT_S = 45


class _LlmHang(Exception):
    """LLM 调用硬超时（挂起）—— 与「普通调用失败」区分：前者熔断整批，后者只降级单块。"""

# 规则抽取用的医学词典（可随语料演进追加）
MED_TERMS = [
    "牛奶蛋白过敏", "CMPA", "深度水解", "部分水解", "适度水解", "氨基酸配方", "特殊医学用途配方",
    "母乳喂养", "配方奶", "辅食", "添加辅食", "过敏原", "致敏", "耐受", "回避", "激发试验",
    "口服食物激发", "OFC", "肾上腺素", "抗组胺药", "糖皮质激素", "严重过敏反应", "荨麻疹",
    "湿疹", "特应性皮炎", "腹泻", "便血", "呕吐", "腹胀", "便秘", "血便", "生长迟缓",
    "免疫耐受", "过敏进程", "IgE", "非IgE", "益生菌", "维生素D", "铁", "钙", "转奶",
    "排敏", "观察期", "风险分级", "急诊", "转诊", "剂量", "禁忌", "监测",
]


def rule_keywords(title: str, content: str, limit: int = 8) -> list[str]:
    """规则抽取：标题词优先，其次医学词典命中，最后正文高频词"""
    out: list[str] = []
    for term in re.findall(r"[\u4e00-\u9fff]{2,6}", title or ""):
        if term not in out:
            out.append(term)
    text = content or ""
    for term in MED_TERMS:
        if term in text and term not in out:
            out.append(term)
        if len(out) >= limit:
            return out[:limit]
    # 正文高频：2 字词的词频前几名（离线可用，无需分词库）
    freq: dict[str, int] = {}
    for term in re.findall(r"[\u4e00-\u9fff]{2,4}", text):
        freq[term] = freq.get(term, 0) + 1
    for term, _ in sorted(freq.items(), key=lambda x: -x[1]):
        if term not in out:
            out.append(term)
        if len(out) >= limit:
            break
    return out[:limit]


def _load_prompt(version: str = "v1") -> str:
    p = PROMPTS_DIR / "keyword_extraction" / f"{version}.md"
    if p.exists():
        return p.read_text(encoding="utf-8")
    return (
        "你是医学术语抽取器。给定切片标题与正文，输出检索用关键词。\n"
        "要求：3–8 个关键词；关键术语保留英文原词（如 CMPA、OFC）；只输出 JSON。\n"
        '输出格式：{"keywords": ["...","..."], "confidence": 0.0-1.0}\n'
    )


class KeywordGateway:
    """关键词抽取网关（LLM 主路径 + 规则降级 + 内容级缓存）"""

    def __init__(self, db: PlatformDB | None, settings: Settings) -> None:
        self.db = db
        self.settings = settings
        cfg = settings.llm_cfg
        self.enabled = bool(cfg.keyword_enabled)
        self.prompt_version = cfg.prompt_version
        self.budget_calls = cfg.budget_calls_per_doc
        self.budget_tokens = cfg.budget_tokens_per_doc
        # ⚠️ 修（2026-10-04）：原先是 `os.environ.get("DEEPSEEK_API_KEY")` —— 但 .env 是由
        # pydantic-settings 的 `env_file` 读进 `Settings` 的，**不会导出到 os.environ**。
        # 于是这条 LLM 关键词路径在服务/CLI 进程里**一直静默降级为规则抽取**（`api_key` 恒空，
        # 只在显式 `load_dotenv()` 的脚本里才碰巧生效）。改为从 Settings 取，os.environ 兜底。
        self.api_key = settings.deepseek_api_key or os.environ.get("DEEPSEEK_API_KEY", "")
        self.base_url = settings.kb_llm_base_url or os.environ.get("KB_LLM_BASE_URL", DEFAULT_BASE_URL)
        self.model = settings.kb_llm_model or os.environ.get("KB_LLM_MODEL", DEFAULT_MODEL)
        # 熔断标志：LLM 硬超时（挂起）后本批次剩余块全部走规则抽取，不再逐块白等
        self._llm_hang = False

    # ── 缓存 ────────────────────────────────────────────────────────────
    def _cache_get(self, h: str) -> dict | None:
        if not self.db:
            return None
        return self.db.query_one("SELECT * FROM kb_keyword_cache WHERE content_hash=?", (h,))

    def _cache_put(self, h: str, keywords: list[str], source: str) -> None:
        if not self.db:
            return
        from datetime import datetime

        self.db.upsert(
            "kb_keyword_cache", ["content_hash"],
            {"content_hash": h, "keywords": ",".join(keywords), "source": source,
             "prompt_version": self.prompt_version,
             "created_at": datetime.now().astimezone().isoformat(timespec="seconds")},
        )

    # ── 主入口 ──────────────────────────────────────────────────────────
    def extract(
        self,
        chunks: list[dict],
        progress: Callable[[str], None] | None = None,
    ) -> tuple[dict[str, str], dict]:
        """对切片列表抽关键词；返回 ({kb_id: 'a,b,c'}, 统计)

        `progress(text)`：每块处理前回调一次（如「关键词抽取 45/120」）——
        validate 步骤借此把子进度写进 `run_registry`，前端可见逐块推进。
        """
        from .quality.noise import _norm  # 复用同一套规范化

        prompt = _load_prompt(self.prompt_version)
        result: dict[str, str] = {}
        stats = {"total": len(chunks), "llm": 0, "cache": 0, "rule": 0,
                 "calls": 0, "tokens_in": 0, "downgraded": False, "warnings": []}
        budget_exhausted = False

        for i, c in enumerate(chunks):
            if c.get("excluded"):
                continue
            if progress:
                progress(f"关键词抽取 {i + 1}/{len(chunks)}")
            text = f"{c.get('title','')}\n{c.get('content','')[:800]}"
            h = content_hash(_norm(text))[:32]

            hit = self._cache_get(h)
            if hit:
                result[c["kb_id"]] = hit["keywords"]
                stats["cache"] += 1
                continue

            need_llm = (
                self.enabled and bool(self.api_key)
                and not budget_exhausted and not self._llm_hang
            )
            if need_llm and stats["calls"] >= self.budget_calls:
                budget_exhausted = True
                stats["downgraded"] = True
                stats["warnings"].append(
                    f"关键词 LLM 调用达到单文档上限 {self.budget_calls}，后续降级为规则抽取"
                )
                need_llm = False

            keywords: list[str] = []
            source = "rule"
            if need_llm:
                try:
                    got, tokens = self._llm_keywords(prompt, text)
                except _LlmHang:
                    # 硬超时（挂起）→ 熔断：后续块直接规则抽取，不逐块白等超时
                    self._llm_hang = True
                    stats["downgraded"] = True
                    stats["warnings"].append(
                        f"LLM 网关无响应（>{_LLM_HARD_TIMEOUT_S}s 硬超时，通常为 DNS/代理挂起），"
                        f"自 {c['kb_id']} 起全部降级为规则抽取"
                    )
                    got, tokens = [], 0
                stats["calls"] += 1
                stats["tokens_in"] += tokens
                if stats["tokens_in"] > self.budget_tokens:
                    budget_exhausted = True
                    stats["downgraded"] = True
                    stats["warnings"].append(
                        f"关键词 LLM token 达到上限 {self.budget_tokens}，后续降级为规则抽取"
                    )
                if got:
                    keywords, source = got, "llm"
                    stats["llm"] += 1
                else:
                    stats["warnings"].append(f"LLM 抽取失败，{c['kb_id']} 降级为规则抽取")
                    stats["downgraded"] = True
            if not keywords:
                keywords = rule_keywords(c.get("title", ""), c.get("content", ""), limit=KEYWORD_LIMIT)
                source = "rule"
                stats["rule"] += 1

            result[c["kb_id"]] = ",".join(keywords)
            self._cache_put(h, keywords, source)

        if not self.api_key and self.enabled:
            stats["downgraded"] = True
            stats["warnings"].append("缺少 DEEPSEEK_API_KEY：关键词全程使用规则抽取")
        return result, stats

    # ── LLM 调用 ────────────────────────────────────────────────────────
    def _llm_keywords(self, prompt: str, text: str) -> tuple[list[str], int]:
        """返回 (关键词列表, 输入 token 估算)。

        普通失败（网络/解析/非 200）→ 返回 ([], 估算值)，只降级这一块；
        **硬超时（挂起）→ 抛 `_LlmHang`**，由调用方熔断本批次剩余块
        —— httpx 自带 timeout 管不住 DNS 阶段，见模块头注释。
        """
        try:
            return _LLM_POOL.submit(self._llm_post, prompt, text).result(
                timeout=_LLM_HARD_TIMEOUT_S
            )
        except FuturesTimeoutError as e:
            raise _LlmHang(str(e)) from e
        except Exception:  # noqa: BLE001 - 网络/解析失败一律降级为规则抽取，不抛给上层
            return [], _estimate_tokens(prompt + text)

    def _llm_post(self, prompt: str, text: str) -> tuple[list[str], int]:
        """真正发请求（在线程池里跑）；抛出的一切异常由 `_llm_keywords` 兜住。"""
        import httpx

        r = httpx.post(
            f"{self.base_url}/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
            json={
                "model": self.model,
                "messages": [
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": text},
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0,
            },
            timeout=30,
        )
        if r.status_code != 200:
            return [], _estimate_tokens(prompt + text)
        body = r.json()
        raw = body["choices"][0]["message"]["content"]
        data = json.loads(raw)
        kws = [str(k).strip() for k in (data.get("keywords") or []) if str(k).strip()]
        tokens = int(body.get("usage", {}).get("prompt_tokens") or _estimate_tokens(prompt + text))
        return kws[:10], tokens


def _estimate_tokens(text: str) -> int:
    """粗略估算：中文约 1 token/字，取字符数的 0.8 倍（宁高不低，用于预算保护）"""
    return int(len(text or "") * 0.8)
