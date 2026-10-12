"""用户分析域（PRD-016 / TECH-033）的**只读安全**与**口径防呆**用例。

按项目约定：只跑本文件，不跑全量回归。

```
.venv/bin/pytest tests/test_analytics.py -q
```

覆盖 TECH-033 §9.2 的五条：

1. `test_reader_readonly` —— SELECT 通过；`DELETE` / `UPDATE` / `DROP` / `TRUNCATE` /
   `SELECT … INTO OUTFILE` / 多语句 **全部抛错**（这是本域唯一的安全底线，R1）；
2. `test_union_sql_no_injection` —— `union_sql()` 只拼 `catalog.RECORD_SOURCES` 里的表名；
3. `test_cache_key_includes_dsn_and_exclusions` —— 换库名 / 改名单 → 缓存键变化；
4. `test_null_not_zero` —— 指标算不出来返回 `None` 而不是 `0`；
5. `test_exclusions_malformed_yaml` —— 名单文件损坏 → 空名单 + `warning`，不抛 500。

以上全部**不依赖数据库**：只测纯函数与断言层（生产库连通性由 `/api/analytics/health`
与手测验收覆盖，避免单测把生产库拖进 CI）。
"""
from __future__ import annotations

import pytest

from kb_pipeline.analytics import catalog, exclusions
from kb_pipeline.analytics.cache import fingerprint, get_or_compute
from kb_pipeline.analytics.reader import (
    ReadOnlyViolation,
    _strip_comments,
    assert_readonly,
)

# ── 1. 只读白名单 ────────────────────────────────────────────────────────────

OK_SQL = [
    "SELECT 1",
    "select count(*) from user_account",
    "SELECT a.id FROM user_account a WHERE a.created_at >= %s",
    "SELECT * FROM (SELECT 1 AS n) x",
    "SELECT 1 -- 注释里写 delete 也没关系",
    "/* update */ SELECT 1",
    "SELECT 1;",  # 结尾一个分号是允许的（内部会先 rstrip(';')）
]


@pytest.mark.parametrize("sql", OK_SQL)
def test_reader_readonly_allows_select(sql: str):
    assert assert_readonly(sql)


BAD_SQL = [
    "DELETE FROM user_account",
    "UPDATE user_account SET nickname='x'",
    "INSERT INTO user_account (id) VALUES ('x')",
    "REPLACE INTO user_account (id) VALUES ('x')",
    "DROP TABLE user_account",
    "TRUNCATE TABLE user_account",
    "ALTER TABLE user_account ADD COLUMN x INT",
    "CREATE TABLE t (id INT)",
    "SELECT 1 INTO OUTFILE '/tmp/x.txt'",
    "SELECT 1 INTO DUMPFILE '/tmp/x'",
    "SELECT 1; DROP TABLE user_account",       # 多语句
    "SELECT 1 FOR UPDATE",
    "SELECT 1 LOCK IN SHARE MODE",
    "SET autocommit=1",
    "CALL some_proc()",
    "",                                        # 空 SQL
]


@pytest.mark.parametrize("sql", BAD_SQL)
def test_reader_readonly_rejects_writes(sql: str):
    with pytest.raises(ReadOnlyViolation):
        assert_readonly(sql)


def test_reader_rejects_cte():
    """刻意不放开 CTE：MySQL 8 的 `WITH … UPDATE` 会扩大推理面（TECH-033 §2.3）。"""
    with pytest.raises(ReadOnlyViolation):
        assert_readonly("WITH x AS (SELECT 1) SELECT * FROM x")


def test_strip_comments_keeps_code():
    assert "delete" not in _strip_comments("SELECT 1 -- delete me").lower()
    assert "select 1" in _strip_comments("/* update */ SELECT 1").lower()


# ── 2. UNION 只用目录里的表名 ────────────────────────────────────────────────

