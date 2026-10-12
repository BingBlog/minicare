"""用户分析域 REST 路由（PRD-016 / TECH-033 §4）：`/api/analytics/*`。

端点：

| 方法 | 路径                | 说明                                                     |
| ---- | ------------------- | -------------------------------------------------------- |
| GET  | `/health`           | 连通性 + 规模 + `record_timeline` 一致性对账 + 名单指纹     |
| GET  | `/overview`         | 规模四卡 + 近 90 天周序列                                  |
| GET  | `/activity`         | DAU/WAU/MAU + 黏性 + 活跃家庭/宝宝 + 日序列                 |
| GET  | `/features`         | 功能三视角（条数/渗透率/人均，一次全返）+ 接入盲区            |
| GET  | `/features/{key}`   | 单功能日趋势（功能分析页行展开）                              |
| GET  | `/users`            | 用户清单（脱敏手机号 / 档位 / 最后活跃）                      |
| GET  | `/users/{user_id}`  | 单用户下钻（家庭·宝宝·功能构成·近 90 天分布）                  |
| GET  | `/retention`        | 记录留存 cohort（每格带样本数，`n<3` 标"样本不足"）           |
| GET  | `/exclusions`       | 排除名单 + 疑似测试账号候选项（**只列候选，不自动排除**）        |
| POST | `/exclusions`       | 增删一条名单条目（校验 → 备份 → 原子写回 → 清缓存）             |

**统一响应包**（前端一律读 `meta` 决定页脚与横幅、读 `error` 决定降级）：

```jsonc
{
  "data": { /* 指标；失败时为 null —— 页面显示 — 而不是 0 */ },
  "meta": { "source", "db_name", "metric_version", "window", "computed_at",
            "cached", "excluded": {...}, "partial": [], "db_name_warning": null },
  "error": null   // 失败时 { code, message, hint }
}
```

⚠️ 两条硬约定：

1. **失败一律 503 + `error` 信封，且 `data` 为 `null`** —— 页面据此显示 `—` 而**不是 0**。
   （历史踩坑：DB 连不上时页面显示 0，被误读成"没有数据"。`—` 与 `0` 是两件不同的事。）
2. **降级信封直接作为响应体返回**（`JSONResponse`），不塞进 FastAPI 的 `detail` 包裹层 ——
   这样前端无论成败都拿到同一种形状的 body，不需要分两套解析。
"""
from __future__ import annotations

from typing import Any, Callable

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from ..analytics import catalog, exclusions, metrics
from ..analytics.cache import fingerprint, get_or_compute
from ..analytics.reader import AnalyticsUnavailable, ReadOnlyViolation
from ..analytics.reader import dsn as _dsn
from ..config import get_settings

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

# 生产库名特征：不匹配即在前端顶部出黄色警示（防"看着 dev 数据做生产决策"）
_EXPECTED_DB_PREFIX = "minicare-cloud"


# ── 响应包 ──────────────────────────────────────────────────────────────────

def _source_of(db_name: str) -> str:
    """数据源标识：prod（生产）/ dev（开发）/ custom（自定义）。"""
    name = (db_name or "").lower()
    if _EXPECTED_DB_PREFIX in name:
        return "prod"
    if name in ("minicare_dev", "minicare_staging"):
        return "dev"
    return "custom"


def _db_name_warning(db_name: str) -> str | None:
    if db_name and _EXPECTED_DB_PREFIX not in db_name.lower():
        return f"当前连接的不是生产库（{db_name}）—— 这里的数字不代表真实用户"
    return None


def _meta(window: str | None, days: int | None, *, cached: bool,
          extra: dict[str, Any] | None = None) -> dict[str, Any]:
    """组装响应元数据（`metrics.meta` 会读排除名单，库不通时可能抛 AnalyticsUnavailable）。"""
    s = get_settings()
    base = metrics.meta(window=window or "", days=days or 0, extra=extra)
    base.update({
        "source": _source_of(s.analytics_db_name),
        "db_name_warning": _db_name_warning(s.analytics_db_name),
        "cached": cached,
        "partial": [],
    })
    return base


def _ok(data: Any, *, window: str | None, days: int | None, cached: bool,
        extra: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"data": data, "meta": _meta(window, days, cached=cached, extra=extra), "error": None}


def _fail(code: str, message: str, hint: str = "") -> dict[str, Any]:
    """失败信封：`data=null`（页面显示 `—`），`meta` 只保留不依赖 DB 的部分。"""
    s = get_settings()
    return {
        "data": None,
        "meta": {
            "source": _source_of(s.analytics_db_name),
            "db_name": s.analytics_db_name,
            "metric_version": catalog.METRIC_VERSION,
            "window": None,
            "window_days": None,
            "computed_at": None,
            "cached": False,
            "excluded": None,
            "partial": [],
            "db_name_warning": _db_name_warning(s.analytics_db_name),
        },
        "error": {"code": code, "message": message, "hint": hint},
    }


