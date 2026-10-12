"""用户分析域（PRD-016 / TECH-033）—— 平台第五个能力域「用户分析」的后端实现。

分层（依赖单向，`reader` 是唯一出口）：

```
web/router_analytics.py     路由层：入参校验 + 响应包（data/meta/error）
        │
   metrics.py               口径 v1 的指标计算（纯读 + 纯计算）
        │
   catalog.py               映射表与口径常量（单一事实源）
   exclusions.py            排除名单（YAML + 指纹）
   cache.py                 进程内 TTL 缓存（键含 DSN 与名单指纹）
        │
   reader.py                ★ 唯一只读出口（SELECT 白名单 + 独立 ANALYTICS_DB_* 连接）
        │
   生产库 minicare-cloud-…（只读）
```

**边界**：本域只读，不写任何 MySQL、不写 platform.db；与可写的 `DB_*`（dev 库）物理隔离。
"""
from __future__ import annotations

from . import cache, catalog, exclusions, metrics  # noqa: F401
from .reader import AnalyticsUnavailable, ReadOnlyViolation, assert_readonly, query  # noqa: F401

__all__ = [
    "AnalyticsUnavailable",
    "ReadOnlyViolation",
    "assert_readonly",
    "query",
    "cache",
    "catalog",
    "exclusions",
    "metrics",
]
