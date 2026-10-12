"""用户分析域的映射表与口径常量 —— **单一事实源**。

本文件是"数据长什么样"的唯一声明处：

- `RECORD_SOURCES` —— 记录来源 →（用户列, 时间列, 功能 key）。**用户列名逐表不同**
  （13 张 `recorded_by` / `medication` 用 `created_by` / `baby_diary` 用 `author_id`；
  `food_observation` 三者皆无，故不计入，改由打卡明细表 `food_observation_log` 代表）。
- `FUNCTIONS` —— 功能 key → 中文名（页面**只展示中文**，代码值不出现在界面上）。
- `COUNT_ONLY_SOURCES` —— 有表但无用户维度、只参与"条数"视角的功能。
- `RECONCILE` —— `record_timeline.source_type` → 对应业务表清单，用于「数据源自检」对账。
- `NO_TIMELINE_FUNCTIONS` —— 有业务表但未物化进时间线的功能（自检页用于解释覆盖度）。

⚠️ 为什么功能指标**不取 `record_timeline`**（2026-10-12 生产库实测，详见 TECH-033 §3.5）：

- timeline 是物化表，源记录被**物理删除后残留孤儿行** —— 实测 sleep 类 timeline 比
  `sleep_record` 多 **14 行**（`LEFT JOIN` 取证），而反向"业务表有而 timeline 无"为 **0**；
- medication 类更不对应：timeline 14 行 vs 药箱 7 + 打卡 19（语义被聚合过）。
  → 凡"条数 / 渗透率 / 人均"一律走**业务表**；timeline 只用于活跃宝宝 / 活跃家庭 / 趋势
  （轻维度、单表即可）。

⚠️ 活跃判定的时间列一律用 **`created_at`（录入时刻）**，不用 `event_time`（业务发生时刻）：
晚上补录白天的奶量，今天也算"在操作产品"；按 event_time 会把它算回昨天，让活跃曲线整体左移。
"""
from __future__ import annotations

# ── 口径版本（页面常驻展示；口径一旦变化（如启用登录活跃）必须递增，避免两个月的数据被误比）──
METRIC_VERSION = "v1-record-activity"

WINDOWS: dict[str, int] = {"7d": 7, "30d": 30, "90d": 90}
DEFAULT_WINDOW = "30d"

# ── 记录来源：(表名, 用户列, 时间列, 功能 key) ───────────────────────────────
#
# 用户列名**逐表不同**（2026-10-12 对生产库 `information_schema` 逐表核对）：
#   · 13 张用 `recorded_by`
#   · `medication`（药箱条目）用 `created_by`
#   · `baby_diary`（成长日记）用 `author_id`
#   · `food_observation`（排敏观察主表）三个都没有 → 不计入；其打卡明细表
#     `food_observation_log` 有 `recorded_by`，计入"排敏观察"
# 以上四类均已用 `LEFT JOIN user_account` 验证命中率 100%（59/59、4/4）。
RECORD_SOURCES: list[tuple[str, str, str, str]] = [
    ("feeding_formula_record", "recorded_by", "created_at", "feeding"),
    ("feeding_breast_record", "recorded_by", "created_at", "feeding"),
    ("feeding_food_record", "recorded_by", "created_at", "feeding"),
    ("feeding_supplement_record", "recorded_by", "created_at", "feeding"),
    ("sleep_record", "recorded_by", "created_at", "sleep"),
    ("diaper_record", "recorded_by", "created_at", "diaper"),
    ("activity_record", "recorded_by", "created_at", "activity"),
    ("health_record", "recorded_by", "created_at", "health"),
    ("growth_record", "recorded_by", "created_at", "growth"),
    ("medical_record", "recorded_by", "created_at", "medical"),
    ("symptom_record", "recorded_by", "created_at", "symptom"),
    ("medication", "created_by", "created_at", "medication"),
    ("medication_record", "recorded_by", "created_at", "medication"),
    ("food_observation_log", "recorded_by", "created_at", "observation"),
    ("baby_diary", "author_id", "created_at", "diary"),
]

# ── 功能清单（顺序 = 页面展示顺序）───────────────────────────────────────────
# ⚠️ `diary`/`observation` 不在 `record_timeline` 的 9 类 source_type 里 —— 它们是
# 有独立业务表、但未物化进时间线的用户动作（见 `NO_TIMELINE_FUNCTIONS`）。
FUNCTIONS: list[tuple[str, str]] = [
    ("feeding", "喂养记录"),
    ("sleep", "睡眠记录"),
    ("diaper", "尿布记录"),
    ("observation", "排敏观察"),
    ("diary", "成长日记"),
    ("health", "健康记录"),
    ("growth", "生长记录"),
    ("medication", "用药记录"),
    ("medical", "就医记录"),
    ("symptom", "症状记录"),
    ("activity", "活动记录"),
    ("report", "报告与洞察"),
    ("speaker", "音箱渠道"),
]
FUNCTION_LABEL: dict[str, str] = dict(FUNCTIONS)
FUNCTION_ORDER: dict[str, int] = {key: i for i, (key, _) in enumerate(FUNCTIONS)}

# ── 无用户维度、只参与"条数"视角的功能：(功能 key, 表名, 时间列) ──────────────
# `speaker_device` 只有 `family_id` → 算不出"多少人用"；页面在该视角下显式标注
# "该功能不计入人数口径"，而不是静默漏掉或当作 0。
#
# ⚠️ `saved_reports`（报告与洞察）**只存在于 dev 库**（dev 31 表 / 生产 30 表，
# 2026-10-12 实测）。生产库里没有这张表，所以指标计算会**先探测表是否存在**，
# 不存在就从"条数"视角里跳过并在页面上标注，绝不因此整块查询失败。
COUNT_ONLY_SOURCES: list[tuple[str, str, str]] = [
    ("report", "saved_reports", "created_at"),
    ("speaker", "speaker_device", "created_at"),
]

