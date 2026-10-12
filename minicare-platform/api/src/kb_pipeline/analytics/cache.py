"""指标结果的进程内 TTL 缓存（TECH-033 §3.4）。

单机单用户场景，不需要 Redis / SQLite；进程重启即清空，完全够用。

⚠️ 缓存键**必须含 DSN 指纹与排除名单指纹**：
  · 含 DSN —— 切换数据源（生产库 ↔ dev 库）后旧结果立即失效，
    防"看着 dev 数据做生产决策"（这是本类工具最容易出的错）；
  · 含排除名单 —— 改名单后指标必须立刻变，否则人会以为"改了没用"。
"""
from __future__ import annotations

import hashlib
import time
from typing import Any, Callable

from ..config import get_settings

_store: dict[str, tuple[float, Any]] = {}


def fingerprint(*parts: Any) -> str:
    raw = "|".join(str(p) for p in parts)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:12]


def ttl_seconds() -> int:
    try:
        return max(0, int(get_settings().analytics_cfg.cache_ttl_s))
    except Exception:  # noqa: BLE001 —— 配置坏了不该让页面挂掉
        return 300


def get_or_compute(key: str, fn: Callable[[], Any], force: bool = False) -> tuple[Any, bool]:
    """返回 (值, 是否命中缓存)。`force=True`（页面「刷新」）直接穿透。"""
    ttl = ttl_seconds()
    if force or ttl <= 0:
        return fn(), False
    hit = _store.get(key)
    now = time.time()
    if hit and hit[0] > now:
        return hit[1], True
    value = fn()
    _store[key] = (now + ttl, value)
    return value, False


def clear() -> None:
    _store.clear()
