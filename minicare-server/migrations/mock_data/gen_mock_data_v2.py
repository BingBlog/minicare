#!/usr/bin/env python3
"""
mock-data-plan-v2 全量 SQL 生成：出生起连续 100 天（Day 1..100）。
方案文档：`mock-data-plan-v2.md`（与本脚本同目录，minicare-server/migrations/mock_data/）。
用法:
  cd minicare-server/migrations/mock_data
  python3 gen_mock_data_v2.py > 008_mock_data_v2.sql
  python3 gen_mock_data_v2.py --feeding-only          # 写入 ./008_feeding_only/*.sql（分文件）
  python3 gen_mock_data_v2.py --feeding-only --feeding-single-file > single.sql
  python3 gen_mock_data_v2.py --stats   # 仅打印预估行数到 stderr，不写 SQL
"""
from __future__ import annotations

import argparse
import json
import random
import sys
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Callable, Dict, List, Optional, Sequence, Tuple

BABY_ID = "eacb2495-4387-4cf1-93a3-be11c444e618"
UID_MOM = "fbcccfbd-a450-45d8-be43-e5770de80359"
UID_DAD = "b42b4c6f-5a57-413d-815a-af16e790f4a1"

BIRTH = date(2025, 12, 26)
TOTAL_DAYS = 100  # Day 1 .. Day 100

# 饮食 mock 拆分文件：阶段顺序（与 mock-data-plan-v2.md § 阶段划分一致，文档与本脚本同目录）
FEEDING_PHASE_ORDER: Tuple[str, ...] = (
    "01_neonatal",
    "02_transition",
    "03_eh_no_lactose",
    "04_mix_80_20",
    "05_mix_50_50",
    "06_eh_lactose_full",
)

FEEDING_PHASE_META: Sequence[Tuple[str, str, str]] = (
    # phase_key, sql_filename, one-line comment for file header
    ("01_neonatal", "01_neonatal_day01_28.sql", "新生儿期 Day 1–28：母乳为主 + 普通配方 std"),
    ("02_transition", "02_transition_day29_45.sql", "过渡期 Day 29–45：混合增多 + 普通配方 std"),
    ("03_eh_no_lactose", "03_eh_no_lactose_day46_69.sql", "换奶期Ⅰ Day 46–69：深度水解（无乳糖）"),
    ("04_mix_80_20", "04_mix_80_20_day70_80.sql", "换奶期Ⅱ Day 70–80：无乳糖 + 含乳糖 约 80%:20%"),
    ("05_mix_50_50", "05_mix_50_50_day81_96.sql", "换奶期Ⅱ Day 81–96：无乳糖 + 含乳糖 约 50%:50%"),
    ("06_eh_lactose_full", "06_eh_lactose_full_day97_100.sql", "稳定期 Day 97–100：深度水解（含乳糖）单配"),
)

FEEDING_INSERT_HEADER = (
    "INSERT INTO `feeding_record` (`id`,`baby_id`,`recorded_by`,`record_time`,`feed_type`,"
    "`breast_side`,`duration_min`,`formula_ml`,`complementary_food`,`amount_g`,`milk_types`,"
    "`milk_scoops`,`supplement_items`,`note`) VALUES"
)


def feeding_phase_key(day_idx: int) -> str:
    """按日龄划分阶段，用于拆分 SQL 文件（day_idx 0-based，对应 Day day_idx+1）。"""
    dn = day_idx + 1
    if dn <= 28:
        return "01_neonatal"
    if dn <= 45:
        return "02_transition"
    if dn <= 69:
        return "03_eh_no_lactose"
    if dn <= 80:
        return "04_mix_80_20"
    if dn <= 96:
        return "05_mix_50_50"
    return "06_eh_lactose_full"


def new_id() -> str:
    return str(uuid.uuid4())


def esc(s: str | None) -> str:
    if s is None:
        return "NULL"
    return "'" + s.replace("\\", "\\\\").replace("'", "''") + "'"


def esc_json(j) -> str:
    return esc(json.dumps(j, ensure_ascii=False))


