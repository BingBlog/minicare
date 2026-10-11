"""Agent 测评 REST 路由（TECH-021 §5）：`/api/agent-eval/*`。

运行（首期起）：
  GET  /health ｜ POST /runs ｜ GET /runs ｜ GET /runs/{run_id}
  GET  /runs/{run_id}/progress ｜ POST /runs/{run_id}/cancel ｜ GET /overview
  GET  /runs/{run_id}/delta（TECH-022 A7：任意轮的较上轮 delta）
  GET  /estimate（TECH-022 B7：按选择估算耗时）
  PUT  /runs/{run_id}/cases/{case_id}/attribution（TECH-026 §3.2：归因人工改判/恢复自动）
  注：GET /runs/{run_id} 出参自 TECH-026 起附 `report`（五指标/归因分布/成本/决策四态，实时聚合）。
配置对象（TECH-021 §5）：
  GET/POST /cases ｜ PUT/DELETE /cases/{case_id} ｜ POST /cases/import ｜ GET /cases/export
  GET/POST /judges ｜ PUT /judges/{judge_id} ｜ POST /judges/{judge_id}/try（TECH-022 B6：裁判试跑）
  GET/POST /dimensions ｜ PUT /dimensions/{dim_id}
  GET/POST /tasks ｜ PUT/DELETE /tasks/{task_id} ｜ POST /tasks/{task_id}/run

前端直读、无包裹层（沿用 KB 平台惯例）。
"""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Body, HTTPException

from ..agent_eval import seed as eval_seed
from ..agent_eval.attribution import CLASSES as ATTRIBUTION_CLASSES
from ..agent_eval.catalog import EvalCatalog, effective_ctx
from ..agent_eval.ledger import EvalLedger, compute_report
from ..agent_eval.runner import RUNNER
from ..config import get_settings
from ..platform_db import PlatformDB

router = APIRouter(prefix="/api/agent-eval", tags=["agent-eval"])


def _ledger() -> EvalLedger:
    return EvalLedger(PlatformDB(get_settings().platform_cfg.db_path))


def _catalog() -> EvalCatalog:
    return EvalCatalog(PlatformDB(get_settings().platform_cfg.db_path))


def _bad_request(e: ValueError) -> HTTPException:
    return HTTPException(status_code=400, detail=str(e))


def _case_defs_of(run_id: str) -> dict | None:
    """从运行快照读取「当轮实际使用的用例定义」（TECH-022 B3）。

    详情页的「问题原文 / 期望断言」必须展示**运行当时**的定义（而非当前库中可能已改动的版本）；
    快照即 `data/eval/runs/<run_id>/cases.json`（物化产物）。缺失（早于物化时代的运行）→ None。
    """
    f = get_settings().platform_cfg.data_root / "eval" / "runs" / run_id / "cases.json"
    try:
        data = json.loads(Path(f).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    out: dict = {}
    for c in data.get("cases") or []:
        cid = c.get("id")
        if not cid:
            continue
        out[cid] = {
            "message": c.get("message"),
            "ctx": c.get("ctx") or {},
            "history": c.get("history") or [],
            "expect": c.get("expect") or {},
            "judge": c.get("judge"),
        }
    return out or None


# ══ 运行 ══════════════════════════════════════════════════════════════


@router.get("/health")
def health() -> dict:
    return RUNNER.check()


@router.get("/ctx")
def runtime_ctx() -> dict:
    """用例运行身份（**全局设置**）：前端编辑器展示用；编辑入口在「全局配置」页的 eval.ctx。

    返回值与运行物化同源（`catalog.effective_ctx`）；全空 = 未配置（运行时回落用例自带值）。
    """
    ctx = effective_ctx({})
    return {"ctx": ctx, "configured": bool(ctx), "source": get_settings().source_of("eval")}


@router.post("/runs")
def start_run(payload: dict = Body(default={})) -> dict:
    """发起运行。`{scope}` 手工发起；`{task_id}` 按任务发起（judge/runs 可 override）。"""
    p = payload or {}
    try:
        return RUNNER.start(
            scope=(str(p.get("scope") or "all") if not p.get("task_id") else None),
            task_id=(str(p["task_id"]) if p.get("task_id") else None),
            judge=(bool(p["judge"]) if "judge" in p else None),
            runs_n=(int(p["runs"]) if p.get("runs") is not None else None),
        )
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except ValueError as e:
        raise _bad_request(e) from e


@router.get("/runs")
def list_runs(limit: int = 50, task_id: str | None = None) -> dict:
    items = _ledger().list_runs(limit=min(max(limit, 1), 200))
    if task_id:
        items = [r for r in items if r.get("task_id") == task_id]
    return {"items": items}


@router.get("/runs/{run_id}")
def run_detail(run_id: str) -> dict:
    lg = _ledger()
    run = lg.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"运行不存在：{run_id}")
    run["case_defs"] = _case_defs_of(run_id)
    # TECH-026 §4：报告 2.0 聚合（五指标/归因分布/成本/决策四态）——实时计算、不落库
    run["report"] = compute_report(run, run.get("cases") or [])
    return run


