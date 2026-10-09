"""全库审计：续排区域（空文本块）都被挂到了哪个切片、挂得对不对。

用法：cd minicare-platform/api && .venv/bin/python scripts/audit_continuations.py

背景：MinerU 对跨栏 / 跨页段落只给一个落点的 bbox，其余落点记成**空文本块**。
这些空块由 `anchors/chunk_align.find_continuations` 认领并并进切片的 `block_is`
（见 docs/tech/TECH-015-kb-platform-gotchas.md「跨栏 / 跨页段落的 bbox 缺陷」）。
本脚本把每个空块的归属与**校验依据**摊开，用来发现误报 / 漏检。

三列含义：
  · `claim`  —— 认领它的切片（空 = 没人认领）
  · `hit`    —— 该位置 PDF 文字层的字是否真在认领切片的正文里（校验依据）
  · `orphan` —— 没人认领，但该位置**印着字** —— 需要人看一眼是不是漏检
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from kb_pipeline.anchors.chunk_align import (
    _plain,
    _text_covered,
    align_chunks_to_blocks,
    find_continuations,
    load_content_list,
)
from kb_pipeline.render_pages import text_in_bboxes
from kb_pipeline.web.routers import _doc_dirs, _orc


def main() -> int:
    orc = _orc()
    total_empty = total_claimed = total_orphan = 0
    for doc_id, entry in sorted(_doc_dirs().items()):
        store = orc.store_for(doc_id)
        seg = store.read_current_artifact("segment")
        if seg is None:
            continue
        norm = store.read_current_artifact("normalize") or {}
        line_map = norm.get("line_map") or []
        chunks = list(seg.get("chunks") or [])
        md_path = entry.get("md")
        md_text = Path(md_path).read_text(encoding="utf-8", errors="replace") if md_path and Path(md_path).exists() else ""
        raw_items = load_content_list(entry.get("content_list"))
        if not (line_map and raw_items and any(c.get("line_start") is not None for c in chunks)):
            print(f"[skip] {doc_id}：不具备精确对齐前提")
            continue

        block_map = align_chunks_to_blocks(chunks, md_text=md_text, raw_items=raw_items, line_map=line_map)
        empties = [
            (i, b)
            for i, b in enumerate(raw_items)
            if b.get("type") == "text"
            and not (b.get("text") or "").strip()
            and isinstance(b.get("bbox"), list)
            and len(b["bbox"]) == 4
        ]
        if not empties:
            continue
        got = text_in_bboxes(entry["pdf"], [(b.get("page_idx") or 0, tuple(b["bbox"])) for _, b in empties])
        region_text = {i: t for (i, _), t in zip(empties, got) if t}

        by = {str(c.get("kb_id")): c for c in chunks}
        claims: dict[int, str] = {}
        for kb, bis in block_map.items():
            cont = find_continuations(
                bis, raw_items, chunk_text=by[kb].get("content"), region_text=region_text
            )
            for ci in cont:
                claims.setdefault(ci, kb)

        total_empty += len(empties)
        print(f"\n=== {doc_id}  （空文本块 {len(empties)} 个）")
        for i, b in empties:
            kb = claims.get(i)
            txt = region_text.get(i) or ""
            if kb:
                total_claimed += 1
                hit = "✓" if _text_covered(txt, by[kb].get("content") or "") else "✗"
            else:
                hit = "—"
                if _plain(txt):
                    total_orphan += 1
                    hit = "orphan"
            print(f"  块#{i:<4} 第{b.get('page_idx')}页 {b['bbox']!s:26} 认领={kb or '（无）':<4} 校验={hit}")
            if txt:
                print(f"        该位置原文：{_plain(txt)[:52]}")

    print(
        f"\n合计：空文本块 {total_empty} 个，被认领 {total_claimed} 个，"
        f"无人认领但有字（可能漏检）{total_orphan} 个"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
