"""口径 v1 的指标计算（TECH-033 §3）。

三条贯穿全文件的约定：

1. **用户维度一律走业务表 UNION**（`catalog.union_sql()`），不取 `record_timeline` ——
   timeline 有孤儿行（实测 sleep 多 14 行），且没有用户维度（见 `catalog` 顶部注释）；
2. **活跃判定时间列 = `created_at`（录入时刻）**，不用 `event_time`；
3. **算不出来返回 `None`**，由前端渲染 `—`。**绝不返回 0** —— 0 是"确实没有"，`—` 是"没算出来"，
   这两件事在产品上是完全不同的信息。
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from ..config import get_settings
from . import catalog, exclusions
from .reader import query, query_one

# ── 活跃档位（用户清单的分档与筛选依据）────────────────────────────────────
SEGMENTS: list[tuple[str, int | None, int | None]] = [
    ("core", 0, 7),
    ("active", 7, 30),
    ("dormant", 30, 90),
    ("lost", 90, None),
]


# ── 取数入口：始终用"当前库里确实存在的表" ────────────────────────────────────

def _union(alias: str = "x") -> str:
    """记录来源 UNION 的统一入口（表存在性探测见 `catalog.active_record_sources`）。"""
    return catalog.union_sql(alias, catalog.active_record_sources())


# ── 基础工具 ────────────────────────────────────────────────────────────────

def _int(value: Any) -> int:
    """MySQL 的 SUM/COUNT 经 pymysql 可能返回 Decimal → 统一成 int。"""
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _ratio(numerator: int | None, denominator: int | None) -> float | None:
    if not numerator or not denominator:
        return None
    return round(numerator / denominator, 4)


def _fmt(moment: datetime) -> str:
    return moment.strftime("%Y-%m-%d %H:%M:%S")


def _bounds(days: int) -> tuple[str, str]:
    """返回 [start, end) —— 左闭右开，避免边界日被算两次。"""
    end = datetime.now()
    return _fmt(end - timedelta(days=days)), _fmt(end)


def _day_bounds(offset_days: int = 0) -> tuple[str, str]:
    """某一天的 [00:00:00, 次日 00:00:00)。

    ⚠️ 第二个 f-string 必须写成 `{(day + timedelta(days=1)).isoformat()}` ——
    写成 `{day + timedelta(days=1):isoformat()}` 会被解释成**格式说明符**，
    `date.__format__` 收到非空 spec 会走 `strftime`，于是字面量 `isoformat()` 被原样返回，
    最终 SQL 收到 `'isoformat() 00:00:00'` → MySQL 1525（实测踩坑）。
    """
    day = date.today() + timedelta(days=offset_days)
    nxt = day + timedelta(days=1)
    return f"{day.isoformat()} 00:00:00", f"{nxt.isoformat()} 00:00:00"


def _mask_phone(phone: Any) -> str:
    """脱敏手机号：`138****1234`。后端脱敏，明文不出后端（TECH-033 §4.2）。"""
    raw = str(phone or "").strip()
    if len(raw) == 11 and raw.isdigit():
        return f"{raw[:3]}****{raw[-4:]}"
    if len(raw) > 4:
        return f"{raw[:2]}{'*' * (len(raw) - 4)}{raw[-2:]}"
    return "—" if not raw else "*" * len(raw)


def _segment_of(last_active: str | None) -> str:
    """按最后活跃时间分档：≤7 天核心 / ≤30 天活跃 / ≤90 天沉睡 / 更久或从未记录 = 流失。"""
    if not last_active:
        return "lost"
    try:
        moment = datetime.fromisoformat(str(last_active))
    except ValueError:
        return "lost"
    gap = (datetime.now() - moment).days
    for key, low, high in SEGMENTS:
        if gap >= low and (high is None or gap <= high):
            return key
    return "lost"


def _meta(*, window: str, days: int, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    """响应元数据：页面页脚/横幅全部读它（口径版本、数据源、排除计数、计算时刻）。"""
    s = get_settings()
    excl = exclusions.effective()
    meta: dict[str, Any] = {
        "metric_version": catalog.METRIC_VERSION,
        "window": window,
        "window_days": days,
        "excluded": {
            "users": len(excl["users"]),
            "families": len(excl["families"]),
            "patterns": len(excl["nickname_patterns"]),
            "fingerprint": excl["fingerprint"],
            "warning": excl["warning"],
        },
        "small_sample_users": int(s.analytics_cfg.small_sample_users),
        "computed_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "db_name": s.analytics_db_name,
    }
    if extra:
        meta.update(extra)
    return meta


def meta(*, window: str, days: int, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    """路由层用的公开元数据入口（避免跨模块调用下划线函数）。"""
    return _meta(window=window, days=days, extra=extra)


# ── US-02 规模总览 ──────────────────────────────────────────────────────────

def overview(window: str, days: int) -> dict[str, Any]:
    start, _ = _bounds(days)
    prev_start, _ = _bounds(days * 2)
    uc, ua = exclusions.user_clause("id")
    fc, fa = exclusions.family_clause("id")
    bfc, bfa = exclusions.family_clause("family_id")

    users = query_one(
        "SELECT COUNT(*) AS n,"
        " COALESCE(SUM(sms_verified_at IS NOT NULL), 0) AS verified,"
        " COALESCE(SUM(created_at >= %s), 0) AS new_cur,"
        " COALESCE(SUM(created_at >= %s AND created_at < %s), 0) AS new_prev"
        f" FROM user_account WHERE 1=1{uc}",
        (start, prev_start, start, *ua),
    )
    families = query_one(
        "SELECT COUNT(*) AS n,"
        " COALESCE(SUM(created_at >= %s), 0) AS new_cur,"
        " COALESCE(SUM(created_at >= %s AND created_at < %s), 0) AS new_prev"
        f" FROM family_group WHERE deleted_at IS NULL{fc}",
        (start, prev_start, start, *fa),
    )
    babies = query_one(
        "SELECT COUNT(*) AS n,"
        " COALESCE(SUM(created_at >= %s), 0) AS new_cur,"
        " COALESCE(SUM(created_at >= %s AND created_at < %s), 0) AS new_prev"
        f" FROM baby_profile WHERE deleted_at IS NULL{bfc}",
        (start, prev_start, start, *bfa),
    )

    # 记录总量：走业务表 UNION（与"功能条数"同源、排除名单同样生效），
    # 不用 record_timeline（它有孤儿行，会让总数虚高 —— 见 catalog 顶部注释）。
    union = _union("x")
    xc, xa = exclusions.user_clause("x.uid")
    records = query_one(
        "SELECT COUNT(*) AS n,"
        " COALESCE(SUM(x.t >= %s), 0) AS new_cur,"
        " COALESCE(SUM(x.t >= %s AND x.t < %s), 0) AS new_prev"
        f" FROM {union} WHERE x.uid IS NOT NULL AND x.uid <> ''{xc}",
        (start, prev_start, start, *xa),
    )

    def _card(row: dict, *, note: str = "") -> dict[str, Any]:
        return {
            "value": _int(row.get("n")),
            "new_cur": _int(row.get("new_cur")),
            "new_prev": _int(row.get("new_prev")),
            "note": note,
        }

    # 增长趋势：以周为粒度（YEARWEEK 而非 DATE_FORMAT —— 后者含 `%` 会被 pymysql 当格式符）
    week_since, _ = _bounds(90)
    users_weeks = query(
        "SELECT YEARWEEK(created_at, 3) AS w, MIN(DATE(created_at)) AS d, COUNT(*) AS n"
        f" FROM user_account WHERE created_at >= %s{uc}"
        " GROUP BY YEARWEEK(created_at, 3) ORDER BY w",
        (week_since, *ua),
    )
    records_weeks = query(
        "SELECT YEARWEEK(x.t, 3) AS w, MIN(DATE(x.t)) AS d, COUNT(*) AS n"
        f" FROM {union} WHERE x.uid IS NOT NULL AND x.uid <> ''{xc} AND x.t >= %s"
        " GROUP BY YEARWEEK(x.t, 3) ORDER BY w",
        (week_since, *xa),
    )

    def _weeks(rows: list[dict]) -> list[dict[str, Any]]:
        return [{"week": str(r["w"]), "start": str(r.get("d") or ""), "n": _int(r["n"])} for r in rows]

    return {
        "cards": {
            "users": _card(users, note=f"已验证 {_int(users.get('verified'))}"),
            "users_verified": _int(users.get("verified")),
            "families": _card(families),
            "babies": _card(babies),
            "records": _card(records),
        },
        "series": {
            "days": 90,
            "users": _weeks(users_weeks),
            "records": _weeks(records_weeks),
        },
        "scope_note": "记录总量与新增均按业务表统计，排除名单已生效",
    }


# ── US-03 活跃口径与趋势 ────────────────────────────────────────────────────

def activity(window: str, days: int) -> dict[str, Any]:
    start, end = _bounds(days)
    union = _union("x")
    xc, xa = exclusions.user_clause("x.uid")
    base = f"x.uid IS NOT NULL AND x.uid <> ''{xc}"

    daily_rows = query(
        f"SELECT DATE(x.t) AS d, COUNT(DISTINCT x.uid) AS n FROM {union}"
        f" WHERE {base} AND x.t >= %s AND x.t < %s GROUP BY DATE(x.t) ORDER BY d",
        (*xa, start, end),
    )
    by_date = {str(r["d"]): _int(r["n"]) for r in daily_rows}

    # ── 活跃家庭日序列 ────────────────────────────────────────────────────────
    # 家庭维度**只能**走 `record_timeline`（业务表里只有它带 `baby_id`），
    # 代价是它继承了 timeline 的覆盖缺口：排敏观察 / 成长日记 / 报告 / 音箱未物化进
    # timeline，另有少量孤儿行（见 /health 对账）。因此这条线**通常低于**用户口径的
    # DAU，两者出现差距是口径差异、不是漏算 —— 页面用 `families_note` 说明。
    fbc, fba = exclusions.family_clause("b.family_id")
    fam_rows = query(
        "SELECT DATE(t.created_at) AS d, COUNT(DISTINCT b.family_id) AS n"
        " FROM record_timeline t JOIN baby_profile b ON b.id = t.baby_id"
        f" WHERE b.deleted_at IS NULL AND t.created_at >= %s AND t.created_at < %s{fbc}"
        " GROUP BY DATE(t.created_at) ORDER BY d",
        (start, end, *fba),
    )
    fam_by_date = {str(r["d"]): _int(r["n"]) for r in fam_rows}

    def _rolling(by_date_map: dict[str, int]) -> list[dict[str, Any]]:
        """稀疏日聚合 → **连续**日序列（含 7 日移动平均）。

        ⚠️ 缺失日期补 0 而不是跳过：否则"连续几天完全没人用"会在曲线上消失。
        7 日均线用来抑制小样本下的单日噪声（每条口径各自算，不混用）。
        """
        out: list[dict[str, Any]] = []
        cursor = (datetime.now() - timedelta(days=days - 1)).date()
        while cursor <= date.today():
            window_values = [
                by_date_map.get((cursor - timedelta(days=offset)).isoformat(), 0)
                for offset in range(7)
            ]
            out.append({
                "date": cursor.isoformat(),
                "n": by_date_map.get(cursor.isoformat(), 0),
                "ma7": round(sum(window_values) / 7, 2),
            })
            cursor += timedelta(days=1)
        return out

    series = _rolling(by_date)
    families_series = _rolling(fam_by_date)

    def _window_active(window_days: int) -> int | None:
        begin, finish = _bounds(window_days)
        row = query_one(
            f"SELECT COUNT(DISTINCT x.uid) AS n FROM {union}"
            f" WHERE {base} AND x.t >= %s AND x.t < %s",
            (*xa, begin, finish),
        )
        return _int(row.get("n"))

    # 今天（自然日）的活跃用户 / 宝宝 / 家庭
    day_start, day_end = _day_bounds()
    dau = _int(query_one(
        f"SELECT COUNT(DISTINCT x.uid) AS n FROM {union}"
        f" WHERE {base} AND x.t >= %s AND x.t < %s",
        (*xa, day_start, day_end),
    ).get("n"))

    babies_today = _int(query_one(
        "SELECT COUNT(DISTINCT t.baby_id) AS n FROM record_timeline t"
        " WHERE t.created_at >= %s AND t.created_at < %s AND EXISTS"
        " (SELECT 1 FROM baby_profile b WHERE b.id = t.baby_id AND b.deleted_at IS NULL)",
        (day_start, day_end),
    ).get("n"))

    families_today = _int(query_one(
        "SELECT COUNT(DISTINCT b.family_id) AS n FROM record_timeline t"
        " JOIN baby_profile b ON b.id = t.baby_id"
        f" WHERE b.deleted_at IS NULL AND t.created_at >= %s AND t.created_at < %s{fbc}",
        (day_start, day_end, *fba),
    ).get("n"))

    wau = _window_active(7)
    mau = _window_active(30)
    uc, ua = exclusions.user_clause("u.id")
    total_users = _int(query_one(
        f"SELECT COUNT(*) AS n FROM user_account u WHERE 1=1{uc}", tuple(ua),
    ).get("n"))

    small = total_users < int(get_settings().analytics_cfg.small_sample_users)
    sticky = None if small else _ratio(dau, mau)

    return {
        "dau": dau,
        "wau": wau,
        "mau": mau,
        "sticky": sticky,
        "small_sample": small,
        "total_users": total_users,
        "active_babies": babies_today,
        "active_families": families_today,
        "series": series,
        "families_series": families_series,
        "scope_note": (
            "活跃 = 当日产生过至少一条记录（时间取录入时刻）。"
            "只看不录的用户不计入，以下数字为「活跃下限」。"
        ),
        "families_note": (
            "活跃家庭的日曲线取自记录时间线（只有它带宝宝/家庭维度），"
            "因此不含未物化进时间线的功能（排敏观察、成长日记、报告、音箱），"
            "通常低于活跃用户 —— 两条线的差距是口径差异，不是漏算。"
        ),
    }


# ── US-04 功能使用（三视角）─────────────────────────────────────────────────

def features(window: str, days: int) -> dict[str, Any]:
    start, end = _bounds(days)
    union = _union("x")
    xc, xa = exclusions.user_clause("x.uid")
    base = f"x.uid IS NOT NULL AND x.uid <> ''{xc}"

    rows = query(
        f"SELECT x.f AS f, COUNT(*) AS n, COUNT(DISTINCT x.uid) AS users FROM {union}"
        f" WHERE {base} AND x.t >= %s AND x.t < %s GROUP BY x.f",
        (*xa, start, end),
    )
    active_users = _int(query_one(
        f"SELECT COUNT(DISTINCT x.uid) AS n FROM {union}"
        f" WHERE {base} AND x.t >= %s AND x.t < %s",
        (*xa, start, end),
    ).get("n"))

    by_func = {str(r["f"]): r for r in rows}
    # 无用户维度、只参与"条数"视角的功能（当前库里存在的：speaker_device 只有 family_id）
    count_only: dict[str, int] = {}
    for key, table, time_col in catalog.active_count_only():
        count_only[key] = _int(query_one(
            f"SELECT COUNT(*) AS n FROM {table} WHERE {time_col} >= %s AND {time_col} < %s",
            (start, end),
        ).get("n"))

    # 当前库里"有表可查"的功能 key。缺表的（如生产库没有 saved_reports）不进列表、
    # 也不当 0，而是进 `unavailable` —— 页面据此显示"本数据源无此功能数据"。
    available_keys = {func for *_, func in catalog.active_record_sources()} | set(count_only)

    items: list[dict[str, Any]] = []
    unavailable: list[dict[str, str]] = []
    for key, label in catalog.FUNCTIONS:
        if key not in available_keys:
            unavailable.append({"key": key, "label": label, "reason": "本数据源无对应表"})
            continue
        if key in count_only:
            records = count_only[key]
            users: int | None = None
        else:
            row = by_func.get(key, {})
            records = _int(row.get("n"))
            users = _int(row.get("users"))
        items.append({
            "key": key,
            "label": label,
            "records": records,
            "users": users,
            "per_user": round(records / users, 1) if users else None,
            "penetration": _ratio(users, active_users),
            "count_only": key in count_only,
        })

    total_records = sum(item["records"] for item in items)
    for item in items:
        item["share"] = _ratio(item["records"], total_records)

    items.sort(key=lambda item: catalog.FUNCTION_ORDER.get(item["key"], 99))
    return {
        "window": window,
        "window_days": days,
        "active_users": active_users,
        "total_records": total_records,
        "items": items,
        "unavailable": unavailable,
        "missing_tables": catalog.missing_tables(),
        "blind_spots": catalog.BLIND_SPOTS,
    }


def feature_trend(key: str, days: int) -> dict[str, Any]:
    """单功能趋势（功能分析页行展开用）。"""
    if key not in catalog.FUNCTION_LABEL:
        raise ValueError(f"未知功能：{key}")
    start, end = _bounds(days)
    union = _union("x")
    xc, xa = exclusions.user_clause("x.uid")
    rows = query(
        f"SELECT DATE(x.t) AS d, COUNT(*) AS n, COUNT(DISTINCT x.uid) AS users FROM {union}"
        f" WHERE x.uid IS NOT NULL AND x.uid <> ''{xc} AND x.f = %s AND x.t >= %s AND x.t < %s"
        " GROUP BY DATE(x.t) ORDER BY d",
        (*xa, key, start, end),
    )
    return {
        "key": key,
        "label": catalog.FUNCTION_LABEL[key],
        "series": [{"date": str(r["d"]), "n": _int(r["n"]), "users": _int(r["users"])} for r in rows],
    }


# ── US-05 用户清单与下钻 ────────────────────────────────────────────────────

def users_list(*, days: int, segment: str = "all", include_excluded: bool = False,
               sort: str = "last_active") -> dict[str, Any]:
    union = _union("x")
    xc, xa = exclusions.user_clause("x.uid", force_empty=include_excluded)
    uc, ua = exclusions.user_clause("u.id", force_empty=include_excluded)

    basics = query(
        "SELECT u.id AS id, u.nickname AS nickname, u.phone AS phone,"
        " u.created_at AS created_at, u.sms_verified_at AS sms_verified_at"
        f" FROM user_account u WHERE 1=1{uc}",
        tuple(ua),
    )
    start, end = _bounds(days)
    agg = query(
        f"SELECT x.uid AS uid, COUNT(*) AS total, MAX(x.t) AS last_active,"
        " COALESCE(SUM(x.t >= %s), 0) AS win_records"
        f" FROM {union} WHERE x.uid IS NOT NULL AND x.uid <> ''{xc} AND x.t < %s"
        " GROUP BY x.uid",
        (start, *xa, end),
    )
    fam_rows = query(
        "SELECT m.user_id AS uid, COUNT(DISTINCT m.family_id) AS families"
        " FROM family_member m JOIN family_group g ON g.id = m.family_id"
        " WHERE g.deleted_at IS NULL GROUP BY m.user_id"
    )
    baby_rows = query(
        "SELECT m.user_id AS uid, COUNT(DISTINCT b.id) AS babies"
        " FROM family_member m JOIN baby_profile b ON b.family_id = m.family_id"
        " WHERE b.deleted_at IS NULL GROUP BY m.user_id"
    )

    agg_by = {str(r["uid"]): r for r in agg}
    fam_by = {str(r["uid"]): _int(r["families"]) for r in fam_rows}
    baby_by = {str(r["uid"]): _int(r["babies"]) for r in baby_rows}
    excluded_ids = set(exclusions.effective()["users"])

    items: list[dict[str, Any]] = []
    for row in basics:
        uid = str(row["id"])
        stat = agg_by.get(uid, {})
        last_active = str(stat.get("last_active") or "") or None
        items.append({
            "id": uid,
            "nickname": str(row.get("nickname") or ""),
            "phone_masked": _mask_phone(row.get("phone")),
            "created_at": str(row.get("created_at") or ""),
            "sms_verified": bool(row.get("sms_verified_at")),
            "families": fam_by.get(uid, 0),
            "babies": baby_by.get(uid, 0),
            "records_total": _int(stat.get("total")),
            "records_window": _int(stat.get("win_records")),
            "last_active": last_active,
            "segment": _segment_of(last_active),
            "excluded": uid in excluded_ids,
        })

    if segment and segment != "all":
        items = [item for item in items if item["segment"] == segment]

    if sort == "records":
        items.sort(key=lambda item: (-item["records_total"], item["nickname"]))
    else:
        # 最后活跃倒序；**从未记录过的排在末尾**（而不是混在中间当作"很久以前"）
        with_activity = [item for item in items if item["last_active"]]
        never = [item for item in items if not item["last_active"]]
        with_activity.sort(key=lambda item: item["last_active"], reverse=True)
        never.sort(key=lambda item: item["nickname"])
        items = with_activity + never

    return {"items": items, "total": len(items)}


def user_detail(user_id: str, days: int = 90) -> dict[str, Any]:
    basic = query_one(
        "SELECT id, nickname, phone, created_at, sms_verified_at FROM user_account WHERE id = %s",
        (user_id,),
    )
    if not basic:
        raise ValueError("用户不存在")

    union = _union("x")
    start, end = _bounds(days)
    families = query(
        "SELECT g.id AS id, g.name AS name, g.created_at AS created_at"
        " FROM family_member m JOIN family_group g ON g.id = m.family_id"
        " WHERE m.user_id = %s AND g.deleted_at IS NULL ORDER BY g.created_at",
        (user_id,),
    )
    babies = query(
        "SELECT b.id AS id, b.name AS name, b.birth_date AS birth_date, b.family_id AS family_id"
        " FROM baby_profile b WHERE b.deleted_at IS NULL AND b.family_id IN"
        " (SELECT family_id FROM family_member WHERE user_id = %s)",
        (user_id,),
    )
    funcs = query(
        f"SELECT x.f AS f, COUNT(*) AS n FROM {union}"
        " WHERE x.uid = %s AND x.t >= %s AND x.t < %s GROUP BY x.f",
        (user_id, start, end),
    )
    daily = query(
        f"SELECT DATE(x.t) AS d, COUNT(*) AS n FROM {union}"
        " WHERE x.uid = %s AND x.t >= %s AND x.t < %s GROUP BY DATE(x.t) ORDER BY d",
        (user_id, start, end),
    )
    totals = query_one(
        f"SELECT COUNT(*) AS n, MAX(x.t) AS last_active FROM {union} WHERE x.uid = %s",
        (user_id,),
    )

    func_map = {str(r["f"]): _int(r["n"]) for r in funcs}
    return {
        "id": user_id,
        "nickname": str(basic.get("nickname") or ""),
        "phone_masked": _mask_phone(basic.get("phone")),
        "created_at": str(basic.get("created_at") or ""),
        "sms_verified": bool(basic.get("sms_verified_at")),
        "records_total": _int(totals.get("n")),
        "last_active": str(totals.get("last_active") or "") or None,
        "segment": _segment_of(str(totals.get("last_active") or "") or None),
        "families": [
            {"id": str(f["id"]), "name": str(f.get("name") or ""), "created_at": str(f.get("created_at") or "")}
            for f in families
        ],
        "babies": [
            {"id": str(b["id"]), "name": str(b.get("name") or ""),
             "birth_date": str(b.get("birth_date") or ""), "family_id": str(b.get("family_id") or "")}
            for b in babies
        ],
        "functions": [
            {"key": key, "label": label, "records": func_map.get(key, 0)}
            for key, label in catalog.FUNCTIONS if func_map.get(key, 0) > 0
        ],
        "series": [{"date": str(r["d"]), "n": _int(r["n"])} for r in daily],
        "window_days": days,
    }


# ── US-06 新老与留存（含样本量）──────────────────────────────────────────────

def retention() -> dict[str, Any]:
    """按注册周 cohort 计算次日 / 7 日"记录留存"。

    ⚠️ 口径局限必须随数据一起给出：这是**记录留存**（注册后第 N 日产生了记录），
    不是登录留存 —— 只看不录的用户会被算成"未留存"，故真实留存更高。
    每个 cohort 必须同时返回样本数 `n`：29 用户量级下 n 可能只有 1~2，比例没有统计意义。
    """
    uc, ua = exclusions.user_clause("id")
    users = query(
        f"SELECT id, nickname, created_at FROM user_account WHERE 1=1{uc}", tuple(ua)
    )
    union = _union("x")
    xc, xa = exclusions.user_clause("x.uid")
    acts = query(
        f"SELECT DISTINCT x.uid AS uid, DATE(x.t) AS d FROM {union}"
        f" WHERE x.uid IS NOT NULL AND x.uid <> ''{xc}",
        tuple(xa),
    )
    active_days: dict[str, set[str]] = {}
    for row in acts:
        active_days.setdefault(str(row["uid"]), set()).add(str(row["d"]))

    min_sample = 3
    today = date.today()
    cohorts: dict[str, dict[str, Any]] = {}
    for row in users:
        uid = str(row["id"])
        created = row.get("created_at")
        if not created:
            continue
        reg = created.date() if isinstance(created, datetime) else date.fromisoformat(str(created)[:10])
        key = f"{reg.isocalendar().year}-W{reg.isocalendar().week:02d}"
        bucket = cohorts.setdefault(key, {
            "week": key, "start": reg.isoformat(), "n": 0, "d1": 0, "d7": 0,
            # 「已到期」人数：注册日 +N 天还没到的用户**无法观测**，不能算作"未留存"
            "d1_eligible": 0, "d7_eligible": 0,
        })
        bucket["n"] += 1
        days_set = active_days.get(uid, set())
        d1_date, d7_date = reg + timedelta(days=1), reg + timedelta(days=7)
        if d1_date <= today:
            bucket["d1_eligible"] += 1
            if d1_date.isoformat() in days_set:
                bucket["d1"] += 1
        if d7_date <= today:
            bucket["d7_eligible"] += 1
            if d7_date.isoformat() in days_set:
                bucket["d7"] += 1
        bucket["start"] = min(bucket["start"], reg.isoformat())

    ordered = [cohorts[key] for key in sorted(cohorts)]
    for bucket in ordered:
        # ⚠️ 比率只在**样本足够**且**该 horizon 已到期**时给出，否则为 None（页面显示"样本不足"/"—"）。
        #    之前这里漏了门禁，导致 n=1 的 cohort 也输出 d7_rate=1.0 —— 在 29 用户量级下
        #    这种数字会被当成真实留存读走，是必须掐掉的误导来源。
        bucket["small_sample"] = bucket["n"] < min_sample
        bucket["d1_mature"] = bucket["d1_eligible"] == bucket["n"]
        bucket["d7_mature"] = bucket["d7_eligible"] == bucket["n"]
        bucket["d1_rate"] = (
            _ratio(bucket["d1"], bucket["n"])
            if (not bucket["small_sample"] and bucket["d1_mature"]) else None
        )
        bucket["d7_rate"] = (
            _ratio(bucket["d7"], bucket["n"])
            if (not bucket["small_sample"] and bucket["d7_mature"]) else None
        )

    # 回流：沉睡 ≥14 天后再次产生记录的用户数（此处按"活跃日集合里存在 ≥14 天空档"计数）
    returning = 0
    for days_set in active_days.values():
        ordered_days = sorted(days_set)
        for previous, current in zip(ordered_days, ordered_days[1:]):
            gap = (date.fromisoformat(current) - date.fromisoformat(previous)).days
            if gap >= 14:
                returning += 1
                break

    return {
        "cohorts": ordered,
        "returning": returning,
        "scope_note": "本留存是「记录留存」（注册后第 N 日产生了记录），不是登录留存；只看不录的用户会被算作未留存。",
        "min_sample": min_sample,
        "today": today.isoformat(),
    }


# ── US-01 数据源自检（含 timeline 一致性对账）────────────────────────────────

def health() -> dict[str, Any]:
    """连通性 + 规模 + **一致性对账**。

    对账把 `record_timeline` 与业务表的行数差异如实展示 —— 这条差异本身就是
    "为什么功能指标不取 timeline"的解释（实测 sleep 类多 14 行孤儿）。
    """
    from .reader import server_info

    info = server_info()
    have = catalog.existing_tables()
    counts = {
        "users": _int(query_one("SELECT COUNT(*) AS n FROM user_account").get("n")),
        "families": _int(query_one(
            "SELECT COUNT(*) AS n FROM family_group WHERE deleted_at IS NULL").get("n")),
        "babies": _int(query_one(
            "SELECT COUNT(*) AS n FROM baby_profile WHERE deleted_at IS NULL").get("n")),
        "timeline": _int(query_one("SELECT COUNT(*) AS n FROM record_timeline").get("n")),
    }

    timeline_rows = query(
        "SELECT source_type AS s, COUNT(*) AS n FROM record_timeline GROUP BY source_type"
    )
    timeline_by = {str(r["s"]): _int(r["n"]) for r in timeline_rows}

    reconcile: list[dict[str, Any]] = []
    for source_type, tables in catalog.RECONCILE:
        present = [t for t in tables if t in have]
        business = sum(
            _int(query_one(f"SELECT COUNT(*) AS n FROM {t}").get("n")) for t in present
        )
        timeline_count = timeline_by.get(source_type, 0)
        reconcile.append({
            "source_type": source_type,
            "label": catalog.FUNCTION_LABEL.get(source_type, source_type),
            "timeline": timeline_count,
            "business": business,
            "diff": timeline_count - business,
            "tables": tables,
            "missing_tables": [t for t in tables if t not in have],
        })

    # 时间线覆盖度：有业务表但没物化进 `record_timeline` 的功能（如实说明，避免误读为"没用过"）
    no_timeline = [
        {"key": key, "label": catalog.FUNCTION_LABEL.get(key, key)}
        for key in catalog.NO_TIMELINE_FUNCTIONS
    ]

    excl = exclusions.effective()
    return {
        "server": info,
        "counts": counts,
        "reconcile": reconcile,
        "reconcile_note": (
            "功能指标一律取业务表口径；时间线表的差异（timeline 多于业务表）通常是"
            "记录被物理删除后残留的孤儿行。"
        ),
        "tables": {"total": len(have), "missing": catalog.missing_tables()},
        "no_timeline_functions": no_timeline,
        "exclusions": {
            "users": len(excl["users"]),
            "families": len(excl["families"]),
            "patterns": len(excl["nickname_patterns"]),
            "pattern_hits": len(excl["pattern_hits"]),
            "fingerprint": excl["fingerprint"],
            "warning": excl["warning"],
        },
        "metric_version": catalog.METRIC_VERSION,
        "handler_ok": True,
    }


def recent_days_summary() -> dict[str, Any]:
    """近 1 / 7 / 30 天记录条数（活跃卡片的辅助口径，轻量单表查询）。"""
    out: dict[str, int] = {}
    for label, days in (("d1", 1), ("d7", 7), ("d30", 30)):
        start, end = _bounds(days)
        out[label] = _int(query_one(
            "SELECT COUNT(*) AS n FROM record_timeline WHERE created_at >= %s AND created_at < %s",
            (start, end),
        ).get("n"))
    return out


def mask_phone_for_display(phone: Any) -> str:
    """给路由层复用的脱敏函数（保持单一实现）。"""
    return _mask_phone(phone)
