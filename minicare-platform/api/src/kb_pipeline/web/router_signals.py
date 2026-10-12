"""信号管理 REST 路由（TECH-029 §5.2 / S3-S7）：`/api/signals/*`。

已实现：
  GET  /registry    信号图谱数据（组/信号/flag/参数/反索引/统计）
  GET  /config      配置清单 58 行视图（含复审状态：lastReviewedAt / pendingReview）
  GET  /health      文件健康（存在性/指纹/schema 兼容）
  GET  /value       单信号实测（signal-dump 透传）
  GET  /value-all   全量信号实测（signals-all 透传）
  POST /dry-run     改前/改后对比（perception-diff 透传）
  POST /assert      断言集（verify-* 三套串行）
  GET/PUT/DELETE /draft   草稿生命周期（S5：保存校验 / 读取 / 丢弃）
  POST /wordlist-try      词表试跑器（S5：归一化 + 归类 + 高致敏命中）
  POST /publish           发布（S6）
  —— S7：——
  GET  /versions          版本列表 + 部署状态 + 外部变更检测
  GET  /versions/{v}      版本详情（值级 diff）
  POST /rollback          回滚到历史版本（复用发布流）
  GET  /audit             审计日志（倒序分页）
  POST /review            标记已审阅（医学参数复审）
  GET  /review-config     复审周期读取
  PUT  /review-config     复审周期调整（受审计）
  POST /deploy-confirm    确认已部署生效（审计 deploy_confirm）
  POST /external-register 外部变更登记为新快照

前端直读、无包裹层（沿用 KB 平台惯例）。
"""

from __future__ import annotations

import time
from pathlib import Path

import yaml
from fastapi import APIRouter, Body, HTTPException

from ..config import get_settings
from ..platform_db import PlatformDB
from ..signals.governance import DraftError, PublishBlocked, SignalGovernance
from ..signals.registry import SIGNALS_PATH, SignalRegistry, _read_yaml
from ..signals.runner import SignalRunner, check_config_file

router = APIRouter(prefix="/api/signals", tags=["signals"])
RUNNER = SignalRunner()


def _gov() -> SignalGovernance:
    return SignalGovernance(PlatformDB(get_settings().platform_cfg.db_path))


@router.get("/registry")
def get_registry() -> dict:
    """信号图谱（US-01）：组/信号/flag/参数 + 反向索引 + 统计。"""
    return SignalRegistry().overview()


@router.get("/config")
def get_config() -> dict:
    """配置清单（US-03）：58 行视图（34 参数 + 12 flag × 2）+ 复审状态（S7 / US-09）。"""
    data = SignalRegistry().config_items()
    _merge_reviews(data)
    return data


def _merge_reviews(data: dict) -> None:
    """把复审状态（S7）合并进配置清单行，就地更新 data：

    - 每行加 lastReviewedAt / reviewNote / pendingReview / reviewState（reviewed|never|na）；
    - 顶层加 reviewSummary（周期 / 待复审计数 / 未审阅计数）与 reviewConfig。
    """
    gov = _gov()
    cycle = gov.review_config()["cycleDays"]
    states = gov.review_state()["states"]
    pending = 0
    never = 0
    for it in data.get("items", []):
        if not it.get("medical"):
            it.update({"lastReviewedAt": None, "reviewNote": "", "pendingReview": False, "reviewState": "na"})
            continue
        s = states.get(it.get("key")) or {}
        lr = s.get("lastReviewedAt")
        it["lastReviewedAt"] = lr
        it["reviewNote"] = s.get("note") or ""
        it["pendingReview"] = bool(s.get("pendingReview"))
        it["reviewState"] = "reviewed" if lr else "never"
        if it["pendingReview"]:
            pending += 1
        if not lr:
            never += 1
    data["reviewSummary"] = {"cycleDays": cycle, "pendingCount": pending, "neverReviewedCount": never}
    data["reviewConfig"] = {"cycleDays": cycle}


@router.get("/health")
def get_health() -> dict:
    """文件健康：存在性 / 指纹 / schema 兼容（US-08 外部变更检测的基础）。"""
    return SignalRegistry().health()


@router.get("/value")
def get_value(
    baby: str,
    key: str,
    datasource: str = "dev",
    configFile: str | None = None,
) -> dict:
    """单信号实测（US-02「跑一遍」）。datasource ∈ dev | prod（prod 只读）。"""
    if datasource not in ("dev", "prod"):
        raise HTTPException(status_code=400, detail="datasource 仅支持 dev | prod")
    try:
        cfg = check_config_file(configFile)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return RUNNER.value(key, baby, datasource, cfg)


