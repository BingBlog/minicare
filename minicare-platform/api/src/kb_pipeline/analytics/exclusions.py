"""排除名单（测试账号 / 内部家庭）—— 让"真实用户"口径可信（TECH-033 §3.3 / US-07）。

**为什么必须有**：生产库 29 个账号里 17 个是「用户_0001」这类自动生成昵称，其中 9 个零记录。
不排除的话所有指标都被稀释（"29 个用户"里其实只有个位数在真用）。

落点：`analytics/exclusions.yaml`（随仓库版本化，**不落库**）。三类条目：

| 字段 | 语义 |
|---|---|
| `users` | 显式排除的用户 id |
| `families` | 显式排除的家庭 id（影响"活跃家庭"/家庭维度指标） |
| `nickname_patterns` | 昵称正则。**加载时会解析成具体 uid 集合** —— 因为指标查询走 UNION 派生表，那里没有昵称列，只能按 uid 排除 |

写回走「校验 → 备份 → 原子写回」（与 `config_center` 同范式），改完**立即生效、无需重启**。
名单损坏时按"空名单"继续并把 `warning` 带回页面（**绝不静默吞掉**）。
"""
from __future__ import annotations

import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any

from . import cache
from .reader import AnalyticsUnavailable, query

EXCLUSIONS_FILE = Path(__file__).resolve().parent / "exclusions.yaml"

_HEADER = """# 用户分析 · 排除名单（PRD-016 / TECH-033）
#
# 用途：把测试账号 / 内部家庭排除出统计，使"真实用户"口径可信。
#   · users            —— 显式排除的用户 id（user_account.id）
#   · families         —— 显式排除的家庭 id（family_group.id）
#   · nickname_patterns —— 昵称正则；加载时解析成 uid 集合后生效
#
# ⚠️ 本文件由「用户分析 → 用户清单」页写回（写前自动备份为 exclusions.yaml.bak-<时间戳>）。
#    手工编辑同样有效，但需保证 YAML 语法正确。
"""


def _empty() -> dict[str, Any]:
    return {"users": [], "families": [], "nickname_patterns": []}


