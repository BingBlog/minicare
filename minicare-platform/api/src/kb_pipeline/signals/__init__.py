"""信号管理域（TECH-029 / PRD-014）：注册表解析 + 配置视图 + 干跑调度。

设计要点：
- 只读 agent 仓库的 `config/registry.yaml`（结构真源）与 `config/signals.yaml`（值真源）；
- 不做进程内缓存——每次请求读盘，外部修改（手工编辑 / git pull）即时可见；
- 干跑脚本以同步子进程执行（复用 agent_eval.runner 的 find_node / clean_child_env）；
- 平台侧**不写生产数据库**，干跑生产数据源为只读。
"""

from .registry import SignalRegistry  # noqa: F401
from .runner import SignalRunner  # noqa: F401

__all__ = ["SignalRegistry", "SignalRunner"]