# 有业务表但**不在 `record_timeline`** 的功能（自检页据此说明"时间线覆盖不全"，
# 避免把"没物化"误读成"功能没数据"）。实测来源：`record_timeline.source_type`
# 仅有 feeding / sleep / diaper / health / growth / medication / medical / symptom / activity 九类。
NO_TIMELINE_FUNCTIONS: list[str] = ["observation", "diary", "report", "speaker"]

# ── 已知盲区（页面上**必须显示**"暂无法统计"及原因，否则会被误读为"零使用"）──
BLIND_SPOTS: list[dict[str, str]] = [
    {"name": "语音录入", "reason": "无数据承载（语音入口不落独立表）"},
    {"name": "助手对话", "reason": "需跨源接入（FlexDB trace，P1）"},
]

# ── 一致性对账：source_type → 业务表清单 ────────────────────────────────────
# 用途：`/api/analytics/health` 逐类比对 timeline 与业务表行数，把差异**如实展示**——
# 这条差异本身就是"为什么功能指标不取 timeline"的解释。
RECONCILE: list[tuple[str, list[str]]] = [
    ("feeding", ["feeding_formula_record", "feeding_breast_record",
                 "feeding_food_record", "feeding_supplement_record"]),
    ("sleep", ["sleep_record"]),
    ("diaper", ["diaper_record"]),
    ("activity", ["activity_record"]),
    ("health", ["health_record"]),
    ("growth", ["growth_record"]),
    ("medical", ["medical_record"]),
    ("symptom", ["symptom_record"]),
    ("medication", ["medication", "medication_record"]),
]


# ── 库结构探测（dev / 生产结构漂移的第一道防线）──────────────────────────────
#
# 为什么需要：`saved_reports` 只在 **dev** 库存在（dev 31 表 vs 生产 30 表，2026-10-12 实测）。
# 分析域读生产库，若照搬常量去查不存在的表 → `1146 Table doesn't exist` →
# **整条 UNION 直接报错**，功能视角整体挂掉。因此先探一次 `information_schema`，
# 把确实存在的表用于取数；缺表的项从结果里剔除并在页面上显式标注（"当前数据源无此表"），
# **绝不静默当 0**（0 是"确实没用过"，缺表是"没这功能数据"，两者不能混）。
_TABLES_CACHE: dict[str, set[str]] = {}


def existing_tables() -> set[str]:
    """当前分析库里实际存在的表名集合（按 DSN 缓存；切换数据源自动失效）。"""
    from .reader import dsn, query  # 局部导入：catalog 保持"不依赖任何东西"的表象

    key = dsn()
    cached = _TABLES_CACHE.get(key)
    if cached is None:
        rows = query(
            "SELECT TABLE_NAME AS t FROM information_schema.TABLES"
            " WHERE TABLE_SCHEMA = DATABASE()"
        )
        cached = {str(r["t"]) for r in rows}
        _TABLES_CACHE[key] = cached
    return cached


def active_record_sources() -> list[tuple[str, str, str, str]]:
    """实际存在的记录来源子集。"""
    have = existing_tables()
    return [s for s in RECORD_SOURCES if s[0] in have]


def active_count_only() -> list[tuple[str, str, str]]:
    """实际存在的"只算条数"功能子集。"""
    have = existing_tables()
    return [s for s in COUNT_ONLY_SOURCES if s[1] in have]


def missing_tables() -> list[str]:
    """目录里声明了、但当前库里不存在的表（页面据此标注"本数据源无此功能数据"）。"""
    have = existing_tables()
    known = [t for t, *_ in RECORD_SOURCES] + [t for _, t, _ in COUNT_ONLY_SOURCES]
    return [t for t in known if t not in have]


def normalize_window(value: str | None) -> tuple[str, int]:
    """时间窗入参 → (规范化 key, 天数)。非法值回退默认窗，不抛错（页面永远能渲染）。"""
    key = (value or DEFAULT_WINDOW).strip().lower()
    if key in WINDOWS:
        return key, WINDOWS[key]
    return DEFAULT_WINDOW, WINDOWS[DEFAULT_WINDOW]


def union_sql(alias: str = "x", sources: list[tuple[str, str, str, str]] | None = None) -> str:
    """生成 `(f, uid, t)` 的 UNION ALL 派生表。

    ⚠️ **表名与列名全部来自本文件常量**，不接受任何外部输入 → 无注入面。
    这是全项目**唯一**拼接这批表名的地方。

    `sources` 缺省用全部 `RECORD_SOURCES`；调用方（`metrics`）会传入**经
    `information_schema` 探测后确实存在**的子集 —— 生产库缺表时整条 UNION 会直接报错，
    这一步探测是"dev / 生产结构漂移"的第一道防线（实测：`saved_reports` 只在 dev 有）。
    """
    src = RECORD_SOURCES if sources is None else sources
    parts = [
        f"SELECT '{func}' AS f, {user_col} AS uid, {time_col} AS t FROM {table}"
        for table, user_col, time_col, func in src
    ]
    if not parts:                       # 极端情况：一张表都探不到（库名写错/权限不足）
        raise ValueError("没有可用的业务表：分析库结构与预期不符（检查 ANALYTICS_DB_NAME）")
    return "(\n  " + "\n  UNION ALL ".join(parts) + f"\n) {alias}"