def load_raw() -> tuple[dict[str, Any], str | None]:
    """读文件（不做 DB 解析）。返回 (数据, 告警)。"""
    if not EXCLUSIONS_FILE.exists():
        return _empty(), None
    try:
        import yaml

        with open(EXCLUSIONS_FILE, encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
        if not isinstance(data, dict):
            return _empty(), "排除名单格式异常（顶层不是映射），本次按空名单计算"
        out = _empty()
        for key in out:
            value = data.get(key)
            if isinstance(value, list):
                out[key] = [str(v) for v in value]
            elif value is not None:
                return _empty(), f"排除名单的 `{key}` 不是列表，本次按空名单计算"
        return out, None
    except Exception as exc:  # noqa: BLE001
        return _empty(), f"排除名单解析失败（{exc}），本次按空名单计算"


def effective() -> dict[str, Any]:
    """生效名单：把昵称正则解析成 uid 集合后的最终结果（含指纹）。

    缓存键含 `data.json` 摘要 —— 名单一改指纹即变（缓存键里也用它，指标随之重算）。
    """
    raw, warning = load_raw()

    def _compute() -> dict[str, Any]:
        users = set(raw["users"])
        pattern_hits: list[str] = []
        if raw["nickname_patterns"]:
            try:
                rows = query("SELECT id, nickname FROM user_account")
            except AnalyticsUnavailable:
                raise
            for row in rows:
                nick = str(row.get("nickname") or "")
                if any(re.search(p, nick) for p in raw["nickname_patterns"]):
                    if row["id"] not in users:
                        pattern_hits.append(row["id"])
                    users.add(row["id"])
        fp = cache.fingerprint(
            sorted(users), sorted(raw["families"]), sorted(raw["nickname_patterns"])
        )
        return {
            "users": sorted(users),
            "families": sorted(raw["families"]),
            "nickname_patterns": list(raw["nickname_patterns"]),
            "pattern_hits": sorted(pattern_hits),
            "fingerprint": fp,
            "warning": warning,
        }

    value, _ = cache.get_or_compute(f"exclusions::{cache.fingerprint(raw)}", _compute)
    return value


def user_clause(column: str, *, force_empty: bool = False) -> tuple[str, list[str]]:
    """生成用户维度的排除子句 + 参数。`column` 是待过滤的列（如 `u.id` / `x.uid`）。"""
    if force_empty:
        return "", []
    ids = effective()["users"]
    if not ids:
        return "", []
    placeholders = ",".join(["%s"] * len(ids))
    return f" AND {column} NOT IN ({placeholders})", ids


def family_clause(column: str, *, force_empty: bool = False) -> tuple[str, list[str]]:
    """生成家庭维度的排除子句 + 参数。"""
    if force_empty:
        return "", []
    ids = effective()["families"]
    if not ids:
        return "", []
    placeholders = ",".join(["%s"] * len(ids))
    return f" AND {column} NOT IN ({placeholders})", ids


def candidates(limit: int = 50) -> list[dict[str, str]]:
    """疑似测试账号候选（**只列候选，绝不自动排除** —— 是否排除由人工确认）。

    判定：昵称命中 `test_nickname_pattern`，**或**该账号在业务表里零记录。
    """
    from ..config import get_settings
    from . import catalog as _catalog

    pattern = get_settings().analytics_cfg.test_nickname_pattern
    rows = query("SELECT id, nickname, phone, created_at FROM user_account ORDER BY created_at")
    # 用"当前库确实存在的表"生成 UNION（生产库缺 saved_reports 之类，见 catalog 顶部注释）
    union = _catalog.union_sql("x", _catalog.active_record_sources())
    active = {
        str(r["uid"])
        for r in query(
            f"SELECT DISTINCT x.uid AS uid FROM {union} "
            "WHERE x.uid IS NOT NULL AND x.uid <> ''"
        )
    }
    excluded = set(effective()["users"])
    out: list[dict[str, str]] = []
    for row in rows:
        uid = str(row["id"])
        if uid in excluded:
            continue
        nickname = str(row.get("nickname") or "")
        reasons: list[str] = []
        if pattern and re.search(pattern, nickname):
            reasons.append("昵称形如自动生成")
        if uid not in active:
            reasons.append("零记录")
        if not reasons:
            continue
        out.append(
            {
                "id": uid,
                "nickname": nickname,
                "phone": str(row.get("phone") or ""),
                "created_at": str(row.get("created_at") or ""),
                "reason": " · ".join(reasons),
            }
        )
        if len(out) >= limit:
            break
    return out


def mutate(action: str, kind: str, value: str, reason: str = "") -> dict[str, Any]:
    """增删一条名单条目（校验 → 备份 → 原子写回）。

    `action`: add | remove；`kind`: user | family | pattern（↔ yaml 的 users / families /
    nickname_patterns 三个字段）。`reason` 仅用于审计回执，不写进文件。
    """
    kinds = {"user": "users", "family": "families", "pattern": "nickname_patterns"}
    if kind not in kinds:
        raise ValueError(f"未知的名单类型：{kind}")
    if action not in ("add", "remove"):
        raise ValueError(f"未知的操作：{action}")
    field = kinds[kind]
    value = (value or "").strip()
    if not value:
        raise ValueError("条目内容不能为空")

    data, _ = load_raw()
    items: list[str] = list(data[field])
    if action == "add":
        if kind == "pattern":
            try:
                re.compile(value)
            except re.error as exc:
                raise ValueError(f"正则无效：{exc}") from exc
        if value in items:
            return {"changed": False, "field": field, "value": value, "items": items}
        items.append(value)
    else:
        if value not in items:
            return {"changed": False, "field": field, "value": value, "items": items}
        items.remove(value)
    data[field] = items

    _write(data)
    cache.clear()          # 名单变了：缓存全清（简单且绝不会漏）
    return {"changed": True, "field": field, "value": value, "items": items, "reason": reason}


def _write(data: dict[str, Any]) -> None:
    """校验通过后写回：备份旧文件 → 原子写（临时文件 + replace）。"""
    import yaml

    EXCLUSIONS_FILE.parent.mkdir(parents=True, exist_ok=True)
    if EXCLUSIONS_FILE.exists():
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        shutil.copy2(EXCLUSIONS_FILE, EXCLUSIONS_FILE.with_name(f"{EXCLUSIONS_FILE.name}.bak-{stamp}"))
    body = yaml.safe_dump(
        {"users": data["users"], "families": data["families"],
         "nickname_patterns": data["nickname_patterns"]},
        allow_unicode=True,
        sort_keys=False,
        default_flow_style=False,
    )
    tmp = EXCLUSIONS_FILE.with_suffix(".yaml.tmp")
    tmp.write_text(_HEADER + "\n" + body, encoding="utf-8")
    tmp.replace(EXCLUSIONS_FILE)