@router.put("/runs/{run_id}/cases/{case_id}/attribution")
def update_case_attribution(run_id: str, case_id: str,
                            payload: dict = Body(default={})) -> dict:
    """人工改判失败样本的归因（TECH-026 §3.2）；`attribution=null` 表示恢复自动结果。

    返回：更新后的用例行 + 全量重算的 `report`（改判会改变归因分布与决策，前端整体替换）。
    """
    p = payload or {}
    value = p.get("attribution")
    if value is not None and value not in ATTRIBUTION_CLASSES:
        raise _bad_request(ValueError(
            f"归因取值非法：{value}（可选 {' / '.join(ATTRIBUTION_CLASSES)} 或 null 恢复自动）"))
    note = str(p.get("note")) if p.get("note") is not None else None
    lg = _ledger()
    if not lg.get_run(run_id, with_cases=False):
        raise HTTPException(status_code=404, detail=f"运行不存在：{run_id}")
    updated = lg.update_attribution(run_id, case_id, attribution_value=value, note=note)
    if not updated:
        raise HTTPException(status_code=404, detail=f"该轮没有用例 {case_id} 的结果")
    full = lg.get_run(run_id)
    assert full is not None
    return {"case": updated, "report": compute_report(full, full.get("cases") or [])}


@router.get("/runs/{run_id}/delta")
def run_delta(run_id: str) -> dict:
    """该轮 vs 上一次同范围 completed 运行的逐例对比（任意轮可查；无对比对象时 delta=null）。"""
    lg = _ledger()
    if not lg.get_run(run_id, with_cases=False):
        raise HTTPException(status_code=404, detail=f"运行不存在：{run_id}")
    return {"delta": lg.compute_delta(run_id)}


@router.get("/estimate")
def estimate(scope: str = "all", task_id: str | None = None,
             judge: bool | None = None, runs: int | None = None) -> dict:
    """按选择估算耗时（用例数 × 历史单例均时）。"""
    try:
        return RUNNER.estimate(scope=scope, task_id=task_id, judge=judge, runs_n=runs)
    except ValueError as e:
        raise _bad_request(e) from e


@router.get("/runs/{run_id}/progress")
def run_progress(run_id: str) -> dict:
    p = RUNNER.progress(run_id)
    if p is None:
        raise HTTPException(status_code=404, detail=f"运行不存在：{run_id}")
    return p


@router.post("/runs/{run_id}/cancel")
def cancel_run(run_id: str) -> dict:
    if not RUNNER.cancel(run_id):
        raise HTTPException(status_code=409, detail="该运行不在进行中，无法中止")
    return {"ok": True, "run_id": run_id}


@router.get("/overview")
def overview() -> dict:
    lg = _ledger()
    latest = lg.latest_run()
    delta = None
    if latest and latest["status"] in ("completed", "cancelled"):
        delta = lg.compute_delta(latest["run_id"])
    return {"latest": latest, "delta": delta, "recent": lg.list_runs(limit=8)}


# ══ 用例 ══════════════════════════════════════════════════════════════


@router.get("/cases")
def list_cases(grp: str | None = None, tag: str | None = None,
               enabled: bool | None = None, q: str | None = None) -> dict:
    items = _catalog().list_cases(grp=grp, tag=tag, enabled=enabled, q=q)
    return {"items": items, "count": len(items)}


@router.post("/cases/import")
def import_cases(payload: dict = Body(default={})) -> dict:
    """从 harness 目录（minicare-agent/scripts/eval/cases/*.json）导入用例（幂等）。"""
    force = bool((payload or {}).get("force"))
    try:
        return eval_seed.import_cases(_catalog().db, force=force)
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/cases/export")
def export_cases() -> dict:
    """导出为 harness 兼容 JSON（供 `--cases-file` 与 git 留档）。"""
    return _catalog().export_cases()


@router.post("/cases")
def create_case(payload: dict = Body(default={})) -> dict:
    try:
        return _catalog().upsert_case(payload or {})
    except ValueError as e:
        raise _bad_request(e) from e