def formula_milk_sql(dn: int) -> Tuple[str, str]:
    """
    与同目录 mock-data-plan-v2.md §1.2 / §3.1 一致：0–45 天普通配方；46–69 深度水解（无乳糖）；
    70–80 无乳糖+含乳糖约 8:2；81–96 约 5:5；97–100 全量含乳糖深度水解。
    """
    if dn <= 45:
        return esc_json(["std"]), "NULL"
    if dn <= 69:
        return esc_json(["eh_no_lactose"]), "NULL"
    if dn <= 80:
        return esc_json(["eh_no_lactose", "eh_lactose"]), esc_json({"eh_no_lactose": 4, "eh_lactose": 1})
    if dn <= 96:
        return esc_json(["eh_no_lactose", "eh_lactose"]), esc_json({"eh_no_lactose": 3, "eh_lactose": 3})
    return esc_json(["eh_lactose"]), "NULL"


def pick_recorder(rng: random.Random) -> str:
    return UID_MOM if rng.random() < 0.65 else UID_DAD


def ddt(d: date, minute_of_day: int) -> str:
    minute_of_day = max(0, min(24 * 60 - 1, minute_of_day))
    h, m = minute_of_day // 60, minute_of_day % 60
    return datetime(d.year, d.month, d.day, h, m, 0).strftime("%Y-%m-%d %H:%M:%S")


def day_idx_to_date(day_idx: int) -> date:
    return BIRTH + timedelta(days=day_idx)


def feeding_daily_count(rng: random.Random, day_idx: int) -> int:
    if day_idx <= 6:
        return rng.randint(10, 12)
    if day_idx <= 27:
        return rng.randint(8, 10)
    if day_idx <= 44:
        return rng.randint(7, 8)
    if day_idx <= 58:
        return rng.randint(6, 7)
    return 6


def diaper_daily_count(rng: random.Random, day_idx: int) -> int:
    if day_idx <= 6:
        return rng.randint(10, 15)
    if day_idx <= 27:
        return rng.randint(10, 14)
    if day_idx <= 44:
        return rng.randint(8, 13)
    if day_idx <= 58:
        return rng.randint(8, 11)
    return rng.randint(6, 9)


def sleep_daily_segments(rng: random.Random, day_idx: int) -> int:
    if day_idx <= 6:
        return rng.randint(9, 11)
    if day_idx <= 27:
        return rng.randint(7, 9)
    if day_idx <= 44:
        return rng.randint(6, 8)
    if day_idx <= 58:
        return rng.randint(6, 7)
    return rng.randint(5, 6)


def stage_allergy(day_idx: int) -> str:
    if day_idx < 28:
        return "newborn"
    if day_idx < 45:
        return "transition"
    if day_idx < 59:
        return "change_milk"
    return "stable"


def sleep_quality_weights(day_idx: int) -> Tuple[float, float, float]:
    if day_idx < 28:
        return (0.40, 0.40, 0.20)
    if day_idx < 45:
        return (0.30, 0.40, 0.30)
    return (0.60, 0.30, 0.10)


def mood_tinyint_for_health(rng: random.Random, day_idx: int, fever: bool) -> int:
    if fever:
        return 3 if rng.random() < 0.6 else 4
    s = stage_allergy(day_idx)
    if s == "newborn":
        w = (0.20, 0.45, 0.25, 0.10)
    elif s == "transition":
        w = (0.25, 0.35, 0.30, 0.10)
    elif s == "change_milk":
        w = (0.30, 0.35, 0.25, 0.10)
    else:
        w = (0.65, 0.25, 0.08, 0.02)
    return rng.choices([1, 2, 3, 4], weights=w)[0]


def gen_sorted_minutes(rng: random.Random, n: int, lo: int = 120, hi: int = 1410) -> List[int]:
    pool = list(range(lo, hi))
    if n > len(pool):
        n = len(pool)
    return sorted(rng.sample(pool, n))


