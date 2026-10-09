"""Agent 测评域（PRD-010）：运行调度 + 台账 + 结果解析。

设计要点：
  · **执行层零改动** —— 以子进程方式调度 minicare-agent 的 Node harness（`eval-agent.mjs`），
    通过 `--emit-progress` 的 `@@EVAL@@ {json}` 行解析实时进度，运行结束读 JSON 报告入库（D3）；
  · **台账**（`eval_run` / `eval_case_result`）与 KB 域共用 `platform.db`（表定义见
    `platform_db.SCHEMA`）；入库由 Python 侧执行，Node 端不引入数据库依赖（D4）；
  · **单运行并发**（D7）：同一时间只允许一个运行，状态在 `runner.RUNNER`（模块级单例）。
"""
from .runner import RUNNER

__all__ = ["RUNNER"]
