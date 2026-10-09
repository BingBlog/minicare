"""进程内运行登记表 —— “这份文档现在跑到哪一步了”的唯一数据源。

背景：`Orchestrator.run_pipeline` 是**同步阻塞**的（HTTP 请求内一路跑完六步才返回），
运行过程中“当前在哪一步”没有任何对外可查的通道 —— 前端点完「进行预检」只能干等，
不知道进度、也不知道卡没卡。本模块把运行态登在进程内存里，供 web 层开一个
1 秒轮询的轻量端点（`GET /api/docs/{doc_id}/run-progress`）驱动界面反馈。

为什么是内存而不是 platform.db：
  · 运行态是**瞬时**信息 —— 进程重启后正在跑的运行必然已死（队列任务的收尾由
    `kb_task.resume_orphans` 负责），写库只会引入额外的清理负担；
  · uvicorn 单进程（本机单用户场景）下，进程内 dict 就是唯一真源。
  · 轮询端点因此也**不碰 DB / 不发任何计算** —— 每 1s 一次的读开销必须可忽略。

线程模型：FastAPI 的同步端点在 threadpool 里执行，run 与轮询可能并发，
所有读写经 `_LOCK` 串行化（临界区都是纯内存操作，锁竞争可忽略）。
"""
from __future__ import annotations

import threading
import time

# 完成后保留窗口（秒）：前端轮询间隔 1s，留一段时间让最后一次轮询能读到
# “已结束”（带 `finished: true`），而不是让快照凭空消失。
_FINISH_KEEP_S = 30.0

_LOCK = threading.RLock()
_ACTIVE: dict[str, dict] = {}


def _prune_locked() -> None:
    """惰性清理：过期（完成超过 _FINISH_KEEP_S）的记录在下次访问时移除。"""
    now = time.time()
    for did in list(_ACTIVE):
        e = _ACTIVE[did]
        if not e.get("running") and now - (e.get("finished_at") or 0) > _FINISH_KEEP_S:
            _ACTIVE.pop(did, None)


def begin(doc_id: str, *, mode: str, total_steps: int) -> None:
    """登记一次新运行。

    `mode`：`pipeline`（六步全流程）或 `step`（单步重跑）。
    同文档重复调用 = 后者覆盖前者（本机单用户，不做并发运行防御；产物写入本身是原子的）。
    """
    with _LOCK:
        _ACTIVE[doc_id] = {
            "mode": mode,
            "running": True,
            "step_id": None,
            "step_label": None,
            "step_index": 0,
            "total_steps": total_steps,
            "started_at": time.time(),
            "step_started_at": None,
            "substep": None,
            "done": {},
            "finished_at": None,
            "error": None,
        }


def enter_step(doc_id: str, step_id: str, step_label: str, step_index: int) -> None:
    """进入某一步（含缓存命中的步骤 —— 前端能看到进度在推进，而不是长时间停住）。"""
    with _LOCK:
        e = _ACTIVE.get(doc_id)
        if e is None or not e["running"]:
            return
        e.update(
            step_id=step_id,
            step_label=step_label,
            step_index=step_index,
            step_started_at=time.time(),
            substep=None,  # 新步骤开始：上一步的子进度作废
        )


def set_substep(doc_id: str, text: str | None) -> None:
    """步骤内部的**子进度**文本（如「关键词抽取 45/120」「MinerU 解析中…」）。

    步骤级进度只回答"第几步"；parse（MinerU 云端排队/解析）与 validate（逐块 LLM
    抽取关键词）这类动辄数分钟的步骤，内部推进必须也可见 —— 否则界面停在
    "第 2/6 步 · 解析" 半小时，与卡死无从区分。由慢步骤的实现自行上报，进入新步骤时自动清空。
    """
    with _LOCK:
        e = _ACTIVE.get(doc_id)
        if e is None or not e["running"]:
            return
        e["substep"] = text


def leave_step(doc_id: str, step_id: str, status: str) -> None:
    """某一步跑完（succeeded / skipped_cached / failed），记入 done 供前端实时着色。"""
    with _LOCK:
        e = _ACTIVE.get(doc_id)
        if e is None:
            return
        e["done"][step_id] = status


def finish(doc_id: str, *, error: str | None = None) -> None:
    """一次运行整体结束（成功或失败）。记录保留 _FINISH_KEEP_S 秒供最后一次轮询读取。"""
    with _LOCK:
        e = _ACTIVE.get(doc_id)
        if e is None:
            return
        e.update(running=False, finished_at=time.time(), step_started_at=None, error=error)


def is_running(doc_id: str) -> bool:
    with _LOCK:
        e = _ACTIVE.get(doc_id)
        return bool(e and e["running"])


def brief(doc_id: str) -> dict | None:
    """精简摘要（`/api/overview` 每份文档用）：**只在运行中**返回。

    完成后不再进列表态 —— 卡片的“处理中”由运行态驱动，
    不需要把 30s 保留窗口也带进 overview（避免刷新后看到假“处理中”）。
    """
    with _LOCK:
        _prune_locked()
        e = _ACTIVE.get(doc_id)
        if e is None or not e["running"]:
            return None
        return {
            "step_id": e["step_id"],
            "step_label": e["step_label"],
            "step_index": e["step_index"],
            "total_steps": e["total_steps"],
            "elapsed_ms": int((time.time() - e["started_at"]) * 1000),
            "substep": e.get("substep"),
        }


def snapshot(doc_id: str) -> dict | None:
    """完整快照（轮询端点用）：运行中与完成后保留窗口内都返回；无记录返回 None。"""
    with _LOCK:
        _prune_locked()
        e = _ACTIVE.get(doc_id)
        if e is None:
            return None
        now = time.time()
        return {
            "doc_id": doc_id,
            "running": bool(e["running"]),
            "mode": e["mode"],
            "step_id": e["step_id"],
            "step_label": e["step_label"],
            "step_index": e["step_index"],
            "total_steps": e["total_steps"],
            "elapsed_ms": int((now - e["started_at"]) * 1000),
            "step_elapsed_ms": (
                int((now - e["step_started_at"]) * 1000) if e.get("step_started_at") else None
            ),
            "substep": e.get("substep"),
            "done": dict(e["done"]),
            "finished": not e["running"],
            "error": e["error"],
        }