def emit_feeding_rows_by_phase(rng: random.Random) -> Dict[str, List[str]]:
    buckets: Dict[str, List[str]] = {k: [] for k in FEEDING_PHASE_ORDER}
    for day_idx in range(TOTAL_DAYS):
        d = day_idx_to_date(day_idx)
        n = feeding_daily_count(rng, day_idx)
        times = gen_sorted_minutes(rng, n)
        dn = day_idx + 1  # 1-based day number
        phase = feeding_phase_key(day_idx)

        # 配方次数目标
        if dn <= 7:
            n_formula = rng.randint(2, 3)
        elif dn <= 28:
            n_formula = rng.randint(2, 3)
        elif dn <= 45:
            n_formula = rng.randint(4, 5)
        elif dn <= 59:
            n_formula = rng.randint(5, 6)
        else:
            n_formula = 6
        n_formula = min(n_formula, n)
        if dn >= 61:
            n_formula = n  # 全配方

        which_formula = set(rng.sample(range(n), n_formula)) if n_formula else set()

        for i, tod in enumerate(times):
            rec = pick_recorder(rng)
            ts = ddt(d, tod)
            note: Optional[str] = None
            is_formula = i in which_formula

            if dn >= 61 and is_formula:
                ml = rng.randint(130, 152)
            elif 46 <= dn <= 59 and is_formula:
                ml = rng.randint(100, 140)
                if 46 <= dn <= 50 and rng.random() < 0.35:
                    ml = rng.randint(60, 80)
                    note = "拒奶，哭闹"
            elif dn <= 28 and is_formula:
                lo, hi = (60, 90) if dn <= 7 else ((70, 100) if dn <= 14 else (80, 110))
                ml = rng.randint(lo, hi)
            elif is_formula:
                ml = rng.randint(90, 130)
            else:
                ml = 0

            if is_formula:
                if dn == 46 and i == min(which_formula):
                    note = note or "换深度水解奶粉（无乳糖）"
                if dn == 70 and i == min(which_formula):
                    note = note or "引入含乳糖配方"
                if dn == 85 and i == min(which_formula):
                    note = note or "含乳糖配方加50%"
                mt_sql, ms_sql = formula_milk_sql(dn)
                buckets[phase].append(
                    f"  ({esc(new_id())}, {esc(BABY_ID)}, {esc(rec)}, {esc(ts)}, 2, NULL, NULL, {ml}, NULL, NULL, {mt_sql}, {ms_sql}, NULL, {esc(note)})"
                )
            else:
                dur = rng.randint(12, 25)
                side = rng.choice([1, 2, 3])
                buckets[phase].append(
                    f"  ({esc(new_id())}, {esc(BABY_ID)}, {esc(rec)}, {esc(ts)}, 1, {side}, {dur}, NULL, NULL, NULL, NULL, NULL, NULL, NULL)"
                )
    return buckets


def emit_feeding_rows(rng: random.Random) -> List[str]:
    b = emit_feeding_rows_by_phase(rng)
    return [row for k in FEEDING_PHASE_ORDER for row in b[k]]


def poop_profile(rng: random.Random, day_idx: int, poop_idx: int, total_poop: int) -> Tuple[int, Optional[str], Optional[str], Optional[str]]:
    """Returns diaper_type, color, poop_type, note"""
    dn = day_idx + 1
    if dn <= 2 and poop_idx < 2:
        return 2, "dark_green", "loose", "胎便（黑绿色）"
    if dn <= 5 and poop_idx < 3:
        return 3 if rng.random() < 0.5 else 2, "yellow", "loose", "过渡便（黄绿色）"
    if 36 <= dn <= 45 and rng.random() < 0.35:
        return 2, "yellow", rng.choice(["watery", "loose"]), None
    return (
        rng.choice([2, 3]),
        "yellow" if rng.random() < 0.7 else None,
        "normal_soft" if rng.random() < 0.65 else "loose",
        None,
    )


def emit_diaper_rows(rng: random.Random) -> List[str]:
    rows: List[str] = []
    for day_idx in range(TOTAL_DAYS):
        d = day_idx_to_date(day_idx)
        n = diaper_daily_count(rng, day_idx)
        dn = day_idx + 1
        n_poop = max(1, min(n - 3, int(n * (0.45 if dn <= 28 else 0.35 if dn <= 45 else 0.28))))
        if dn <= 7:
            n_poop = rng.randint(4, min(7, n))
        times = gen_sorted_minutes(rng, n)
        poop_quota = n_poop
        bloody_done = day_idx != 37
        for i, tod in enumerate(times):
            rec = pick_recorder(rng)
            ts = ddt(d, tod)
            if poop_quota > 0 and (i < n_poop or rng.random() < 0.4):
                if day_idx == 37 and not bloody_done:
                    dtype, color, ptype, nt = 2, "pink", "bloody", None
                    bloody_done = True
                else:
                    dtype, color, ptype, nt = poop_profile(rng, day_idx, n_poop - poop_quota, n_poop)
                poop_quota -= 1
            else:
                dtype = 1
                color = None
                ptype = None
                nt = None
            color_sql = esc(color) if color else "NULL"
            ptype_sql = esc(ptype) if ptype else "NULL"
            nt_sql = esc(nt) if nt else "NULL"
            rows.append(
                f"  ({esc(new_id())}, {esc(BABY_ID)}, {esc(rec)}, {esc(ts)}, {dtype}, {color_sql}, {ptype_sql}, NULL, NULL, {nt_sql})"
            )
    return rows


