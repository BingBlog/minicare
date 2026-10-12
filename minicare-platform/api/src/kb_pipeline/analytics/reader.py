"""分析域的**唯一只读出口**（TECH-033 §2）。

这是整个域唯一执行 SQL 的地方，也是唯一的"写风险面"，因此三道约束写死在代码里：

1. `assert_readonly()` —— 必须 `SELECT` 开头、单语句、无写关键字（含 `INTO OUTFILE`）。
   违反直接抛错，**不做兜底降级**：这是开发期错误，必须炸出来。
2. 连接只读 `settings.analytics_db_*`（独立配置组），**绝不触碰** `settings.db_*` ——
   后者可写且仅指向 dev 库（`/api/publish/rollback` 会对它做无闸门全表清空）。
3. 不提供 `execute` / `executemany` 等写入口，`autocommit=True` 且只跑 SELECT。

⚠️ 失败语义：连不上/超时一律抛 `AnalyticsUnavailable` → 路由层转 503 → 页面显示 `—`。
**绝不返回 0** —— 历史踩坑：DB 连不上时页面显示 0 行，被误读成"没有数据"。
"""
from __future__ import annotations

import re
from typing import Any, Sequence

from ..config import get_settings


class AnalyticsUnavailable(RuntimeError):
    """数据源不可用（未配置 / 连不上 / 超时）。"""


class ReadOnlyViolation(RuntimeError):
    """SQL 违反只读白名单（开发期错误）。"""


# 写关键字与危险子句。`\bset\b` 一并禁掉：SELECT ... SET 之类不存在，留着反而扩大推理面。
_FORBIDDEN = re.compile(
    r"\b(insert|update|delete|replace|drop|alter|create|truncate|rename|grant|revoke"
    r"|call|load|lock|unlock|set|commit|rollback|prepare|execute|handler|do"
    r"|into\s+outfile|into\s+dumpfile|for\s+update|lock\s+in\s+share\s+mode)\b",
    re.IGNORECASE,
)

_COMMENT_BLOCK = re.compile(r"/\*.*?\*/", re.DOTALL)
_COMMENT_LINE = re.compile(r"(?:--|#)[^\n]*")


def _strip_comments(sql: str) -> str:
    return _COMMENT_LINE.sub(" ", _COMMENT_BLOCK.sub(" ", sql))


def assert_readonly(sql: str) -> str:
    """只读白名单断言：通过则返回规范化后的 SQL，否则抛 `ReadOnlyViolation`。

    刻意**不放开** `WITH`（CTE）：MySQL 8 允许 `WITH … UPDATE`，开放 CTE 会扩大推理面，
    而本域全部指标用"单表聚合 + UNION 派生表"即可表达。
    """
    s = _strip_comments(sql).strip().rstrip(";").strip()
    if not s:
        raise ReadOnlyViolation("空 SQL")
    if not s.lower().startswith("select"):
        raise ReadOnlyViolation(f"分析域只允许 SELECT 开头：{s[:60]}…")
    if ";" in s:
        raise ReadOnlyViolation("分析域只允许单条语句（检测到分号）")
    if (m := _FORBIDDEN.search(s)):
        raise ReadOnlyViolation(f"分析域拒绝写关键字：{m.group(0)}")
    return s


def dsn() -> str:
    """当前分析库的 DSN 指纹串（不含口令）—— 用于缓存键与"数据源身份"比较。"""
    s = get_settings()
    return f"{s.analytics_db_host}:{s.analytics_db_port}/{s.analytics_db_name}"


def _dsn_key() -> str:
    """内部别名（`metrics` 的按库缓存用；语义与 `dsn()` 完全一致）。"""
    return dsn()


def _connect():
    """建立只读连接。配置缺失/连不上 → `AnalyticsUnavailable`（带可操作提示）。"""
    s = get_settings()
    if not s.analytics_db_host or not s.analytics_db_name:
        raise AnalyticsUnavailable(
            "未配置分析数据库连接（ANALYTICS_DB_HOST / ANALYTICS_DB_NAME）——"
            "请到「全局配置 → 用户分析」填写"
        )
    import pymysql
    from pymysql.cursors import DictCursor

    try:
        return pymysql.connect(
            host=s.analytics_db_host,
            port=s.analytics_db_port,
            user=s.analytics_db_user,
            password=s.analytics_db_password,
            database=s.analytics_db_name,      # ⚠️ 是 database=（新名），不是 db=
            charset="utf8mb4",
            cursorclass=DictCursor,
            connect_timeout=5,
            read_timeout=max(1, round(s.analytics_cfg.query_timeout_ms / 1000)),
            autocommit=True,
        )
    except Exception as exc:  # noqa: BLE001 —— 统一收敛为域内异常，路由层转 503
        raise AnalyticsUnavailable(
            f"分析数据库连接失败（{s.analytics_db_host}:{s.analytics_db_port}/"
            f"{s.analytics_db_name}）：{exc}"
        ) from exc


def query(sql: str, args: Sequence[Any] | None = None) -> list[dict]:
    """执行只读查询并返回行列表（DictCursor）。

    ⚠️ pymysql 在 `args` 非空时会执行 `query % args` —— SQL 里**不能出现裸 `%`**
    （如 `DATE_FORMAT(x,'%x-W%v')` 会被当成格式符解析，见 `retrieval.py:59` 的同款留档）。
    本域因此用 `YEARWEEK(col, 3)` 做周聚合（无 `%`）。
    """
    safe = assert_readonly(sql)
    conn = _connect()
    try:
        with conn.cursor() as cur:
            cur.execute(safe, args or None)
            return list(cur.fetchall())
    except Exception as exc:  # noqa: BLE001
        if isinstance(exc, (AnalyticsUnavailable, ReadOnlyViolation)):
            raise
        raise AnalyticsUnavailable(f"分析查询失败：{exc}") from exc
    finally:
        conn.close()


def query_one(sql: str, args: Sequence[Any] | None = None) -> dict:
    rows = query(sql, args)
    return rows[0] if rows else {}


def server_info() -> dict:
    """连通性自检：库名 / 版本 / 服务器时间（key 名与页面页脚一致）。"""
    row = query_one("SELECT DATABASE() AS db, VERSION() AS version, NOW() AS now")
    s = get_settings()
    return {
        "db_name": row.get("db") or s.analytics_db_name,
        "server_version": row.get("version"),
        "server_time": str(row.get("now") or ""),
        "expected_db": s.analytics_db_name,
        "dsn": dsn(),
    }