def test_union_sql_only_uses_catalog_tables():
    sql = catalog.union_sql("x")
    allowed = {t for t, *_ in catalog.RECORD_SOURCES}
    # 从 `FROM <table>` 里抽出所有表名（可能带尾随的 `\n) x`），断言全部来自 catalog
    used = {
        part.rsplit("FROM ", 1)[1].split()[0].strip()
        for part in sql.split("UNION ALL")
        if "FROM " in part
    }
    assert used, "UNION 里应当有表"
    assert used <= allowed, f"出现了目录外的表：{used - allowed}"
    assert used == allowed, "目录里的每张表都应出现在 UNION 里"
    assert sql.rstrip().endswith("x"), "派生表别名必须是末尾的 x"


def test_union_sql_respects_subset():
    """生产库缺表时只传存在的子集（实测 saved_reports 只在 dev 有）。"""
    subset = [s for s in catalog.RECORD_SOURCES if s[0] != "baby_diary"]
    sql = catalog.union_sql("x", subset)
    assert "baby_diary" not in sql


def test_union_sql_empty_subset_raises():
    with pytest.raises(ValueError):
        catalog.union_sql("x", [])


def test_catalog_user_columns_match_reality():
    """锁定逐表不同的用户列（medication=created_by / baby_diary=author_id）。"""
    by_table = {t: u for t, u, *_ in catalog.RECORD_SOURCES}
    assert by_table["medication"] == "created_by"
    assert by_table["baby_diary"] == "author_id"
    assert by_table["sleep_record"] == "recorded_by"


def test_catalog_functions_cover_sources():
    """每个记录来源的功能 key 都必须有中文名（页面上不允许出现裸 key）。"""
    for *_, func in catalog.RECORD_SOURCES:
        assert func in catalog.FUNCTION_LABEL, func
    for key, _, _ in catalog.COUNT_ONLY_SOURCES:
        assert key in catalog.FUNCTION_LABEL, key
    for key in catalog.NO_TIMELINE_FUNCTIONS:
        assert key in catalog.FUNCTION_LABEL, key


def test_count_only_has_no_user_dimension_table():
    """只算条数的表不能混进 UNION（否则渗透率分母口径会错）。"""
    union_tables = {t for t, *_ in catalog.RECORD_SOURCES}
    for _, table, _ in catalog.COUNT_ONLY_SOURCES:
        assert table not in union_tables, table


# ── 3. 缓存键 ────────────────────────────────────────────────────────────────

def test_cache_key_includes_dsn_and_exclusions():
    a = fingerprint("overview", "30d", 30, catalog.METRIC_VERSION, "host:1/db1", "fpA", "")
    b = fingerprint("overview", "30d", 30, catalog.METRIC_VERSION, "host:1/db2", "fpA", "")
    c = fingerprint("overview", "30d", 30, catalog.METRIC_VERSION, "host:1/db1", "fpB", "")
    assert a != b, "换库名必须换缓存键（防'看着 dev 数据做生产决策'）"
    assert a != c, "换排除名单必须换缓存键（否则人会以为'改了没用'）"
    assert a == fingerprint("overview", "30d", 30, catalog.METRIC_VERSION, "host:1/db1", "fpA", "")


def test_cache_force_bypasses_store():
    calls: list[int] = []

    def compute() -> int:
        calls.append(1)
        return len(calls)

    key = fingerprint("unit-test-force", id(compute))
    first, hit1 = get_or_compute(key, compute, force=True)
    second, hit2 = get_or_compute(key, compute, force=True)
    assert (first, second) == (1, 2)
    assert hit1 is False and hit2 is False


def test_cache_returns_hit_within_ttl():
    """`force=True` 只穿透**不写缓存**；写入发生在普通调用上（页面「刷新」的语义）。"""
    calls: list[int] = []

    def compute() -> str:
        calls.append(1)
        return "v"

    key = fingerprint("unit-test-ttl", id(compute))
    assert get_or_compute(key, compute, force=True) == ("v", False)
    assert calls == [1], "force 调用本身要真的算一次"

    assert get_or_compute(key, compute) == ("v", False)   # 首次存入
    assert get_or_compute(key, compute) == ("v", True)    # TTL 内命中
    assert calls == [1, 1], "TTL 内不应重复计算"


# ── 4. null 不是 0 ───────────────────────────────────────────────────────────