def _serve(fn: Callable[[], dict[str, Any]]) -> Any:
    """统一异常收敛：域内异常 → 信封 + 503；只读违规 → 信封 + 500（开发期错误，必须可见）。"""
    try:
        return fn()
    except AnalyticsUnavailable as exc:
        msg = str(exc)
        if "未配置" in msg:
            return JSONResponse(status_code=503, content=_fail(
                "analytics_not_configured", msg,
                "到「全局配置 → 用户分析」填写 ANALYTICS_DB_HOST / ANALYTICS_DB_NAME 等 5 项后重试",
            ))
        return JSONResponse(status_code=503, content=_fail(
            "analytics_db_unreachable", msg,
            "检查网络与「全局配置 → 用户分析」的连接参数；本页数字全部显示为 —（不是 0）",
        ))
    except ReadOnlyViolation as exc:
        return JSONResponse(status_code=500, content=_fail(
            "analytics_readonly_violation", f"分析域 SQL 违反了只读白名单：{exc}",
            "这是开发期错误：只读断言不允许任何非 SELECT 语句（见 analytics/reader.py）",
        ))


def _cached(endpoint: str, window: str | None, days: int | None,
            compute: Callable[[], Any], *, force: bool, extra_key: str = "") -> tuple[Any, bool]:
    """统一走缓存：键含 **DSN + 排除名单指纹 + 口径版本**（切换数据源 / 改名单即时失效）。"""
    raw, _ = exclusions.load_raw()
    key = fingerprint(
        endpoint, window or "", days or 0, catalog.METRIC_VERSION,
        _dsn(), fingerprint(raw), extra_key,
    )
    return get_or_compute(key, compute, force=force)


# ── US-01 数据源自检 ────────────────────────────────────────────────────────

@router.get("/health")
def analytics_health() -> Any:
    """连通性 + 规模 + `record_timeline` 一致性对账。不缓存（它本来就是"现在通不通"）。"""
    return _serve(lambda: _ok(metrics.health(), window=None, days=None, cached=False))


# ── US-02 规模总览 ──────────────────────────────────────────────────────────

@router.get("/overview")
def analytics_overview(window: str = Query(catalog.DEFAULT_WINDOW), force: int = Query(0)) -> Any:
    win, days = catalog.normalize_window(window)

    def run() -> dict[str, Any]:
        data, cached = _cached("overview", win, days,
                               lambda: metrics.overview(win, days), force=bool(force))
        return _ok(data, window=win, days=days, cached=cached)

    return _serve(run)


# ── US-03 活跃口径与趋势 ────────────────────────────────────────────────────

@router.get("/activity")
def analytics_activity(window: str = Query(catalog.DEFAULT_WINDOW), force: int = Query(0)) -> Any:
    win, days = catalog.normalize_window(window)

    def run() -> dict[str, Any]:
        data, cached = _cached("activity", win, days,
                               lambda: metrics.activity(win, days), force=bool(force))
        return _ok(data, window=win, days=days, cached=cached)

    return _serve(run)


# ── US-04 功能使用（三视角一次全返）─────────────────────────────────────────

@router.get("/features")
def analytics_features(
    window: str = Query(catalog.DEFAULT_WINDOW),
    view: str = Query("count", description="count | penetration | per_user（仅影响前端默认高亮）"),
    force: int = Query(0),
) -> Any:
    win, days = catalog.normalize_window(window)
    view = view if view in ("count", "penetration", "per_user") else "count"

    def run() -> dict[str, Any]:
        data, cached = _cached("features", win, days,
                               lambda: metrics.features(win, days), force=bool(force))
        return _ok(data, window=win, days=days, cached=cached, extra={"view": view})

    return _serve(run)


@router.get("/features/{key}")
def analytics_feature_trend(
    key: str,
    window: str = Query(catalog.DEFAULT_WINDOW),
    force: int = Query(0),
) -> Any:
    """单功能日趋势（功能分析页行展开）。"""
    if key not in catalog.FUNCTION_LABEL:
        raise HTTPException(status_code=422, detail=f"未知功能标识：{key}")
    win, days = catalog.normalize_window(window)

    def run() -> dict[str, Any]:
        data, cached = _cached("feature-trend", win, days,
                               lambda: metrics.feature_trend(key, days),
                               force=bool(force), extra_key=key)
        return _ok(data, window=win, days=days, cached=cached)

    return _serve(run)


# ── US-05 用户清单与下钻 ────────────────────────────────────────────────────

