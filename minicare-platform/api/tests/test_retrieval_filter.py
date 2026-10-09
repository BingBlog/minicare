"""回归测试：前缀过滤必须走参数绑定（真实 bug，2026-10-03 接库后暴露）

现象：接上数据库后，`/api/contract/validate` 的两个探针都报
    unsupported format character "'" (0x27) at index 203

根因：`retrieval_filter()` 返回的 SQL 片段里含**字面 `%`**（`content NOT LIKE '[待复核]%'`），
而 `retrieve()` 会把它连同其它条件一起交给 `cur.execute(sql, args)`。pymysql 在 `args`
非空时执行 `query % args`，于是 SQL 里残留的 `%` 被当成格式符去解析，撞上下一个字符 `'`
就抛 `unsupported format character`。

为什么长期没暴露：数据库不可达时整条检索路径被 try/except 兜成「检索不可用」，
这个格式化错误与「连不上库」长得几乎一样，只有真正连上库才会显形。
"""
from kb_pipeline.retrieval import retrieval_filter
from kb_pipeline.store.knowledge_base import REVIEW_PREFIX


def test_legacy_filter_has_no_bare_percent() -> None:
    """SQL 里除占位符 `%s` 外不得出现任何 `%`，否则 pymysql 参数化必然出错"""
    sql, args = retrieval_filter(with_status_column=False)
    leftover = sql.replace("%s", "")
    assert "%" not in leftover, f"SQL 残留字面 %：{sql!r}"
    assert args == (REVIEW_PREFIX + "%",), "前缀必须以绑定参数形式传入"


def test_legacy_filter_survives_pymysql_formatting() -> None:
    """直接复现 pymysql 的 `query % args`：修复前这一步会抛 unsupported format character"""
    sql, args = retrieval_filter(with_status_column=False)
    formatted = sql % tuple(args)          # 不抛异常即通过
    assert REVIEW_PREFIX in formatted
    assert "NOT LIKE" in formatted


def test_status_column_filter_takes_no_args() -> None:
    """迁移 021 之后的分支：用字段过滤，天然没有 `%` 问题"""
    sql, args = retrieval_filter(with_status_column=True)
    assert "retrieval_status='enabled'" in sql
    assert args == ()
    assert "%" not in sql.replace("%s", "")


# ── 参数顺序 ────────────────────────────────────────────────────────────────
# 第二个同源缺陷：FTS 语句有三个占位符（SELECT 的 AGAINST / WHERE 的 NOT LIKE /
# WHERE 的 AGAINST），把过滤条件绑到第 0 个位置上，就等于执行
# `content NOT LIKE '<查询词>'` —— review 条目直接泄漏，同时 ORDER BY 的相关度也变成
# 对错误字符串打分。这类错位不会报 SQL 语法错，只会静默返回错结果，必须用断言钉住。


class _StubCursor:
    def __init__(self, log: list) -> None:
        self.log = log
        self.description: list = []

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, args=None):
        self.log.append((sql, args))

    def fetchall(self):
        return []

    def fetchone(self):
        return None


class _StubConn:
    def __init__(self) -> None:
        self.log: list = []

    def cursor(self):
        return _StubCursor(self.log)

    def close(self) -> None:
        pass


def test_fts_placeholder_args_are_aligned() -> None:
    """FTS 语句的每个占位符都要拿到"对得上"的参数"""
    from kb_pipeline.config import load_settings
    from kb_pipeline.retrieval import retrieve

    conn = _StubConn()
    query = "宝宝便血怎么办"
    retrieve(load_settings(env_file=""), query, top_k=10, with_conn=conn)

    fts = [(sql, args) for sql, args in conn.log if "NOT LIKE" in sql]
    assert fts, "没有捕获到 FTS 语句"
    sql, args = fts[0]
    args = tuple(args or ())

    assert sql.count("%s") == len(args), f"占位符 {sql.count('%s')} 个但参数 {len(args)} 个：{args}"

    # 过滤条件必须落在 `NOT LIKE %s` 那个占位符上
    pos = sql.index("NOT LIKE %s")
    ordinal = sql[:pos].count("%s")
    assert args[ordinal] == REVIEW_PREFIX + "%", f"过滤条件绑错位置：args={args}"
    assert args[0] == query and args[-1] == query, f"两个 AGAINST 都应是查询词：args={args}"