@router.get("/value-all")
def get_value_all(
    baby: str,
    datasource: str = "dev",
    configFile: str | None = None,
) -> dict:
    """全量信号实测（US-01 表格「实测值」列）：一次跑完 46 信号 + 12 flag 触发状态。"""
    if datasource not in ("dev", "prod"):
        raise HTTPException(status_code=400, detail="datasource 仅支持 dev | prod")
    try:
        cfg = check_config_file(configFile)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return RUNNER.value_all(baby, datasource, cfg)


@router.post("/dry-run")
def post_dry_run(payload: dict = Body(...)) -> dict:
    """改前/改后对比（US-06 干跑）：body { baby, datasource? }。

    服务端自动把当前草稿物化为临时配置（无草稿 → 基线模式）；不需要客户端传文件。
    """
    baby = (payload.get("baby") or "").strip()
    if not baby:
        raise HTTPException(status_code=400, detail="缺少 baby")
    datasource = payload.get("datasource") or "dev"
    if datasource not in ("dev", "prod"):
        raise HTTPException(status_code=400, detail="datasource 仅支持 dev | prod")
    cfg = None
    g = _gov()
    draft = g.get_draft().get("draft")
    if draft and draft.get("items"):
        try:
            cfg = str(g.materialize_draft(draft["items"]))
        except DraftError as e:
            raise HTTPException(status_code=400, detail={"message": "草稿物化失败", "errors": e.errors}) from e
    return RUNNER.diff(baby, datasource, cfg)


@router.post("/assert")
def post_assert(payload: dict | None = Body(default=None)) -> dict:
    """断言集（US-07 发布步骤②）：body { configFile? }。"""
    try:
        cfg = check_config_file((payload or {}).get("configFile"))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return RUNNER.assert_all(cfg)


# ── 草稿生命周期（S5 / US-04）────────────────────────────────────────


@router.get("/draft")
def get_draft() -> dict:
    """当前草稿 + 基线指纹（drift = signals.yaml 被平台外改动过）。"""
    return _gov().get_draft()


@router.put("/draft")
def put_draft(payload: dict = Body(...)) -> dict:
    """保存草稿（全量替换语义）：body { items: [{key, newValue, reason, evidence?}] }。
    校验不通过 → 400，detail = { message, errors: [{key, error}] }。"""
    try:
        return _gov().save_draft(payload.get("items"))
    except DraftError as e:
        raise HTTPException(
            status_code=400, detail={"message": "校验未通过", "errors": e.errors}
        ) from e


@router.delete("/draft")
def delete_draft() -> dict:
    """丢弃草稿（记审计 draft_discard）。"""
    return _gov().discard_draft()


# ── 发布（S6 / US-07）───────────────────────────────────────────────


@router.post("/publish")
def post_publish(payload: dict | None = Body(default=None)) -> dict:
    """发布：body { force?, forceReason? }。

    流程：重验 → 基线检查（平台外改动阻断）→ 断言三套 → 写回 signals.yaml（备份 + 快照 + 审计）。
    断言失败默认阻断（400 + 失败明细）；force=true 且带理由可放行（记 force_publish）。
    """
    payload = payload or {}
    try:
        return _gov().publish(
            force=bool(payload.get("force")),
            force_reason=str(payload.get("forceReason") or ""),
        )
    except PublishBlocked as e:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "断言未通过，发布已被阻止（如确认无碍，可填理由强制发布）",
                "errors": [{"key": "", "error": f} for f in e.failed],
            },
        ) from e
    except DraftError as e:
        raise HTTPException(
            status_code=400, detail={"message": "发布前置检查未通过", "errors": e.errors}
        ) from e


# ── 词表试跑器（S5 / US-05）─────────────────────────────────────────


@router.post("/wordlist-try")
def post_wordlist_try(payload: dict = Body(...)) -> dict:
    """词表试跑：body { foods: [str], wordlists?: {highRiskGroups, categoryRules, prefix, suffix, alias} }。
    传 wordlists = 用「当前 signals.yaml ⊕ 编辑中词表」的临时覆盖试跑（不落仓库）。"""
    foods = [str(f).strip() for f in (payload.get("foods") or []) if str(f).strip()]
    if not foods:
        raise HTTPException(status_code=400, detail="缺少 foods（至少一个食物名）")
    tmp_file = None
    if payload.get("wordlists"):
        tmp_file = _write_wordlist_override(payload["wordlists"])
    return RUNNER.wordlist_try(foods, tmp_file)


