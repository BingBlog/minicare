#!/usr/bin/env python3
"""
mock-data-plan-v2 冒烟校验：不依赖数据库，仅验证方案中的日期/日龄关系与关键里程碑。
执行：python3 migrations/mock_data/test_mock_plan_smoke.py（工作目录为 minicare-server）
"""
from __future__ import annotations

from datetime import date, timedelta

BIRTH = date(2025, 12, 26)
END_DAY100 = date(2026, 4, 4)
TODAY_NO_DATA = date(2026, 4, 5)

# (day_n, expected_date, label)
MILESTONES = [
    (1, date(2025, 12, 26), "出生"),
    (3, date(2025, 12, 28), "生理性体重下降测量"),
    (7, date(2026, 1, 1), "Day7 生长"),
    (12, date(2026, 1, 6), "首次儿保"),
    (15, date(2026, 1, 9), "低烧"),
    (28, date(2026, 1, 22), "满月"),
    (38, date(2026, 2, 1), "血便/高烧"),
    (39, date(2026, 2, 2), "就诊"),
    (46, date(2026, 2, 9), "换深度水解无乳糖"),
    (52, date(2026, 2, 15), "换奶期低烧"),
    (60, date(2026, 2, 23), "两月儿保"),
    (70, date(2026, 3, 5), "引入含乳糖"),
    (100, date(2026, 4, 4), "百天"),
]


def daterange_days() -> int:
    return (END_DAY100 - BIRTH).days + 1


def day_to_date(day_n: int) -> date:
    if day_n < 1:
        raise ValueError("day_n must be >= 1")
    return BIRTH + timedelta(days=day_n - 1)


def main() -> None:
    errors: list[str] = []

    dr = daterange_days()
    if dr != 100:
        errors.append(f"出生到 2026-04-04 应为 100 天，实际间隔 {dr} 天")

    if (TODAY_NO_DATA - BIRTH).days != 100:
        errors.append("2026-04-05 应为第 101 天（今天不生成数据）")

    for day_n, expected, label in MILESTONES:
        got = day_to_date(day_n)
        if got != expected:
            errors.append(f"{label}: Day {day_n} 期望 {expected}, 计算得 {got}")

    # §4.2 汇总条数（与文档一致即可）
    counts = {
        "feeding": 730,
        "diaper": 957,
        "sleep": 673,
        "activity": 80,
        "health": 42,
        "growth": 14,
        "symptom": 6,
        "medical": 3,
    }
    total = sum(counts.values())
    if total != 2505:
        errors.append(f"§4.2 合计应为 2505，当前加总 {total}")

    if errors:
        print("FAIL")
        for e in errors:
            print(" ", e)
        raise SystemExit(1)

    print("OK mock-data-plan-v2 日期/日龄/条数加总冒烟通过")
    print(f"  出生 {BIRTH} -> 第100天 {END_DAY100}，共 {dr} 天")
    print(f"  里程碑校验 {len(MILESTONES)} 项")


if __name__ == "__main__":
    main()
