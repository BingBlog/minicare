"""解析高危敏感信息复核四态流转（US-06 / PRD §8.8，原「内容复核」）

    validate 产出（初态）
      hit_regex → review=True, review_state='pending'
                        │
        ┌───────────────┼────────────────┬──────────────────┐
        ▼               ▼                ▼                  ▼
   accepted(采纳)   edited(手填)     rejected(误报)    unresolvable(无法补全)
    补值→可检索      补值→可检索      → 可检索 + 规则例外   保持不可检索
                        │
               内容被改过的块 → **必须重算向量**（否则"文本已改、向量还是旧的"）
"""
from __future__ import annotations

import re

from ..config import Settings

STATE_PENDING = "pending"
STATE_ACCEPTED = "accepted"
STATE_EDITED = "edited"
STATE_REJECTED = "rejected"
STATE_UNRESOLVABLE = "unresolvable"
RESOLVED_STATES = (STATE_ACCEPTED, STATE_EDITED, STATE_REJECTED)


def hit_patterns(content: str, settings: Settings) -> list[str]:
    """返回命中的模式名（与 validate 步骤同一套规则，保证口径一致）"""
    hits = []
    for name, pat in settings.validate_cfg.patterns.items():
        try:
            if re.search(pat, content or ""):
                hits.append(name)
        except re.error:  # pragma: no cover - 规则库由配置校验
            continue
    return hits


def fill_value(content: str, settings: Settings, value: str) -> tuple[str, bool]:
    """把人工确认的补全值填进正文的命中处（只填第一处命中的模式）

    返回 (新文本, 是否改动)。找不到命中位置时不做改动 —— 宁可不动，也不乱插。
    """
    if not value:
        return content, False
    for pat in settings.validate_cfg.patterns.values():
        m = re.search(pat, content or "")
        if not m:
            continue
        filled = content[: m.start()] + value + content[m.end():]
        return filled, True
    return content, False


def apply_resolutions(
    chunks: list[dict], resolutions: dict, settings: Settings
) -> tuple[list[dict], dict]:
    """把四态结论应用到切片列表

    `resolutions` 形如 `{kb_id: {"state":..., "value":..., "rule":...}}`（来自 EditStore）。
    返回 (新切片列表, 统计)；统计里 `changed` 列出**内容被改过、需重算向量**的块。
    """
    items = (resolutions or {}).get("items", {})
    stats = {"accepted": 0, "edited": 0, "rejected": 0, "unresolvable": 0,
             "pending": 0, "changed": [], "unchanged_hits": 0}
    out: list[dict] = []

    for c in chunks:
        rec = items.get(c["kb_id"])
        if rec is None:
            if c.get("review"):
                stats["pending"] += 1
            out.append(c)
            continue

        state = rec.get("state") or STATE_PENDING
        c = {**c, "review_state": state}

        if state in (STATE_ACCEPTED, STATE_EDITED):
            new_content, changed = fill_value(c.get("content") or "", settings, rec.get("value") or "")
            if changed:
                c["content"] = new_content
                c["content_chars"] = len(new_content)
                stats["changed"].append(c["kb_id"])
            else:
                stats["unchanged_hits"] += 1
            c["review"] = False
            c["risk_level"] = rec.get("risk_level") or c.get("risk_level") or "low"
            c["review_reason"] = None
            stats[state] += 1
        elif state == STATE_REJECTED:
            # 判为误报：回到可检索，并记入规则例外（validate 下次不再报同一处）
            c["review"] = False
            c["review_reason"] = None
            stats["rejected"] += 1
        elif state == STATE_UNRESOLVABLE:
            # 保持不可检索（剂量缺失不能靠猜），但留痕
            c["review"] = True
            stats["unresolvable"] += 1
        else:
            stats["pending"] += 1
        out.append(c)

    stats["changed_count"] = len(stats["changed"])
    return out, stats


def pending_items(chunks: list[dict]) -> list[dict]:
    """仍待处理的复核项（供界面「解析高危敏感信息复核」页）"""
    return [
        {"kb_id": c["kb_id"], "title": c.get("title"), "header_path": c.get("header_path"),
         "page_idx": c.get("page_idx"), "reason": c.get("review_reason"),
         "review_state": c.get("review_state") or STATE_PENDING,
         "patterns": c.get("review_patterns") or []}
        for c in chunks if c.get("review")
    ]