def label_sleep_period(rng: random.Random, start_min: int, dur: int) -> str:
    h = start_min // 60
    if start_min >= 21 * 60 or start_min < 6 * 60:
        return "night"
    if 9 * 60 <= start_min < 12 * 60:
        return "morning_nap"
    if 13 * 60 <= start_min < 16 * 60:
        return "afternoon_nap"
    if rng.random() < 0.3:
        return "other"
    return "morning_nap" if h < 12 else "afternoon_nap"


def emit_sleep_rows(rng: random.Random) -> List[str]:
    rows: List[str] = []
    for day_idx in range(TOTAL_DAYS):
        d = day_idx_to_date(day_idx)
        nseg = sleep_daily_segments(rng, day_idx)
        gw, nw, pw = sleep_quality_weights(day_idx)
        for _ in range(nseg):
            start_min = rng.randint(30, 23 * 60 - 30)
            dur = rng.randint(35, 165) if day_idx < 28 else rng.randint(40, 200)
            st = datetime(d.year, d.month, d.day, 0, 0, 0) + timedelta(minutes=start_min)
            et = st + timedelta(minutes=dur)
            if et.date() > st.date():
                et = datetime(st.year, st.month, st.day, 23, 55, 0)
            dm = max(15, int((et - st).total_seconds() // 60))
            q = rng.choices(["good", "normal", "poor"], weights=[gw, nw, pw])[0]
            sp = label_sleep_period(rng, start_min, dm)
            rec = pick_recorder(rng)
            rows.append(
                f"  ({esc(new_id())}, {esc(BABY_ID)}, {esc(rec)}, "
                f"{esc(st.strftime('%Y-%m-%d %H:%M:%S'))}, {esc(et.strftime('%Y-%m-%d %H:%M:%S'))}, "
                f"{dm}, 2, NULL, {esc(q)}, {esc(sp)})"
            )
    return rows


GROWTH_POINTS: Sequence[Tuple[date, int, Optional[int], Optional[int], Optional[str]]] = [
    (date(2025, 12, 26), 3300, 500, 340, None),
    (date(2025, 12, 28), 3120, 500, None, "生理性体重下降"),
    (date(2026, 1, 1), 3290, 501, 341, None),
    (date(2026, 1, 2), 3380, 502, 342, None),
    (date(2026, 1, 8), 3620, 505, 343, None),
    (date(2026, 1, 15), 3870, 510, 350, None),
    (date(2026, 1, 22), 4110, 520, 356, None),
    (date(2026, 1, 29), 4480, 527, 363, None),
    (date(2026, 2, 5), 4730, 535, 370, None),
    (date(2026, 2, 12), 4950, 542, 376, None),
    (date(2026, 2, 19), 5180, 549, 382, None),
    (date(2026, 2, 23), 5260, 552, 385, None),
    (date(2026, 3, 2), 5490, 560, 389, None),
    (date(2026, 4, 4), 5850, 590, 398, None),
]


def emit_growth_rows(rng: random.Random) -> List[str]:
    rows: List[str] = []
    for rd, wg, hg, headg, nt in GROWTH_POINTS:
        rec = pick_recorder(rng)
        head_sql = "NULL" if headg is None else str(headg)
        nt_sql = esc(nt) if nt else "NULL"
        rows.append(
            f"  ({esc(new_id())}, {esc(BABY_ID)}, {esc(rec)}, '{rd.isoformat()}', {wg}, {hg}, {head_sql}, {nt_sql})"
        )
    return rows


def health_record_days(rng: random.Random) -> List[int]:
    """0-based day indices for health_record（目标约 42 条）。"""
    s = set(range(0, 28, 2)) | set(range(28, 59, 2)) | set(range(59, 100, 3))
    s |= {14, 15, 37, 38, 39, 51, 52}
    out = sorted(s)
    forced = {14, 15, 37, 38, 39, 51, 52}
    while len(out) > 42:
        removable = [x for x in out if x not in forced]
        if not removable:
            break
        out.remove(rng.choice(removable))
    return sorted(out)


def temp_for_health_day(day_idx: int) -> float:
    dn = day_idx + 1
    m = {
        15: 37.6,
        16: 37.4,
        38: 38.5,
        39: 38.2,
        40: 37.8,
        52: 37.7,
        53: 37.3,
    }
    return m.get(dn, 0.0)


def emit_health_rows(rng: random.Random, days: List[int]) -> List[str]:
    rows: List[str] = []
    for day_idx in days:
        d = day_idx_to_date(day_idx)
        tod = rng.randint(9 * 60 + 30, 20 * 60)
        ts = ddt(d, tod)
        rec = pick_recorder(rng)
        fixed = temp_for_health_day(day_idx)
        if fixed > 0:
            t = fixed
            mood = mood_tinyint_for_health(rng, day_idx, fever=True)
        else:
            t = round(rng.uniform(36.5, 37.15), 1)
            mood = mood_tinyint_for_health(rng, day_idx, fever=False)
        rows.append(
            f"  ({esc(new_id())}, {esc(BABY_ID)}, {esc(rec)}, {esc(ts)}, {t}, {mood}, NULL, NULL, NULL, NULL, NULL)"
        )
    return rows


def emit_medical_rows(rng: random.Random) -> List[str]:
    rows = [
        f"  ({esc(new_id())}, {esc(BABY_ID)}, {esc(UID_MOM)}, '2026-01-06', {esc('儿童保健中心')}, {esc('新生儿常规体检')}, NULL, NULL, {esc('正常')})",
        f"  ({esc(new_id())}, {esc(BABY_ID)}, {esc(UID_DAD)}, '2026-02-02', {esc('上海儿童医院')}, {esc('牛奶蛋白过敏（CMPA）疑似，血便')}, NULL, NULL, {esc('建议换深度水解奶粉（无乳糖）')})",
        f"  ({esc(new_id())}, {esc(BABY_ID)}, {esc(UID_MOM)}, '2026-02-23', {esc('儿童保健中心')}, {esc('2月龄健康检查')}, NULL, NULL, {esc('生长发育正常')})",
    ]
    return rows


SYMPTOM_SPECS: Sequence[Tuple[date, str, str, str, str]] = [
    (date(2026, 1, 21), '[{"type":6,"severity":2}]', "腹胀", "tired", "fussy"),
    (date(2026, 1, 29), '[{"type":1,"severity":2}]', "皮疹（脸颊发红）", "tired", "fussy"),
    (date(2026, 1, 30), '[{"type":4,"severity":3}]', "大便含黏液，腹胀明显", "lethargic", "crying"),
    (date(2026, 2, 1), '[{"type":4,"severity":3}]', "大便血丝，哭闹不止", "lethargic", "crying"),
    (date(2026, 2, 6), '[{"type":1,"severity":2}]', "皮肤红疹（湿疹样）", "tired", "fussy"),
    (date(2026, 2, 10), '[{"type":6,"severity":1}]', "轻微腹胀，换奶反应", "normal", "neutral"),
]


def emit_symptom_rows(rng: random.Random) -> List[str]:
    rows: List[str] = []
    for rd, sj, nt, spirit, mood in SYMPTOM_SPECS:
        rec = pick_recorder(rng)
        tod = rng.randint(10 * 60, 18 * 60)
        ts = ddt(rd, tod)
        rows.append(
            f"  ({esc(new_id())}, {esc(BABY_ID)}, {esc(rec)}, {esc(ts)}, CAST({esc(sj)} AS JSON), NULL, {esc(nt)}, {esc(spirit)}, {esc(mood)})"
        )
    return rows


def emit_activity_rows(rng: random.Random) -> List[str]:
    rows: List[str] = []
    chosen = sorted(rng.sample(range(13, 100), 80))
    type_pick: Callable[[random.Random], int] = lambda r: r.choices([1, 2, 3, 4, 5], weights=[0.25, 0.2, 0.15, 0.35, 0.05])[0]
    for day_idx in chosen:
        d = day_idx_to_date(day_idx)
        rec = pick_recorder(rng)
        tod = rng.randint(9 * 60, 19 * 60)
        ts = ddt(d, tod)
        at = type_pick(rng)
        dur = rng.randint(8, 35) if at != 2 else rng.randint(20, 50)
        inten = rng.choice(["easy", "medium", "active"])
        rows.append(
            f"  ({esc(new_id())}, {esc(BABY_ID)}, {esc(rec)}, {esc(ts)}, {at}, {dur}, NULL, {esc(inten)})"
        )
    return rows


def join_block(out: List[str], header: str, rows: Sequence[str]) -> None:
    rs = list(rows)
    out.append(header)
    for i, line in enumerate(rs):
        out.append(line + ("," if i < len(rs) - 1 else ";"))


def mock_data_dir() -> Path:
    """mock 数据目录（本文件与 008_*.sql、008_feeding_only/ 同级）。"""
    return Path(__file__).resolve().parent


def write_feeding_only_split(out_dir: Path, buckets: Dict[str, List[str]]) -> None:
    """写入 008_feeding_only/ 目录：00 清理 + 01–06 按阶段 INSERT + 99 收尾。"""
    out_dir.mkdir(parents=True, exist_ok=True)
    setup_lines = [
        "-- ============================================================",
        "-- 008_feeding_only（仅饮食记录，按阶段拆分）",
        "-- 由 gen_mock_data_v2.py --feeding-only 生成，seed=42",
        "-- 执行顺序：008_feeding_only 内编号升序；合并导入（于 minicare-server 下）:",
        "--   bash migrations/mock_data/apply_008_feeding_only.sh | mysql ...",
        "-- ============================================================",
        "",
        "SET NAMES utf8mb4;",
        "SET time_zone = '+08:00';",
        "SET foreign_key_checks = 0;",
        "",
        f"DELETE FROM `feeding_record` WHERE `baby_id` = '{BABY_ID}';",
        "",
    ]
    (out_dir / "00_setup.sql").write_text("\n".join(setup_lines) + "\n", encoding="utf-8")

    for phase_key, filename, blurb in FEEDING_PHASE_META:
        rows = buckets[phase_key]
        block: List[str] = [
            "-- ============================================================",
            f"-- {filename}",
            f"-- {blurb}",
            "-- ============================================================",
            "",
        ]
        join_block(block, FEEDING_INSERT_HEADER, rows)
        block.append("")
        (out_dir / filename).write_text("\n".join(block) + "\n", encoding="utf-8")

    footer = (
        "-- ============================================================\n"
        "-- 99_footer.sql\n"
        "-- ============================================================\n"
        "\n"
        "SET foreign_key_checks = 1;\n"
    )
    (out_dir / "99_footer.sql").write_text(footer, encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stats", action="store_true", help="print counts to stderr only")
    ap.add_argument(
        "--feeding-only",
        action="store_true",
        help="仅输出 feeding_record（不删/插其他表，不改 baby_profile）；默认写入 mock_data/008_feeding_only/",
    )
    ap.add_argument(
        "--feeding-single-file",
        action="store_true",
        help="与 --feeding-only 合用：整份 SQL 输出到 stdout（旧行为）",
    )
    args = ap.parse_args()

    rng = random.Random(42)

    if args.feeding_only:
        feed_by_phase = emit_feeding_rows_by_phase(rng)
        feed = [row for k in FEEDING_PHASE_ORDER for row in feed_by_phase[k]]
        if args.stats:
            stat: Dict[str, object] = {"feeding_record": len(feed), "by_phase": {k: len(feed_by_phase[k]) for k in FEEDING_PHASE_ORDER}}
            print(json.dumps(stat, ensure_ascii=False, indent=2), file=sys.stderr)
            return
        if args.feeding_single_file:
            out: List[str] = []
            out.append("-- ============================================================")
            out.append("-- feeding-only 单文件（--feeding-single-file）")
            out.append("-- ============================================================")
            out.append("")
            out.append("SET NAMES utf8mb4;")
            out.append("SET time_zone = '+08:00';")
            out.append("SET foreign_key_checks = 0;")
            out.append("")
            out.append(f"DELETE FROM `feeding_record` WHERE `baby_id` = '{BABY_ID}';")
            out.append("")
            join_block(out, FEEDING_INSERT_HEADER, feed)
            out.append("")
            out.append("SET foreign_key_checks = 1;")
            sys.stdout.write("\n".join(out) + "\n")
            return
        out_dir = mock_data_dir() / "008_feeding_only"
        write_feeding_only_split(out_dir, feed_by_phase)
        print(
            f"Wrote split feeding SQL under {out_dir} (00_setup + 01..06 + 99_footer).",
            file=sys.stderr,
        )
        return

    feed = emit_feeding_rows(rng)

    diaper = emit_diaper_rows(rng)
    sleep = emit_sleep_rows(rng)
    growth = emit_growth_rows(rng)
    hdays = health_record_days(rng)
    health = emit_health_rows(rng, hdays)
    medical = emit_medical_rows(rng)
    symptom = emit_symptom_rows(rng)
    activity = emit_activity_rows(rng)

    total_ins = len(feed) + len(diaper) + len(sleep) + len(growth) + len(health) + len(medical) + len(symptom) + len(activity)

    if args.stats:
        print(
            json.dumps(
                {
                    "feeding_record": len(feed),
                    "diaper_record": len(diaper),
                    "sleep_record": len(sleep),
                    "growth_record": len(growth),
                    "health_record": len(health),
                    "medical_record": len(medical),
                    "symptom_record": len(symptom),
                    "activity_record": len(activity),
                    "health_days": len(hdays),
                    "insert_rows_total": total_ins,
                },
                ensure_ascii=False,
                indent=2,
            ),
            file=sys.stderr,
        )
        return

    out: List[str] = []
    out.append("-- ============================================================")
    out.append("-- 008_mock_data_v2.sql")
    out.append("-- mock-data-plan-v2 全量：100 天（Day 1..Day 100），由 gen_mock_data_v2.py 生成")
    out.append("-- ============================================================")
    out.append("")
    out.append("SET NAMES utf8mb4;")
    out.append("SET time_zone = '+08:00';")
    out.append("SET foreign_key_checks = 0;")
    out.append("")
    out.append("-- 清空该宝宝相关记录（仅开发/验证库执行）")
    for tbl in [
        "feeding_record",
        "sleep_record",
        "diaper_record",
        "health_record",
        "symptom_record",
        "activity_record",
        "growth_record",
        "medical_record",
        "food_observation",
    ]:
        out.append(f"DELETE FROM `{tbl}` WHERE `baby_id` = '{BABY_ID}';")
    out.append("")
    out.append(f"UPDATE `baby_profile` SET `birth_date` = '2025-12-26' WHERE `id` = '{BABY_ID}';")
    out.append("")

    join_block(out, FEEDING_INSERT_HEADER, feed)
    out.append("")
    join_block(
        out,
        "INSERT INTO `diaper_record` (`id`,`baby_id`,`recorded_by`,`record_time`,`diaper_type`,`color`,`poop_type`,`butt_condition`,`diaper_count`,`note`) VALUES",
        diaper,
    )
    out.append("")
    join_block(
        out,
        "INSERT INTO `sleep_record` (`id`,`baby_id`,`recorded_by`,`start_time`,`end_time`,`duration_min`,`status`,`note`,`quality`,`sleep_period`) VALUES",
        sleep,
    )
    out.append("")
    join_block(
        out,
        "INSERT INTO `growth_record` (`id`,`baby_id`,`recorded_by`,`record_date`,`weight_g`,`height_mm`,`head_mm`,`note`) VALUES",
        growth,
    )
    out.append("")
    join_block(
        out,
        "INSERT INTO `health_record` (`id`,`baby_id`,`recorded_by`,`record_time`,`temperature`,`mood`,`allergy_symptoms`,`allergy_severity`,`medications`,`skin_care`,`note`) VALUES",
        health,
    )
    out.append("")
    join_block(
        out,
        "INSERT INTO `medical_record` (`id`,`baby_id`,`recorded_by`,`visit_date`,`hospital`,`diagnosis`,`medications`,`photo_ids`,`note`) VALUES",
        medical,
    )
    out.append("")
    join_block(
        out,
        "INSERT INTO `symptom_record` (`id`,`baby_id`,`recorded_by`,`record_time`,`symptoms`,`photo_ids`,`note`,`spirit`,`mood`) VALUES",
        symptom,
    )
    out.append("")
    join_block(
        out,
        "INSERT INTO `activity_record` (`id`,`baby_id`,`recorded_by`,`record_time`,`activity_type`,`duration_min`,`note`,`intensity`) VALUES",
        activity,
    )
    out.append("")
    out.append("SET foreign_key_checks = 1;")
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
