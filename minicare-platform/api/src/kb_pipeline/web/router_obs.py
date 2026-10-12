"""观测域 REST 路由（TECH-030 §2.6）：`/api/obs/*`。

端点：
  GET  /status        观测服务全量状态（docker 运行时 / 栈状态机 / 密钥配置 / 同步快照）
  POST /stack/start   启动观测栈（异步 + 幂等：已在运行则收敛探测）
  POST /stack/stop    停止观测栈（compose stop；保留数据卷）
  POST /sync/start    发起数据同步（mode: all|range|trace；dry_run=true 为试跑预览）
  GET  /sync/status   同步运行态 + 实时日志行（1s 轮询）
  POST /sync/cancel   取消进行中的同步（终止子进程；已完成的回填不丢）
  GET  /sync/runs     同步历史（obs_sync_run 台账，倒序）

前端直读、无包裹层（沿用 KB 平台惯例）。
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..config import get_settings
from ..observability import OBS_STACK, OBS_SYNC
from ..observability.sync import ObsSyncBusy, ObsSyncError, flexdb_state, langfuse_keys_state

router = APIRouter(prefix="/api/obs", tags=["obs"])


@router.get("/status")
def get_status() -> dict:
    """观测域状态（前端 4s 轮询；节流刷新栈状态，不阻塞）。"""
    OBS_STACK.refresh_if_stale()
    s = get_settings()
    keys = langfuse_keys_state()
    return {
        "enabled": bool(s.obs_enabled),
        "stack": OBS_STACK.snapshot(),
        "config": {
            "langfuse_host": s.langfuse_host,
            "public_url": s.obs_langfuse_public_url,
            "pk_configured": keys["pk_configured"],
            "sk_configured": keys["sk_configured"],
            "keys_source": keys["source"],
        },
        "flexdb": flexdb_state(),
        "sync": OBS_SYNC.snapshot(with_lines=False),
    }


@router.post("/stack/start")
def stack_start() -> dict:
    """启动观测栈：docker 未运行时自动尝试拉起 colima / Docker Desktop；全程后台执行。"""
    return OBS_STACK.start()


@router.post("/stack/stop")
def stack_stop() -> dict:
    """停止观测栈（保留数据卷；下次启动直接复用）。"""
    return OBS_STACK.stop()


@router.post("/sync/start")
def sync_start(payload: dict | None = None) -> dict:
    """发起一次 FlexDB → Langfuse 数据同步。

    payload：`{mode: 'all'|'range'|'trace', limit?: int, from?: str, to?: str,
    trace_id?: str, dry_run?: bool}`。试跑只需 FlexDB；正式导入还要求观测服务在线 + pk/sk 已配置。
    """
    try:
        OBS_SYNC.start(payload or {})
    except ObsSyncBusy as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except ObsSyncError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return OBS_SYNC.snapshot()


@router.get("/sync/status")
def sync_status() -> dict:
    return OBS_SYNC.snapshot()


@router.post("/sync/cancel")
def sync_cancel() -> dict:
    return OBS_SYNC.cancel()


@router.get("/sync/runs")
def sync_runs(limit: int = 50) -> dict:
    """同步历史（倒序）。日志尾随行返回，前端展开查看。"""
    return {"items": OBS_SYNC.history(limit)}