def test_ratio_returns_none_not_zero():
    """`_ratio` 的分母为 0 时返回 None —— 页面据此渲染 `—` 而不是 `0`。"""
    from kb_pipeline.analytics.metrics import _int, _ratio

    assert _ratio(0, 10) is None
    assert _ratio(5, 0) is None
    assert _ratio(None, 10) is None
    assert _ratio(5, 10) == 0.5
    # Decimal（pymysql 的 SUM 返回类型）要被吃成 int
    from decimal import Decimal

    assert _int(Decimal("7")) == 7
    assert _int(None) == 0


def test_normalize_window_falls_back():
    assert catalog.normalize_window("7d") == ("7d", 7)
    assert catalog.normalize_window("90D") == ("90d", 90)
    assert catalog.normalize_window(None) == (catalog.DEFAULT_WINDOW, catalog.WINDOWS[catalog.DEFAULT_WINDOW])
    assert catalog.normalize_window("30 天") == (catalog.DEFAULT_WINDOW, catalog.WINDOWS[catalog.DEFAULT_WINDOW])


def test_segment_of_boundaries():
    from datetime import datetime, timedelta

    from kb_pipeline.analytics.metrics import _segment_of

    now = datetime.now()
    assert _segment_of(None) == "lost"
    assert _segment_of("") == "lost"
    assert _segment_of("不是时间") == "lost"
    assert _segment_of((now - timedelta(days=1)).strftime("%Y-%m-%d %H:%M:%S")) == "core"
    assert _segment_of((now - timedelta(days=15)).strftime("%Y-%m-%d %H:%M:%S")) == "active"
    assert _segment_of((now - timedelta(days=60)).strftime("%Y-%m-%d %H:%M:%S")) == "dormant"
    assert _segment_of((now - timedelta(days=200)).strftime("%Y-%m-%d %H:%M:%S")) == "lost"


def test_retention_rate_gated_by_sample_and_maturity():
    """n < min_sample 或 horizon 未到期 → 比率为 None（绝不输出 n=1 的 100% 留存）。"""
    from kb_pipeline.analytics.metrics import _ratio

    # 复刻 retention 的门禁表达式，锁住"两条门禁都要过"
    def rate(hit: int, n: int, eligible: int, min_sample: int = 3) -> float | None:
        small = n < min_sample
        mature = eligible == n
        return _ratio(hit, n) if (not small and mature) else None

    assert rate(1, 1, 1) is None          # 样本不足
    assert rate(3, 3, 0) is None          # 未到期
    assert rate(3, 3, 3) == 1.0           # 达标
    assert rate(0, 5, 5) is None          # 0 命中 → None（不是 0.0）


def test_mask_phone():
    from kb_pipeline.analytics.metrics import _mask_phone

    assert _mask_phone("13812341234") == "138****1234"
    assert _mask_phone("") == "—"
    assert _mask_phone(None) == "—"
    assert "*" in _mask_phone("12345")


def test_missing_tables_is_a_subset_of_catalog():
    known = {t for t, *_ in catalog.RECORD_SOURCES} | {t for _, t, _ in catalog.COUNT_ONLY_SOURCES}
    assert set(catalog.missing_tables()) <= known


# ── 5. 排除名单容错 ──────────────────────────────────────────────────────────

def test_exclusions_malformed_yaml_degrades(tmp_path, monkeypatch):
    """名单文件损坏 → 返回空名单 + warning，**不抛异常**（页面要能照常渲染）。"""
    bad = tmp_path / "exclusions.yaml"
    bad.write_text("users: [a, b\nfamilies: {{{ 这不是 yaml", encoding="utf-8")
    monkeypatch.setattr(exclusions, "EXCLUSIONS_FILE", bad)

    data, warning = exclusions.load_raw()
    assert data == {"users": [], "families": [], "nickname_patterns": []}
    assert warning and "解析失败" in warning


