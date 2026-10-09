"""检索质检台 REST 路由（PRD-011 §5）：`/api/quality/*`。

首页（质检台）：
  GET  /overview —— 用例统计 + 映射体检 + 最新运行 + 阈值 + 默认路径
用例集（US-01/02）：
  GET  /cases ｜ PATCH /cases/{case_id} ｜ POST /import（两步式：dry_run 先报告）
  GET  /cases/template.xlsx（下载 Excel 模板）｜ GET /cases/export.xlsx（导出当前用例集）
  POST /import-excel（上传 .xlsx 导入，两步式：dry=1 先报告）
运行（US-03~07）：
  POST /runs ｜ GET /runs ｜ GET /runs/{run_id} ｜ GET /runs/{run_id}/progress
  POST /runs/{run_id}/cancel ｜ POST /runs/{run_id}/cases/{case_id}/to-gap

前端直读、无包裹层（沿用 KB 平台惯例）。
"""
from __future__ import annotations

from datetime import datetime
from urllib.parse import quote

from fastapi import APIRouter, Body, HTTPException, Request
from fastapi.responses import Response

from ..config import get_settings
from ..gaps import ATTR_TO_GAP, GapLedger, _suggest
from ..platform_db import PlatformDB
from ..quality import excel_io, import_runner
from ..quality.ledger import RecallLedger
from ..quality.runner import RUNNER

router = APIRouter(prefix="/api/quality", tags=["quality"])


def _db() -> PlatformDB:
    return PlatformDB(get_settings().platform_cfg.db_path)


def _ledger() -> RecallLedger:
    return RecallLedger(_db())


def _thresholds() -> dict:
    cfg = get_settings().regression_cfg
    return {
        "recall5_min": cfg.recall_at_5_min,
        "recall10_min": cfg.recall_at_10_min,
        "harmful_max": cfg.harmful_recall_max,
        "emergency_min": cfg.emergency_min,
        "emergency_gate": cfg.emergency_gate,
        "metric_version": cfg.metric_version,
        "diag_depth": cfg.diag_depth,
    }


# ══ 首页 ══════════════════════════════════════════════════════════════


@router.get("/overview")
def overview() -> dict:
    s = get_settings()
    db = _db()
    view = import_runner.cases_view(db, s)
    lg = _ledger()
    latest = lg.latest_run()
    delta = None
    if latest:
        delta = latest.get("delta")
        if delta is None and latest["status"] == "completed":
            delta = lg.compute_delta(latest["run_id"])
    active = RUNNER.active_snapshot()
    return {
        "cases": view["stats"],
        "health": {
            "db_ok": view["stats"].get("db_ok"),
            "db_error": view["stats"].get("db_error"),
            "tokenhub": bool(s.tokenhub_api_key),
        },
        "latest": latest,
        "delta": delta,
        "recent": lg.list_runs(limit=8),
        "thresholds": _thresholds(),
        "paths": import_runner.default_paths(),
        "running": active,
    }


# ══ 用例集（US-01 / US-02）═══════════════════════════════════════════


@router.get("/cases")
def list_cases() -> dict:
    view = import_runner.cases_view(_db(), get_settings())
    view["paths"] = import_runner.default_paths()
    return view


@router.patch("/cases/{case_id}")
def update_case(case_id: str, payload: dict = Body(default={})) -> dict:
    p = payload or {}
    db = _db()
    row = db.query_one("SELECT * FROM kb_recall_case WHERE case_id=?", (case_id,))
    if not row:
        raise HTTPException(status_code=404, detail=f"用例不存在：{case_id}")
    fields: dict = {}
    if "enabled" in p:
        fields["enabled"] = 1 if p.get("enabled") else 0
    if "note" in p:
        fields["note"] = str(p.get("note") or "") or None
    if not fields:
        raise HTTPException(status_code=400, detail="没有可更新的字段（enabled / note）")
    sets = ", ".join(f"{k}=?" for k in fields)
    db.execute(f"UPDATE kb_recall_case SET {sets} WHERE case_id=?", (*fields.values(), case_id))
    return {"ok": True, "case_id": case_id,
            "row": db.query_one("SELECT * FROM kb_recall_case WHERE case_id=?", (case_id,))}


