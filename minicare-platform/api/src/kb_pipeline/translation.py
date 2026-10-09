"""翻译网关（TECH-019 §3.6）

LLM 主路径 + 内容级缓存（platform.db 的 kb_translate_cache）+ 预算 + 并发 + 降级。
- LLM：OpenAI 兼容接口（复用 minicare-agent 同款 DeepSeek 通道），key 取 Settings（不要只用 os.environ）
- 缓存键 = sha256(model | prompt_version | 命中术语 | 源文本)：同内容跨文档复用，不重复烧 token
- 降级：无 key / 失败 → 逐块标 failed，**步骤不失败**（由步骤汇总 warnings）
- 干跑（dry_run）照常翻译：翻译无库副作用，dry 与 write 产物一致（TECH-019 决策②）
- 硬超时：httpx 读超时管不住 DNS 阶段（Clash 抖动会无限挂起），整次调用包线程池 +
  `result(timeout)`，超时熔断本批次 —— 与 keywords.py 同一套护甲（2026-10-09）
"""
from __future__ import annotations

import json
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from concurrent.futures import TimeoutError as FuturesTimeoutError
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Callable

from .artifact import sha256_text
from .config import Settings
from .glossary import Term
from .logger import get_logger
from .platform_db import PlatformDB

log = get_logger(__name__)

DEFAULT_BASE_URL = "https://api.deepseek.com"
DEFAULT_MODEL = "deepseek-v4-flash"
PROMPTS_DIR = Path(__file__).resolve().parents[2] / "prompts"
RETRY = 1            # 单块失败重试次数
RETRY_WAIT_S = 1.5
TIMEOUT_S = 90       # httpx 读超时（注意：管不住 DNS 阶段，见下面的硬超时保护）

# ── LLM 调用的**硬超时**保护（与 keywords.py 同因，2026-10-09）──
# `httpx` 的读超时管不住 **DNS 解析阶段**：同步 `getaddrinfo` 是阻塞调用，Clash/系统
# DNS 抖动时会无限挂起（请求根本到不了"已连接"）。翻译是分钟级步骤，一次挂起会让
# 整步"假死"——包进线程池 + `result(timeout=)`：硬超时抛异常 → **熔断本批次剩余块**
# （不再逐块白等）。挂起线程最多泄漏 max_workers 个（本机一次性批处理，可接受）。
# ⚠️ 翻译单块可能很大（大表 HTML 输出可达上万 token），阈值比关键词（45s）放宽到 180s。
_LLM_POOL = ThreadPoolExecutor(max_workers=6, thread_name_prefix="tr-llm")
_LLM_HARD_TIMEOUT_S = 180


class _TranslationHang(Exception):
    """LLM 调用硬超时（挂起）—— 与「普通调用失败」区分：前者熔断整批，后者只标记单块。"""


_RE_CJK = re.compile(r"[\u4e00-\u9fff]")
_RE_WORD = re.compile(r"[A-Za-z][A-Za-z'\-]*")


def detect_lang(text: str, skip_cjk_ratio: float = 0.5) -> str:
    """块级语言判定：cjk / (cjk + 英文词数) ≥ 阈值 → "zh"（跳过翻译）

    分母用**英文词数**而非字母数：英文一个词动辄 3-8 个字母，按字母比会把
    中英混排块系统性判成英文。
    """
    cjk = len(_RE_CJK.findall(text or ""))
    words = len(_RE_WORD.findall(text or ""))
    if cjk + words == 0:
        return "empty"
    return "zh" if cjk / (cjk + words) >= float(skip_cjk_ratio) else "en"


def _load_prompt(version: str = "v1") -> str:
    p = PROMPTS_DIR / "translation" / f"{version}.md"
    if p.exists():
        return p.read_text(encoding="utf-8")
    return (
        "你是医学文献翻译器。把英文原文忠实翻译为简体中文，只翻译不增删；"
        "数字/单位/缩写原样保留；保留 Markdown 与 HTML 结构；只输出 JSON。\n"
        '输出格式：{"title_zh": "...", "zh": "..."}\n术语对照：\n{{GLOSSARY}}'
    )


@dataclass
class TranslationResult:
    kb_id: str
    zh: str = ""
    title_zh: str = ""
    error: str = ""
    cached: bool = False
    tokens_in: int = 0
    tokens_out: int = 0