@router.put("/cases/{case_id}")
def update_case(case_id: str, payload: dict = Body(default={})) -> dict:
    body = dict(payload or {})
    body["case_id"] = case_id
    try:
        return _catalog().upsert_case(body)
    except ValueError as e:
        raise _bad_request(e) from e


@router.delete("/cases/{case_id}")
def delete_case(case_id: str) -> dict:
    if not _catalog().delete_case(case_id):
        raise HTTPException(status_code=404, detail=f"用例不存在：{case_id}")
    return {"ok": True, "case_id": case_id}


# ══ 裁判 ══════════════════════════════════════════════════════════════


@router.get("/judges")
def list_judges(enabled: bool | None = None) -> dict:
    items = _catalog().list_judges(enabled=enabled)
    return {"items": items, "count": len(items)}


@router.post("/judges")
def create_judge(payload: dict = Body(default={})) -> dict:
    try:
        return _catalog().upsert_judge(payload or {})
    except ValueError as e:
        raise _bad_request(e) from e


@router.put("/judges/{judge_id}")
def update_judge(judge_id: str, payload: dict = Body(default={})) -> dict:
    body = dict(payload or {})
    body["judge_id"] = judge_id
    try:
        return _catalog().upsert_judge(body)
    except ValueError as e:
        raise _bad_request(e) from e


@router.post("/judges/{judge_id}/try")
def try_judge(judge_id: str, payload: dict = Body(default={})) -> dict:
    """裁判试跑：用当前裁判配置对历史回答重新判分（不跑 agent、不写台账）。"""
    p = payload or {}
    case_id = str(p.get("case_id") or "").strip()
    if not case_id:
        raise _bad_request(ValueError("case_id 不能为空"))
    run_id = str(p["run_id"]) if p.get("run_id") else None
    try:
        return RUNNER.rejudge(judge_id=judge_id, case_id=case_id, run_id=run_id)
    except ValueError as e:
        raise _bad_request(e) from e
    except TimeoutError as e:
        raise HTTPException(status_code=504, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


# ══ 维度 ══════════════════════════════════════════════════════════════


@router.get("/dimensions")
def list_dimensions(enabled: bool | None = None, level: str | None = None) -> dict:
    items = _catalog().list_dimensions(enabled=enabled, level=level)
    return {"items": items, "count": len(items)}


@router.post("/dimensions")
def create_dimension(payload: dict = Body(default={})) -> dict:
    try:
        return _catalog().upsert_dimension(payload or {})
    except ValueError as e:
        raise _bad_request(e) from e


@router.put("/dimensions/{dim_id}")
def update_dimension(dim_id: str, payload: dict = Body(default={})) -> dict:
    body = dict(payload or {})
    body["dim_id"] = dim_id
    try:
        return _catalog().upsert_dimension(body)
    except ValueError as e:
        raise _bad_request(e) from e


# ══ 任务 ══════════════════════════════════════════════════════════════


@router.get("/tasks")
def list_tasks() -> dict:
    items = _catalog().list_tasks()
    # 附最近一次运行摘要（供列表展示）
    lg = _ledger()
    runs = lg.list_runs(limit=200)
    for t in items:
        mine = [r for r in runs if r.get("task_id") == t["task_id"]]
        t["last_run"] = mine[0] if mine else None
        t["run_count"] = len(mine)
    return {"items": items, "count": len(items)}


@router.post("/tasks")
def create_task(payload: dict = Body(default={})) -> dict:
    try:
        return _catalog().upsert_task(payload or {})
    except ValueError as e:
        raise _bad_request(e) from e


@router.put("/tasks/{task_id}")
def update_task(task_id: str, payload: dict = Body(default={})) -> dict:
    body = dict(payload or {})
    body["task_id"] = task_id
    try:
        return _catalog().upsert_task(body)
    except ValueError as e:
        raise _bad_request(e) from e


@router.delete("/tasks/{task_id}")
def delete_task(task_id: str) -> dict:
    if not _catalog().delete_task(task_id):
        raise HTTPException(status_code=404, detail=f"任务不存在：{task_id}")
    return {"ok": True, "task_id": task_id}


@router.post("/tasks/{task_id}/run")
def run_task(task_id: str, payload: dict = Body(default={})) -> dict:
    """用任务发起运行（judge / runs 可 override）。"""
    p = payload or {}
    try:
        return RUNNER.start(
            task_id=task_id,
            judge=(bool(p["judge"]) if "judge" in p else None),
            runs_n=(int(p["runs"]) if p.get("runs") is not None else None),
        )
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except ValueError as e:
        raise _bad_request(e) from e