@router.post("/import")
def import_cases(payload: dict = Body(default={})) -> dict:
    """导入/更新测试集与映射（两步式：`dry_run=true` 只出报告）。"""
    p = payload or {}
    defaults = import_runner.default_paths()
    try:
        return import_runner.import_dataset(
            _db(), get_settings(),
            testset_path=str(p.get("testset_path") or defaults["testset"]),
            mapping_path=str(p.get("mapping_path") or defaults["mapping"]),
            dry_run=bool(p.get("dry_run", True)),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


# ── Excel 通道：模板下载 / 导出当前用例集 / 上传导入（US-01 追加）──────────

_EXCEL_MAX_BYTES = 8 * 1024 * 1024


def _xlsx_response(data: bytes, filename: str) -> Response:
    """附件下载响应：ASCII 兜底名 + RFC 5987 的 UTF-8 文件名（中文名不失真）。"""
    cd = f"attachment; filename=\"cases.xlsx\"; filename*=UTF-8''{quote(filename)}"
    return Response(content=data, media_type=excel_io.XLSX_MIME, headers={"Content-Disposition": cd})


@router.get("/cases/template.xlsx")
def download_template() -> Response:
    """「下载 Excel 模板」：固定格式工作簿（示例行 + 说明表）。"""
    return _xlsx_response(import_runner.template_xlsx(), "用例集-Excel模板.xlsx")


@router.get("/cases/export.xlsx")
def export_cases() -> Response:
    """「导出当前用例集」：由台账生成同格式工作簿，维护后可直接再导入。"""
    name = f"用例集-导出-{datetime.now():%Y%m%d}.xlsx"
    return _xlsx_response(import_runner.export_workbook(_db()), name)


@router.post("/import-excel")
async def import_cases_excel(request: Request, filename: str = "", dry: bool = True) -> dict:
    """Excel 通道导入（两步式）：请求体 = .xlsx 原始字节（对齐 corpus/upload 惯例，免 multipart 依赖）。

    `dry=1` 只解析 + 体检（不写入）；确认后同文件再发一次 `dry=0`。
    行级校验失败 → `ok=false` + `errors` 清单（HTTP 200，页面按报告渲染）、**不写入**。
    """
    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="请求体为空（没有收到文件内容）")
    if len(data) > _EXCEL_MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"文件 {len(data) / 1048576:.1f}MB 超过上限 {_EXCEL_MAX_BYTES // 1048576}MB",
        )
    try:
        return import_runner.import_dataset_excel(_db(), get_settings(), filename, data, dry_run=dry)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


# ══ 运行（US-03 ~ US-07）═════════════════════════════════════════════


@router.post("/runs")
def start_run(payload: dict = Body(default={})) -> dict:
    p = payload or {}
    try:
        return RUNNER.start(scope=str(p.get("scope") or "all"),
                            top_k=(int(p["top_k"]) if p.get("top_k") is not None else None),
                            diag_depth=(int(p["diag_depth"]) if p.get("diag_depth") is not None else None))
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/runs")
def list_runs(limit: int = 50, scope: str | None = None) -> dict:
    items = _ledger().list_runs(limit=min(max(limit, 1), 500))
    if scope:
        items = [r for r in items if r["scope"] == scope]
    return {"items": items}


@router.get("/runs/{run_id}")
def run_detail(run_id: str) -> dict:
    run = _ledger().get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"运行不存在：{run_id}")
    return run


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


# ── 未命中题一键入「知识缺口」（US-06，打通 US-12）───────────────────


@router.post("/runs/{run_id}/cases/{case_id}/to-gap")
def case_to_gap(run_id: str, case_id: str) -> dict:
    run = _ledger().get_run(run_id, with_cases=True)
    if not run:
        raise HTTPException(status_code=404, detail=f"运行不存在：{run_id}")
    case = next((c for c in run.get("cases") or [] if c["case_id"] == case_id), None)
    if case is None:
        raise HTTPException(status_code=404, detail=f"该运行里没有题目：{case_id}")
    if case["verdict"] != "miss":
        raise HTTPException(status_code=400, detail="只有未命中的题目需要入缺口台账")
    attribution = ATTR_TO_GAP.get(case.get("attribution") or "", "coverage_gap")
    theme = (case.get("question") or case_id)[:24]
    detail = {
        "ranked": f"最佳位次 {case.get('best_rank')}",
        "coverage": "gold 块未进诊断深度",
        "excluded": "gold 块被排除检索",
        "map_stale": "gold 块已失效",
    }.get(case.get("attribution") or "", "")
    evidence = f"{case_id}（{run_id}）：{case.get('attribution') or 'unknown'} · {detail}".strip(" ·")
    row = GapLedger(_db()).record(
        theme=theme, attribution=attribution,
        evidence=evidence, suggestion=_suggest(attribution))
    return {"ok": True, "gap": row}
