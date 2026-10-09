"""人工产物层（US-05 内容校对 / US-06 内容复核 / US-07 人工决定）

**核心约束：人工决定跨 run 存续，重切不静默丢失**（PRD FR-1.11 / FR-1.13 / D-09）。

文件布局（都在 `data/corpus/{doc_id}/edits/`）::

    chunks.edited.json        切片编辑（diff + 所基于的机器产物 hash）
    review_resolutions.json   内容复核结论（四态 + 规则例外）
    excludes.json             噪声块屏蔽/恢复决定（见 quality/noise.py）
    translations.edited.json  人工修正译文（TECH-019 覆盖层；不覆盖机翻产物、重跑不丢）

`index` 步骤读入顺序：**未失效的人工产物 → 机器产物**。
"""
from __future__ import annotations

import difflib
import json
from pathlib import Path

from ..fsutil import ensure_dir

CHUNKS_EDITED = "chunks.edited.json"
REVIEW_RESOLUTIONS = "review_resolutions.json"
TRANSLATIONS_EDITED = "translations.edited.json"

# 切片编辑的操作类型
OP_EDIT = "edit"
OP_DISABLE = "disable"
OP_DELETE = "delete"
OP_SPLIT = "split"
OP_MERGE = "merge"
OPS = (OP_EDIT, OP_DISABLE, OP_DELETE, OP_SPLIT, OP_MERGE)

SIMILARITY_THRESHOLD = 0.6