def _write_wordlist_override(wordlists: dict) -> str:
    """当前 signals.yaml 全量 ⊕ wordlists 修改 → 临时覆盖文件（试跑专用，不碰仓库真源）。

    wordlists 入参形状（与 signals.yaml 扁平结构一致）：
      { highRiskGroups, categoryRules, prefix, suffix, alias }——5 个顶层键平铺写入。
    """
    sig, _err = _read_yaml(SIGNALS_PATH)
    values = dict((sig or {}).get("values") or {})
    for k in ("highRiskGroups", "categoryRules", "prefix", "suffix", "alias"):
        if k in wordlists:
            values[k] = wordlists[k]
    content = {
        "schema_version": (sig or {}).get("schema_version", 1),
        "source": "platform/wordlist-try（临时覆盖，用后即清理）",
        "values": values,
    }
    tmp_dir = Path(get_settings().platform_cfg.data_root) / "signals" / "tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    _cleanup_tmp(tmp_dir)
    p = tmp_dir / f"wordlist-override-{int(time.time() * 1000)}.yaml"
    p.write_text(yaml.safe_dump(content, allow_unicode=True, sort_keys=False), encoding="utf-8")
    # ⚠️ 必须返回绝对路径：该路径会作为 --config 传给 cwd=AGENT_DIR 的 Node 子进程，
    # 相对路径会在子进程 cwd 下解析失败 → loader 静默降级（2026-10-11 实测踩坑）
    return str(p.resolve())


def _cleanup_tmp(tmp_dir: Path, max_age_s: int = 3600) -> None:
    """清理 1 小时前的临时覆盖文件（保留近期供复查）。"""
    now = time.time()
    for f in tmp_dir.glob("wordlist-override-*.yaml"):
        try:
            if now - f.stat().st_mtime > max_age_s:
                f.unlink()
        except OSError:
            continue


# ── 版本与回滚（S7 / US-08）─────────────────────────────────────────


@router.get("/versions")
def get_versions() -> dict:
    """版本列表 + 部署状态（deploy_confirm 审计）+ 外部变更检测（指纹 vs 最近快照）。"""
    return _gov().list_versions()


@router.get("/versions/{version}")
def get_version(version: str) -> dict:
    """版本详情（值级 diff 全量 / 理由 / 指纹）。"""
    try:
        return _gov().get_version(version)
    except DraftError as e:
        raise HTTPException(status_code=404, detail={"message": "版本不存在", "errors": e.errors}) from e


@router.post("/rollback")
def post_rollback(payload: dict = Body(...)) -> dict:
    """回滚到历史版本：body { version, reason?, force?, forceReason? }。

    以目标版本完整值 → 等值变更项 → 复用发布全流程（校验 + 断言 + 写回 + 新快照 + 审计 rollback）。
    """
    version = str(payload.get("version") or "").strip()
    if not version:
        raise HTTPException(status_code=400, detail="缺少 version")
    try:
        return _gov().rollback(
            version,
            reason=str(payload.get("reason") or ""),
            force=bool(payload.get("force")),
            force_reason=str(payload.get("forceReason") or ""),
        )
    except PublishBlocked as e:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "断言未通过，回滚已被阻止（如确认无碍，可填理由强制回滚）",
                "errors": [{"key": "", "error": f} for f in e.failed],
            },
        ) from e
    except DraftError as e:
        raise HTTPException(
            status_code=400, detail={"message": "回滚前置检查未通过", "errors": e.errors}
        ) from e


@router.post("/external-register")
def post_external_register() -> dict:
    """外部变更登记：把平台外修改后的当前文件登记为新快照（只登记，不写文件）。"""
    try:
        return _gov().external_register()
    except DraftError as e:
        raise HTTPException(status_code=400, detail={"message": "登记失败", "errors": e.errors}) from e


@router.post("/deploy-confirm")
def post_deploy_confirm() -> dict:
    """确认「已发布版本已随部署生效」（幂等：已确认过则不重复记审计）。"""
    try:
        return _gov().deploy_confirm()
    except DraftError as e:
        raise HTTPException(status_code=400, detail={"message": "确认失败", "errors": e.errors}) from e


# ── 审计（S7 / US-09）──────────────────────────────────────────────


@router.get("/audit")
def get_audit(limit: int = 100, offset: int = 0) -> dict:
    """审计日志（倒序分页；只追加不删除）。"""
    return _gov().list_audit(limit, offset)


# ── 医学参数复审（S7 / US-09）──────────────────────────────────────


@router.post("/review")
def post_review(payload: dict = Body(...)) -> dict:
    """标记已审阅：body { key, note? }（「已审阅，维持原值」是合法结论）。"""
    key = str(payload.get("key") or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="缺少 key")
    try:
        return _gov().mark_reviewed(key, str(payload.get("note") or ""))
    except DraftError as e:
        raise HTTPException(status_code=400, detail={"message": "标记失败", "errors": e.errors}) from e


@router.get("/review-config")
def get_review_config() -> dict:
    """复审周期（天，默认 180）。"""
    return _gov().review_config()


@router.put("/review-config")
def put_review_config(payload: dict = Body(...)) -> dict:
    """调整复审周期：body { cycleDays }（范围 30–730，受审计 review_config）。"""
    try:
        return _gov().set_review_config(payload.get("cycleDays"))
    except DraftError as e:
        raise HTTPException(status_code=400, detail={"message": "校验未通过", "errors": e.errors}) from e
