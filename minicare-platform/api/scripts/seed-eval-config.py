#!/usr/bin/env python3
"""种子：把现有 harness 配置导入测评台配置对象表（TECH-021 §3.6）。

导入逻辑在 `kb_pipeline.agent_eval.seed`（与 API `POST /cases/import` 共用）：
  1. 用例：minicare-agent/scripts/eval/cases/*.json → eval_case
  2. 维度：case 级 4 + run 级 6（阈值/一票否决对齐现行 gate，共 10 条）
  3. 裁判：4 条 llm 型，prompt 逐字抄录自 lib/judge.mjs（改前 = 改后）

用法（默认**仅在表为空时导入**，防止覆盖界面上的手改数据）：
  cd minicare-platform/api && .venv/bin/python scripts/seed-eval-config.py
  .venv/bin/python scripts/seed-eval-config.py --force   # 强制 upsert 覆盖
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from kb_pipeline.agent_eval.seed import seed_all  # noqa: E402
from kb_pipeline.config import get_settings  # noqa: E402
from kb_pipeline.platform_db import PlatformDB  # noqa: E402


def main() -> None:
    force = "--force" in sys.argv
    db = PlatformDB(get_settings().platform_cfg.db_path)
    report = seed_all(db, force=force)
    print(f"[seed] {report}")
    print("\n--- 校验 ---")
    for t in ("eval_dimension", "eval_judge", "eval_case", "eval_task"):
        n = db.query_one(f"SELECT COUNT(*) AS n FROM {t}")["n"]
        print(f"{t}: {n} 行")


if __name__ == "__main__":
    main()