@router.get("/users")
def analytics_users(
    window: str = Query(catalog.DEFAULT_WINDOW),
    segment: str = Query("all", description="all | core | active | dormant | lost"),
    include_excluded: int = Query(0, description="1 = 同时列出已排除账号"),
    sort: str = Query("last_active", description="last_active | records"),
    force: int = Query(0),
) -> Any:
    win, days = catalog.normalize_window(window)
    segment = segment if segment in ("all", "core", "active", "dormant", "lost") else "all"
    sort = sort if sort in ("last_active", "records") else "last_active"

    def run() -> dict[str, Any]:
        data, cached = _cached(
            "users", win, days,
            lambda: metrics.users_list(days=days, segment=segment,
                                       include_excluded=bool(include_excluded), sort=sort),
            force=bool(force), extra_key=f"{segment}|{include_excluded}|{sort}",
        )
        return _ok(data, window=win, days=days, cached=cached,
                   extra={"segment": segment, "include_excluded": bool(include_excluded), "sort": sort})

    return _serve(run)


@router.get("/users/{user_id}")
def analytics_user_detail(
    user_id: str,
    window: str = Query("90d"),
    force: int = Query(0),
) -> Any:
    """单用户下钻：家庭数 / 宝宝数 / 功能构成 / 近 90 天时间分布。"""
    win, days = catalog.normalize_window(window)

    def run() -> dict[str, Any]:
        data, cached = _cached("user-detail", win, days,
                               lambda: metrics.user_detail(user_id, days),
                               force=bool(force), extra_key=user_id)
        return _ok(data, window=win, days=days, cached=cached)

    try:
        return _serve(run)
    except ValueError as exc:  # metrics.user_detail 在用户不存在时抛 ValueError
        raise HTTPException(status_code=404, detail=f"未找到用户：{user_id}（{exc}）") from exc


# ── US-06 留存 cohort ───────────────────────────────────────────────────────

@router.get("/retention")
def analytics_retention(force: int = Query(0)) -> Any:
    def run() -> dict[str, Any]:
        data, cached = _cached("retention", None, None, metrics.retention, force=bool(force))
        return _ok(data, window=None, days=None, cached=cached)

    return _serve(run)


# ── US-07 排除名单 ──────────────────────────────────────────────────────────

@router.get("/exclusions")
def analytics_exclusions() -> Any:
    """排除名单 + 疑似测试账号候选。

    ⚠️ 刻意**不因数据库不可达而整体 503**：名单文件是本地事实源，本地能读就照常展示；
    只有"候选识别"（需要查库）失败时降级为 `candidates_error`。
    """
    raw, warning = exclusions.load_raw()
    try:
        eff = exclusions.effective()
        users, families, pattern_hits, fp = (
            eff["users"], eff["families"], eff["pattern_hits"], eff["fingerprint"],
        )
    except AnalyticsUnavailable as exc:
        # 名单里有昵称正则、但库连不上（正则解析需要昵称）→ 退回文件原始内容
        users, families, pattern_hits, fp = sorted(raw["users"]), sorted(raw["families"]), [], fingerprint(raw)
        warning = (warning + "；" if warning else "") + f"昵称正则未能解析（{exc}）"

    candidates: list[dict[str, str]] = []
    candidates_error: str | None = None
    try:
        candidates = exclusions.candidates(limit=50)
    except AnalyticsUnavailable as exc:
        candidates_error = str(exc)

    data = {
        "users": users,
        "families": families,
        "nickname_patterns": list(raw["nickname_patterns"]),
        "pattern_hits": pattern_hits,
        "fingerprint": fp,
        "warning": warning,
        "candidates": candidates,
        "candidates_error": candidates_error,
        "file": exclusions.EXCLUSIONS_FILE.name,
        "test_nickname_pattern": get_settings().analytics_cfg.test_nickname_pattern,
    }
    return _ok(data, window=None, days=None, cached=False)


@router.post("/exclusions")
def analytics_exclusions_mutate(payload: dict | None = None) -> Any:
    """增删名单条目：`{action: add|remove, kind: user|family|pattern, value, reason}`。

    走「校验 → 备份 → 原子写回 → 清缓存」，**不落库**；改完立即生效、无需重启。
    """
    body = payload or {}
    action = str(body.get("action") or "")
    kind = str(body.get("kind") or "")
    value = str(body.get("value") or "")
    reason = str(body.get("reason") or "")
    if not reason.strip():
        raise HTTPException(status_code=422, detail="请填写加入排除名单的理由（用于审计回执）")
    try:
        result = exclusions.mutate(action, kind, value, reason)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    raw, warning = exclusions.load_raw()
    data = {
        "changed": bool(result.get("changed")),
        "field": result.get("field"),
        "value": result.get("value"),
        "items": result.get("items", []),
        "reason": reason,
        "users": sorted(raw["users"]),
        "families": sorted(raw["families"]),
        "nickname_patterns": list(raw["nickname_patterns"]),
        "warning": warning,
    }
    return _ok(data, window=None, days=None, cached=False)
