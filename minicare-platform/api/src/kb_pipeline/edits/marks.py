"""切片错误标记（人工标注，**刻意不是**内容变换）

## 为什么不塞进 `EditStore`
`edits/chunks.jsonl` 里的是**内容变换**（编辑 / 拆分 / 合并 / 禁用 / 删除）：它们会改变切片内容，
因此进 segment 的 `cache_key`，重跑切块时要按序重放一遍。而"这块内容不完整"是**给人看的标注** ——
它不改变任何内容，也不该让产物指纹变化（否则标注一下就要重跑整条切块链）。
所以单独落 `edits/marks.json`（与 `noise.py` 的 `excludes.json` 同一层、同一套读写范式）。

⚠️ 由此有一个必须讲清楚的语义：**标记不会让切片退出检索**。它只是把问题摊出来，
让人接着做「编辑 / 拆分 / 禁用 / 删除」。界面上要如实说明这一点，别让人以为标了就安全了。
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from ..fsutil import ensure_dir

MARKS_FILE = "marks.json"

# 预设原因：覆盖实测最常见的切片缺陷。允许自由文本补充（`note`），但不允许只有自由文本 ——
# 没有固定取值就没法统计"哪类问题最多"，而那是后续改切块规则的依据。
MARK_REASONS: tuple[str, ...] = (
    "内容不完整",
    "边界切错",
    "表格读坏",
    "内容重复",
    "与原文不符",
    "含噪声残留",
    "其他",
)


def _now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def marks_path(edits_root: Path) -> Path:
    return Path(edits_root) / MARKS_FILE


def load_marks(edits_root: Path) -> dict[str, dict]:
    """读取全部标记：{kb_id: {reason, note, at}}；文件缺失/损坏返回空表（不阻塞流程）"""
    p = marks_path(edits_root)
    if not p.exists():
        return {}
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    items = data.get("marks") if isinstance(data, dict) else None
    if not isinstance(items, dict):
        return {}
    out: dict[str, dict] = {}
    for kb_id, v in items.items():
        if isinstance(v, dict):
            out[str(kb_id)] = {
                "reason": str(v.get("reason") or ""),
                "note": str(v.get("note") or ""),
                "at": str(v.get("at") or ""),
            }
    return out


def save_marks(edits_root: Path, marks: dict[str, dict]) -> Path:
    root = ensure_dir(edits_root)
    p = root / MARKS_FILE
    payload = {
        "marks": {k: marks[k] for k in sorted(marks)},
        "reasons": list(MARK_REASONS),   # 把取值域一并落盘：以后改预设也能看出当时用的是哪套
        "updated_at": _now(),
    }
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(p)      # 原子替换，读侧不会看到半个文件
    return p


def set_mark(edits_root: Path, kb_id: str, reason: str, note: str = "") -> dict:
    """打标（同一 kb_id 重复打标即覆盖）。`reason` 允许是预设之外的自由文本。"""
    marks = load_marks(edits_root)
    marks[kb_id] = {"reason": reason.strip(), "note": note.strip(), "at": _now()}
    save_marks(edits_root, marks)
    return marks[kb_id]


def clear_mark(edits_root: Path, kb_id: str) -> bool:
    marks = load_marks(edits_root)
    if kb_id not in marks:
        return False
    marks.pop(kb_id)
    save_marks(edits_root, marks)
    return True
