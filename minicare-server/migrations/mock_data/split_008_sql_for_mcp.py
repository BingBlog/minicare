#!/usr/bin/env python3
"""
将 008_mock_data_v2.sql 拆成多条「单语句」SQL，供 CloudBase MCP manageSqlDatabase
每次 runStatement 执行一条。大 INSERT 按 VALUES 行拆批（默认每批 20 行）。
用法（于 mock_data 目录）:
  python3 split_008_sql_for_mcp.py
输出目录: minicare-server/migrations/mock_data/_mcp_batches_008/stmt_000001.sql ...
"""
from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent
SQL_IN = ROOT / "008_mock_data_v2.sql"
OUT_DIR = ROOT / "_mcp_batches_008"
ROWS_PER_BATCH = 20


def strip_comments(text: str) -> str:
    lines = []
    for line in text.splitlines():
        s = line.strip()
        if s.startswith("--"):
            continue
        lines.append(line)
    return "\n".join(lines)


def parse_value_rows(values_blob: str) -> list[str]:
    """VALUES 后内容，到末尾分号前，按顶层 (...) 拆行。"""
    values_blob = values_blob.strip()
    if values_blob.endswith(";"):
        values_blob = values_blob[:-1].strip()
    rows: list[str] = []
    depth = 0
    start = 0
    for i, ch in enumerate(values_blob):
        if ch == "(":
            if depth == 0:
                start = i
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                rows.append(values_blob[start : i + 1])
    return rows


def split_insert(stmt: str) -> list[str]:
    stmt = stmt.strip()
    if not stmt.lower().startswith("insert"):
        return [stmt + ";"]
    m = re.search(r"\bVALUES\b", stmt, re.IGNORECASE)
    if not m:
        return [stmt + ";"]
    head = stmt[: m.end()].rstrip() + " "
    rest = stmt[m.end() :].strip()
    rows = parse_value_rows(rest)
    if len(rows) <= ROWS_PER_BATCH:
        return [stmt + ";"]
    out: list[str] = []
    for i in range(0, len(rows), ROWS_PER_BATCH):
        chunk = ", ".join(rows[i : i + ROWS_PER_BATCH])
        out.append(head + chunk + ";")
    return out


def main() -> None:
    if not SQL_IN.is_file():
        print(f"missing {SQL_IN}", file=sys.stderr)
        sys.exit(1)
    raw = SQL_IN.read_text(encoding="utf-8")
    text = strip_comments(raw)
    parts = [p.strip() for p in text.split(";") if p.strip()]
    statements: list[str] = []
    for p in parts:
        if p.lower().startswith("insert"):
            statements.extend(split_insert(p))
        else:
            statements.append(p + ";")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob("stmt_*.sql"):
        old.unlink()

    for i, s in enumerate(statements, start=1):
        name = OUT_DIR / f"stmt_{i:06d}.sql"
        name.write_text(s + "\n", encoding="utf-8")

    print(f"wrote {len(statements)} statements to {OUT_DIR}", file=sys.stderr)
    max_len = max(len(x) for x in statements)
    print(f"max statement length: {max_len}", file=sys.stderr)


if __name__ == "__main__":
    main()