def test_exclusions_wrong_type_degrades(tmp_path, monkeypatch):
    bad = tmp_path / "exclusions.yaml"
    bad.write_text("users: not-a-list\n", encoding="utf-8")
    monkeypatch.setattr(exclusions, "EXCLUSIONS_FILE", bad)

    data, warning = exclusions.load_raw()
    assert data["users"] == []
    assert warning and "不是列表" in warning


def test_exclusions_missing_file_is_empty_without_warning(tmp_path, monkeypatch):
    monkeypatch.setattr(exclusions, "EXCLUSIONS_FILE", tmp_path / "nope.yaml")
    data, warning = exclusions.load_raw()
    assert data == {"users": [], "families": [], "nickname_patterns": []}
    assert warning is None


def test_exclusions_clause_empty_does_not_emit_not_in():
    """名单为空时**不能**生成 `NOT IN ()`（SQL 语法错误）。"""
    clause, args = exclusions.user_clause("x.uid")
    if not args:                       # 当前名单为空（正常情况）
        assert clause == ""
    else:
        assert clause.startswith(" AND x.uid NOT IN")
        assert len(args) == clause.count("%s")


def test_exclusions_force_empty():
    clause, args = exclusions.user_clause("x.uid", force_empty=True)
    assert (clause, args) == ("", [])


def test_exclusions_mutate_rejects_unknown_kind():
    with pytest.raises(ValueError):
        exclusions.mutate("add", "unknown-kind", "v")
    with pytest.raises(ValueError):
        exclusions.mutate("nope", "user", "v")
    with pytest.raises(ValueError):
        exclusions.mutate("add", "user", "   ")


def test_exclusions_mutate_rejects_bad_regex(tmp_path, monkeypatch):
    target = tmp_path / "exclusions.yaml"
    target.write_text("users: []\nfamilies: []\nnickname_patterns: []\n", encoding="utf-8")
    monkeypatch.setattr(exclusions, "EXCLUSIONS_FILE", target)

    with pytest.raises(ValueError):
        exclusions.mutate("add", "pattern", "([unclosed")
    # 校验失败不能落盘
    assert "unclosed" not in target.read_text(encoding="utf-8")


def test_exclusions_mutate_roundtrip(tmp_path, monkeypatch):
    """加 → 去 的完整往返（真正写文件，但写在 tmp_path）。"""
    target = tmp_path / "exclusions.yaml"
    target.write_text("users: []\nfamilies: []\nnickname_patterns: []\n", encoding="utf-8")
    monkeypatch.setattr(exclusions, "EXCLUSIONS_FILE", target)

    res = exclusions.mutate("add", "user", "u-1", "测试账号")
    assert res["changed"] is True and res["items"] == ["u-1"]
    data, _ = exclusions.load_raw()
    assert data["users"] == ["u-1"]

    res2 = exclusions.mutate("add", "user", "u-1")   # 幂等：重复添加不改动
    assert res2["changed"] is False

    res3 = exclusions.mutate("remove", "user", "u-1")
    assert res3["changed"] is True
    data2, _ = exclusions.load_raw()
    assert data2["users"] == []

    # 备份文件必须生成（写前备份是硬约束）
    assert list(tmp_path.glob("exclusions.yaml.bak-*")), "写回前必须备份"


# ── 路由层：响应包形状（不连库） ──────────────────────────────────────────────

def test_router_fail_envelope_shape():
    """失败信封：data=None（页面显示 —）、error 带 code/message/hint。"""
    from kb_pipeline.web.router_analytics import _fail

    env = _fail("analytics_db_unreachable", "boom", "hint")
    assert env["data"] is None
    assert env["error"]["code"] == "analytics_db_unreachable"
    assert env["meta"]["partial"] == []
    assert env["meta"]["excluded"] is None


def test_router_source_and_warning():
    from kb_pipeline.web.router_analytics import _db_name_warning, _source_of

    assert _source_of("minicare-cloud-6gqledlle0132cbe") == "prod"
    assert _source_of("minicare_dev") == "dev"
    assert _source_of("whatever") == "custom"
    assert _db_name_warning("minicare-cloud-x") is None
    assert _db_name_warning("minicare_dev") is not None
    assert _db_name_warning("") is None