def _read(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def _write(path: Path, payload: dict) -> Path:
    ensure_dir(path.parent)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


class EditStore:
    """一份文档的人工产物读写"""

    def __init__(self, edits_root: Path) -> None:
        self.root = Path(edits_root)

    # ── 切片编辑 ────────────────────────────────────────────────────────
    @property
    def chunks_path(self) -> Path:
        return self.root / CHUNKS_EDITED

    def load_chunks(self) -> dict:
        return _read(self.chunks_path) or {"base_run_id": "", "base_content_hash": "", "entries": []}

    def save_chunks(self, entries: list[dict], *, base_run_id: str, base_content_hash: str) -> Path:
        return _write(self.chunks_path, {
            "base_run_id": base_run_id,
            "base_content_hash": base_content_hash,
            "invalidated": False,
            "entries": entries,
        })

    def add_entry(self, entry: dict, *, base_run_id: str = "", base_content_hash: str = "") -> dict:
        cur = self.load_chunks()
        cur["entries"] = [e for e in cur.get("entries", []) if not _same_target(e, entry)]
        cur["entries"].append(entry)
        if base_run_id:
            cur["base_run_id"] = base_run_id
        if base_content_hash:
            cur["base_content_hash"] = base_content_hash
        self.save_chunks(cur["entries"], base_run_id=cur.get("base_run_id", ""),
                         base_content_hash=cur.get("base_content_hash", ""))
        return cur

    # ── 内容复核结论 ────────────────────────────────────────────────────
    @property
    def review_path(self) -> Path:
        return self.root / REVIEW_RESOLUTIONS

    def load_reviews(self) -> dict:
        data = _read(self.review_path)
        return {"items": data.get("items", {}), "rule_exceptions": data.get("rule_exceptions", [])}

    def save_reviews(self, items: dict, rule_exceptions: list[dict]) -> Path:
        return _write(self.review_path, {"items": items, "rule_exceptions": rule_exceptions})

    def set_review(self, kb_id: str, *, state: str, value: str = "", reason: str = "",
                   rule: str = "") -> dict:
        cur = self.load_reviews()
        cur["items"][kb_id] = {"state": state, "value": value, "reason": reason, "rule": rule}
        if state == "rejected":
            ex = {"kb_id": kb_id, "rule": rule}
            if ex not in cur["rule_exceptions"]:
                cur["rule_exceptions"].append(ex)
        self.save_reviews(cur["items"], cur["rule_exceptions"])
        return cur["items"][kb_id]

    def is_rule_exception(self, kb_id: str, rule: str = "") -> bool:
        for ex in self.load_reviews()["rule_exceptions"]:
            if ex.get("kb_id") == kb_id and (not rule or ex.get("rule") == rule):
                return True
        return False

    # ── 译文修正覆盖层（TECH-019 §3.8）──────────────────────────────────
    @property
    def translations_path(self) -> Path:
        return self.root / TRANSLATIONS_EDITED

    def load_translations(self) -> dict:
        data = _read(self.translations_path)
        return {"entries": data.get("entries") or {}}

    def set_translation(self, kb_id: str, zh: str, *, src_hash: str = "") -> dict:
        """保存人工修正译文（覆盖层最高优先；**不触发任何管线重跑**）

        `src_hash` 记录保存时该块"最终装配文本"的指纹 —— 正文日后被改过时，
        界面据此把该条修正标成「译文过期」（不静默丢弃，也不假装有效）。
        """
        from datetime import datetime

        cur = self.load_translations()
        cur["entries"][kb_id] = {
            "zh": zh,
            "src_hash": src_hash,
            "at": datetime.now().astimezone().isoformat(timespec="seconds"),
        }
        _write(self.translations_path, {"entries": cur["entries"]})
        return cur["entries"][kb_id]

    def clear_translation(self, kb_id: str) -> bool:
        """删除覆盖层条目（回到机翻值）"""
        cur = self.load_translations()
        existed = kb_id in cur["entries"]
        if existed:
            cur["entries"].pop(kb_id, None)
            _write(self.translations_path, {"entries": cur["entries"]})
        return existed


# ── 应用人工编辑到机器切片 ──────────────────────────────────────────────


def apply_chunk_edits(chunks: list[dict], edits: dict) -> tuple[list[dict], dict]:
    """把切片编辑应用到机器产物。

    返回 (新切片列表, 统计)。**不改动机器产物文件** —— 结果只进产物，可随时丢弃重来。
    """
    entries = edits.get("entries") or []
    by_id = {c["kb_id"]: c for c in chunks}
    stats = {"edited": 0, "disabled": 0, "deleted": 0, "split": 0, "merged": 0, "missing": 0}
    disable_ids: set[str] = set()
    delete_ids: set[str] = set()

    for e in entries:
        op = e.get("op")
        if op == OP_EDIT:
            c = by_id.get(e.get("chunk_id") or e.get("kb_id"))
            if c is None:
                stats["missing"] += 1
                continue
            c["content"] = e.get("text", c["content"])
            c["edited"] = True
            stats["edited"] += 1
        elif op == OP_DISABLE:
            disable_ids.add(e.get("chunk_id") or e.get("kb_id"))
            stats["disabled"] += 1
        elif op == OP_DELETE:
            delete_ids.add(e.get("chunk_id") or e.get("kb_id"))
            stats["deleted"] += 1

    out: list[dict] = []
    for c in chunks:
        if c["kb_id"] in delete_ids:
            continue
        if c["kb_id"] in disable_ids:
            c = {**c, "disabled": True, "excluded": True,
                 "exclude_rule": "manual", "exclude_reason": "人工禁用", "exclude_by": "manual_exclude"}
        out.append(c)

    # 拆分：把源块替换为若干新块（继承章节路径与页码）
    splits = [e for e in entries if e.get("op") == OP_SPLIT]
    for e in splits:
        src_id = e.get("src") or e.get("chunk_id")
        parts = e.get("parts") or []
        idx = next((i for i, c in enumerate(out) if c["kb_id"] == src_id), None)
        if idx is None or not parts:
            stats["missing"] += 1
            continue
        src = out[idx]
        new_blocks = []
        for n, text in enumerate(parts, 1):
            child = {**src, "kb_id": f"{src_id}s{n}", "content": text, "edited": True,
                     "parent_kb_id": src_id}
            new_blocks.append(child)
        out[idx : idx + 1] = new_blocks
        stats["split"] += len(new_blocks)

    # 合并：把多个块合成一块，放在第一个源块的位置（保持阅读顺序）
    for e in entries:
        if e.get("op") != OP_MERGE:
            continue
        srcs = e.get("src") or []
        if len(srcs) < 2:
            stats["missing"] += 1
            continue
        positions = [i for i, c in enumerate(out) if c["kb_id"] in srcs]
        if len(positions) < 2:
            stats["missing"] += 1
            continue
        blocks = [out[i] for i in positions]
        first = blocks[0]
        merged = {
            **first,
            "kb_id": e.get("new") or f"{first['kb_id']}m",
            "content": e.get("text") or "\n\n".join(b["content"] for b in blocks),
            "edited": True,
        }
        out = [c for i, c in enumerate(out) if i not in positions]
        out.insert(min(positions), merged)
        stats["merged"] += 1

    return out, stats


def _same_target(a: dict, b: dict) -> bool:
    """两个编辑是否作用于同一目标（用于覆盖旧编辑而非叠加）"""
    if a.get("op") != b.get("op"):
        return False
    if a.get("op") == OP_MERGE:
        return sorted(a.get("src") or []) == sorted(b.get("src") or [])
    key = "src" if a.get("op") == OP_SPLIT else "chunk_id"
    return (a.get(key) or a.get("kb_id")) == (b.get(key) or b.get("kb_id"))


def find_recoverable(new_chunks: list[dict], old_edits: dict,
                     threshold: float = SIMILARITY_THRESHOLD) -> list[dict]:
    """重切之后，把旧编辑按文本相似度在新切片里找回来（PRD D-09）

    只对 `op=edit` 的条目做匹配（拆分/合并/删除无法可靠迁移），
    返回候选清单供人**逐条确认**，不自动生效。
    """
    out: list[dict] = []
    new_ids = {c["kb_id"] for c in new_chunks}
    for e in (old_edits.get("entries") or []):
        if e.get("op") != OP_EDIT:
            continue
        old_id = e.get("chunk_id") or e.get("kb_id")
        if old_id in new_ids:
            continue          # 块还在，无需找回
        text = e.get("text") or ""
        if not text:
            continue
        best, best_ratio = None, 0.0
        for c in new_chunks:
            ratio = difflib.SequenceMatcher(None, text[:200], (c.get("content") or "")[:200]).ratio()
            if ratio > best_ratio:
                best, best_ratio = c, ratio
        if best is not None and best_ratio >= threshold:
            out.append({
                "old_chunk_id": old_id,
                "candidate_kb_id": best["kb_id"],
                "similarity": round(best_ratio, 4),
                "text": text,
            })
    return sorted(out, key=lambda x: -x["similarity"])


def chunk_edits_hash(edit_store: "EditStore") -> str:
    """人工编辑 + 复核结论的指纹 —— 必须进 translate 的 cache_key（同 segment 的 excludes_hash 手法）。

    只取"会影响最终装配结果"的字段（`base_run_id` / `base_content_hash` 等元信息不参与，
    避免无关变化引发无谓重翻）；**译文修正覆盖层不进这个 hash**（修正不触发重跑，TECH-019 §3.8）。
    """
    from ..artifact import canonical_json, sha256_text

    chunks = edit_store.load_chunks()
    reviews = edit_store.load_reviews()
    material = canonical_json({
        "entries": chunks.get("entries") or [],
        "review_items": reviews.get("items") or {},
        "rule_exceptions": reviews.get("rule_exceptions") or [],
    })
    return sha256_text(material)[:16]
