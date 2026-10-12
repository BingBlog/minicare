"""观测域后端（TECH-030）：Langfuse 观测栈编排 + FlexDB → Langfuse 数据同步。

模块结构：
  · `stack.py` —— Docker 运行时探测（colima / Docker Desktop）→ compose 生命周期 → 健康探针；
  · `sync.py`  —— 包装 `scripts/langfuse-import.mjs`（参数透传 + `@@SYNC@@` 进度解析 + 台账落库）。

两个单例：
  · `OBS_STACK` —— 栈状态机（进程内，跟平台生命周期走）；
  · `OBS_SYNC`  —— 同步执行器（全局单次并发）。

平台接入点见 `web/api.py` 的 lifespan：启动时 `OBS_STACK.startup()`（异步拉起，
不阻塞平台）；退出时 `OBS_STACK.shutdown()`（默认停容器、留数据卷）。
"""
from .stack import OBS_STACK, probe_health
from .sync import OBS_SYNC

__all__ = ["OBS_STACK", "OBS_SYNC", "probe_health"]