class _Budget:
    """调用/token 双预算（线程安全；超限后剩余块直接标 failed，不中断步骤）"""

    def __init__(self, calls: int, tokens: int) -> None:
        self.calls_left = max(0, int(calls))
        self.tokens_left = max(0, int(tokens))
        self._lock = threading.Lock()

    def allow(self) -> bool:
        with self._lock:
            return self.calls_left > 0 and self.tokens_left > 0

    def spend(self, tokens: int) -> None:
        with self._lock:
            self.calls_left -= 1
            self.tokens_left -= max(0, int(tokens))


class TranslationGateway:
    """块级翻译网关（构造签名与 KeywordGateway 对齐：db + settings）"""

    def __init__(self, db: PlatformDB | None, settings: Settings) -> None:
        self.db = db
        self.settings = settings
        cfg = settings.translate_cfg
        self.prompt_version = cfg.prompt_version
        self.concurrency = max(1, int(cfg.concurrency or 4))
        self.budget = _Budget(cfg.budget_calls_per_doc, cfg.budget_tokens_per_doc)
        # 与 keywords.py 同一教训：必须走 Settings（env_file 不导出 os.environ，后者只兜底）
        self.api_key = settings.deepseek_api_key or os.environ.get("DEEPSEEK_API_KEY", "")
        self.base_url = settings.kb_llm_base_url or DEFAULT_BASE_URL
        self.model = settings.kb_llm_model or DEFAULT_MODEL
        self._prompt = _load_prompt(self.prompt_version)
        # 熔断标志：LLM 硬超时（挂起）后本批次剩余块直接标记 llm_hang，不再逐块白等
        self._llm_hang = False

    # ── 缓存 ────────────────────────────────────────────────────────────
    def _cache_key(self, text: str, hit_terms: list[Term]) -> str:
        terms = "|".join(sorted(f"{t.en}={t.zh}={int(t.keep_en)}" for t in hit_terms))
        return sha256_text(f"{self.model}|{self.prompt_version}|{terms}|{text}")[:32]

    def _cache_get(self, key: str) -> dict | None:
        if not self.db:
            return None
        return self.db.query_one("SELECT * FROM kb_translate_cache WHERE cache_key=?", (key,))

    def _cache_put(self, key: str, zh: str, title_zh: str) -> None:
        if not self.db:
            return
        self.db.upsert(
            "kb_translate_cache", ["cache_key"],
            {"cache_key": key, "zh": zh, "title_zh": title_zh or "",
             "model": self.model, "prompt_version": self.prompt_version,
             "created_at": datetime.now().astimezone().isoformat(timespec="seconds")},
        )

    # ── 主入口 ──────────────────────────────────────────────────────────
    def translate_chunks(
        self,
        units: list[dict],
        progress: Callable[[str], None] | None = None,
    ) -> tuple[dict[str, TranslationResult], dict]:
        """units: [{kb_id, title, content, terms: list[Term]}] → ({kb_id: Result}, stats)

        `progress(text)`：每完成一块回调一次（如「翻译 45/120」）—— 步骤借此把子进度
        写进 `run_registry`，前端可见逐块推进（分钟级步骤的可见性，同 keywords.extract）。
        """
        results: dict[str, TranslationResult] = {}
        stats = {"total": len(units), "calls": 0, "cached": 0, "translated": 0, "failed": 0,
                 "tokens_in": 0, "tokens_out": 0, "degraded": False, "warnings": []}
        if not units:
            return results, stats
        if not self.api_key:
            stats["degraded"] = True
            stats["failed"] = len(units)
            stats["warnings"].append(
                f"缺少 DEEPSEEK_API_KEY：{len(units)} 个块未翻译（配好 key 后重跑即可补齐）"
            )
            for u in units:
                results[u["kb_id"]] = TranslationResult(kb_id=u["kb_id"], error="no_key")
            return results, stats

        def work(u: dict) -> TranslationResult:
            text = f"{u.get('title', '')}\n{u.get('content', '')}"
            key = self._cache_key(text, u.get("terms") or [])
            hit = self._cache_get(key)
            if hit:
                return TranslationResult(
                    u["kb_id"], zh=hit["zh"], title_zh=hit.get("title_zh") or "", cached=True
                )
            if not self.budget.allow():
                return TranslationResult(u["kb_id"], error="budget")
            system = self._build_system(u.get("terms") or [])
            last_err = ""
            for attempt in range(RETRY + 1):
                if self._llm_hang:
                    return TranslationResult(u["kb_id"], error="llm_hang")
                try:
                    data, tin, tout, err = self._llm(system, text)
                except _TranslationHang:
                    # 硬超时（挂起）→ 熔断：后续块不再发起调用，不逐块白等超时
                    self._llm_hang = True
                    return TranslationResult(
                        u["kb_id"], error=f"llm_hang(>{_LLM_HARD_TIMEOUT_S}s)"
                    )
                self.budget.spend((tin + tout) if (tin or tout) else _estimate_tokens(system + text))
                if data:
                    self._cache_put(key, data["zh"], data.get("title_zh", ""))
                    return TranslationResult(
                        u["kb_id"], zh=data["zh"], title_zh=data.get("title_zh", ""),
                        tokens_in=tin, tokens_out=tout,
                    )
                last_err = err
                if attempt < RETRY:
                    time.sleep(RETRY_WAIT_S)
            return TranslationResult(u["kb_id"], error=last_err or "unknown")

        with ThreadPoolExecutor(max_workers=self.concurrency) as ex:
            futures = [ex.submit(work, u) for u in units]
            done = 0
            for fut in as_completed(futures):
                r = fut.result()
                results[r.kb_id] = r
                done += 1
                if progress:
                    progress(f"翻译 {done}/{len(units)}")

        for r in results.values():
            if r.zh:
                stats["translated"] += 1
                stats["cached"] += 1 if r.cached else 0
                stats["tokens_in"] += r.tokens_in
                stats["tokens_out"] += r.tokens_out
            else:
                stats["failed"] += 1
        stats["calls"] = stats["translated"] - stats["cached"]
        if stats["failed"]:
            stats["warnings"].append(
                f"{stats['failed']} 个块翻译失败/未执行（重跑补齐；已成功块走内容缓存）"
            )
        # 预算告警只在**确有块被预算拦下**时触发（最后一刀刚好用完 ≠ 有块没翻）
        denied = sum(1 for r in results.values() if r.error == "budget")
        if denied:
            stats["warnings"].append(
                f"翻译达到单文档预算上限，{denied} 个块未翻译（可调 translate.budget_* 后重跑）"
            )
        if self._llm_hang:
            stats["warnings"].append(
                f"LLM 网关无响应（>{_LLM_HARD_TIMEOUT_S}s 硬超时，通常为 DNS/代理挂起）："
                "自超时起剩余块未翻译（修好网络重跑补齐；已成功块走内容缓存）"
            )
        log.info(f"[translate] {stats}")
        return results, stats

    # ── 内部 ────────────────────────────────────────────────────────────
    def _build_system(self, terms: list[Term]) -> str:
        if terms:
            lines = []
            for t in terms:
                suffix = "（保留英文原词）" if t.keep_en else ""
                lines.append(f"- {t.en} → {t.zh}{suffix}")
            block = "\n".join(lines)
        else:
            block = "（本块未命中术语表词条，按医学惯例翻译）"
        return self._prompt.replace("{{GLOSSARY}}", block)

    def _llm(self, system: str, user: str) -> tuple[dict | None, int, int, str]:
        """硬超时包装：挂起 → 抛 `_TranslationHang`（调用方熔断）；普通失败 → 返回错误消息"""
        try:
            return _LLM_POOL.submit(self._llm_post, system, user).result(
                timeout=_LLM_HARD_TIMEOUT_S
            )
        except FuturesTimeoutError as e:
            raise _TranslationHang(str(e)) from e
        except Exception as e:  # noqa: BLE001 - 网络/解析失败一律记 failed，不抛给上层
            return None, _estimate_tokens(system + user), 0, f"{type(e).__name__}: {e}"[:140]

    def _llm_post(self, system: str, user: str) -> tuple[dict | None, int, int, str]:
        """实际调用（网络/解析错误向上抛，由 `_llm` 统一兜底）"""
        est_in = _estimate_tokens(system + user)
        import httpx

        r = httpx.post(
            f"{self.base_url}/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}",
                     "Content-Type": "application/json"},
            json={
                "model": self.model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0,
            },
            timeout=TIMEOUT_S,
        )
        if r.status_code != 200:
            return None, est_in, 0, f"HTTP {r.status_code}"
        body = r.json()
        raw = body["choices"][0]["message"]["content"]
        data = json.loads(raw)
        zh = str(data.get("zh") or "").strip()
        if not zh:
            return None, est_in, 0, "空译文"
        usage = body.get("usage") or {}
        tin = int(usage.get("prompt_tokens") or est_in)
        tout = int(usage.get("completion_tokens") or _estimate_tokens(zh))
        return {"zh": zh, "title_zh": str(data.get("title_zh") or "").strip()}, tin, tout, ""


def _estimate_tokens(text: str) -> int:
    """粗略估算（宁高不低，用于预算保护）：与 keywords.py 同口径"""
    return int(len(text or "") * 0.8)
