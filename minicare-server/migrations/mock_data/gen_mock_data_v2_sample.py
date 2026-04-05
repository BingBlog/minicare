#!/usr/bin/env python3
"""
生成 mock-data-plan-v2 的「小样本」SQL，用于校验列名、枚举与日期（默认前 3 天）。
用法（于 minicare-server/migrations/mock_data）:
  python3 gen_mock_data_v2_sample.py > 008_mock_data_v2_sample.sql

全量生成请使用同目录 gen_mock_data_v2.py：`python3 gen_mock_data_v2.py > 008_mock_data_v2.sql`
"""
from __future__ import annotations

import random
import sys
import uuid
from datetime import date, datetime, timedelta
from typing import Iterable, List, Tuple

BABY_ID = "eacb2495-4387-4cf1-93a3-be11c444e618"
UID_MOM = "fbcccfbd-a450-45d8-be43-e5770de80359"
UID_DAD = "b42b4c6f-5a57-413d-815a-af16e790f4a1"

BIRTH = date(2025, 12, 26)
SAMPLE_DAYS = 3  # Day 1..3


def new_id() -> str:
    return str(uuid.uuid4())


def esc(s: str | None) -> str:
    if s is None:
        return "NULL"
    return "'" + s.replace("\\", "\\\\").replace("'", "''") + "'"


def sql_null(v) -> str:
    if v is None:
        return "NULL"
    return str(v)


def pick_recorder(rng: random.Random) -> str:
    return UID_MOM if rng.random() < 0.65 else UID_DAD


def ddt(d: date, h: int, m: int) -> str:
    return datetime(d.year, d.month, d.day, h, m, 0).strftime("%Y-%m-%d %H:%M:%S")


def emit_feeding(rng: random.Random, day: date, day_index: int) -> List[str]:
    """day_index: 0-based day from birth."""
    rows: List[str] = []
    n = 11 if day_index < 2 else 10
    base_times = [
        (2, 15),
        (4, 45),
        (7, 10),
        (9, 40),
        (12, 20),
        (14, 50),
        (17, 30),
        (20, 0),
        (22, 30),
        (23, 45),
        (1, 20),
    ]
    for i in range(n):
        h, m = base_times[i % len(base_times)]
        h += rng.randint(-1, 1)
        m = (m + rng.randint(-20, 20)) % 60
        h = max(0, min(23, h))
        ts = ddt(day, h, m)
        rec = pick_recorder(rng)
        if i % 3 == 0 or (day_index == 0 and i in (1, 4)):
            # formula
            ml = 60 + rng.randint(0, 25) if day_index == 0 else 70 + rng.randint(0, 30)
            rows.append(
                f"  ({esc(new_id())}, {esc(BABY_ID)}, {esc(rec)}, {esc(ts)}, 2, NULL, NULL, {ml}, NULL, NULL, NULL, NULL, NULL, NULL)"
            )
        else:
            dur = 12 + rng.randint(0, 12)
            side = rng.choice([1, 2, 3])
            rows.append(
                f"  ({esc(new_id())}, {esc(BABY_ID)}, {esc(rec)}, {esc(ts)}, 1, {side}, {dur}, NULL, NULL, NULL, NULL, NULL, NULL, NULL)"
            )
    return rows


def emit_diaper(rng: random.Random, day: date, day_index: int) -> List[str]:
    rows: List[str] = []
    n = 12 if day_index == 0 else 11
    for i in range(n):
        minute = rng.randint(6, 22 * 60)
        h, m = minute // 60, minute % 60
        ts = ddt(day, min(h, 23), m)
        rec = pick_recorder(rng)
        if day_index <= 1 and i < 4:
            dtype = 2 if i % 2 == 0 else 3
            color = esc("dark_green" if dtype == 2 else "yellow")
            ptype = esc("loose")
            note = esc("胎便（黑绿色）") if day_index == 0 and i < 2 else esc("过渡便（黄绿色）")
        else:
            dtype = rng.choice([1, 1, 2, 3])
            color = esc("yellow") if dtype != 1 else "NULL"
            ptype = esc("normal_soft") if dtype != 1 else "NULL"
            note = "NULL"
        butt = "NULL"
        dcount = "NULL"
        rows.append(
            f"  ({esc(new_id())}, {esc(BABY_ID)}, {esc(rec)}, {esc(ts)}, {dtype}, {color}, {ptype}, {butt}, {dcount}, {note})"
        )
    return rows


def quality_for_day(rng: random.Random, day_index: int) -> str:
    q = rng.choices(["good", "normal", "poor"], weights=[0.4, 0.4, 0.2])[0]
    return q


def emit_sleep(rng: random.Random, day: date, day_index: int) -> List[str]:
    rows: List[str] = []
    segments = [
        ("night", 0, 10, 120),
        ("night", 1, 30, 90),
        ("morning_nap", 9, 30, 60),
        ("afternoon_nap", 13, 30, 75),
        ("other", 16, 0, 45),
        ("night", 20, 0, 140),
        ("night", 23, 0, 100),
        ("morning_nap", 10, 15, 55),
        ("afternoon_nap", 14, 45, 50),
    ]
    for sp, sh, sm, dur in segments:
        sh = max(0, min(23, sh + rng.randint(-1, 1)))
        sm = (sm + rng.randint(-10, 10)) % 60
        st = datetime(day.year, day.month, day.day, sh, sm, 0)
        et = st + timedelta(minutes=dur + rng.randint(-15, 15))
        if et.day != st.day:
            et = datetime(st.year, st.month, st.day, 23, 55, 0)
        q = quality_for_day(rng, day_index)
        rec = pick_recorder(rng)
        rows.append(
            f"  ({esc(new_id())}, {esc(BABY_ID)}, {esc(rec)}, {esc(st.strftime('%Y-%m-%d %H:%M:%S'))}, "
            f"{esc(et.strftime('%Y-%m-%d %H:%M:%S'))}, {max(15, int((et - st).total_seconds() // 60))}, 2, NULL, {esc(q)}, {esc(sp)})"
        )
    return rows


def main() -> None:
    rng = random.Random(42)
    out: List[str] = []
    out.append("-- ============================================================")
    out.append("-- 008_mock_data_v2_sample.sql")
    out.append("-- mock-data-plan-v2 小样本：出生日起连续 {} 天（校验用，非全量）".format(SAMPLE_DAYS))
    out.append("-- ============================================================")
    out.append("")
    out.append("SET NAMES utf8mb4;")
    out.append("SET time_zone = '+08:00';")
    out.append("SET foreign_key_checks = 0;")
    out.append("")
    out.append("-- 与 003 相同：先清空该宝宝相关记录（仅开发/验证库执行）")
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

    feed_vals: List[str] = []
    diaper_vals: List[str] = []
    sleep_vals: List[str] = []

    for di in range(SAMPLE_DAYS):
        d = BIRTH + timedelta(days=di)
        feed_vals.extend(emit_feeding(rng, d, di))
        diaper_vals.extend(emit_diaper(rng, d, di))
        sleep_vals.extend(emit_sleep(rng, d, di))

    def join_block(header: str, rows: Iterable[str]) -> None:
        rs = list(rows)
        out.append(header)
        for i, line in enumerate(rs):
            out.append(line + ("," if i < len(rs) - 1 else ";"))

    join_block(
        "INSERT INTO `feeding_record` (`id`,`baby_id`,`recorded_by`,`record_time`,`feed_type`,`breast_side`,`duration_min`,`formula_ml`,`complementary_food`,`amount_g`,`milk_types`,`milk_scoops`,`supplement_items`,`note`) VALUES",
        feed_vals,
    )
    out.append("")
    join_block(
        "INSERT INTO `diaper_record` (`id`,`baby_id`,`recorded_by`,`record_time`,`diaper_type`,`color`,`poop_type`,`butt_condition`,`diaper_count`,`note`) VALUES",
        diaper_vals,
    )
    out.append("")
    join_block(
        "INSERT INTO `sleep_record` (`id`,`baby_id`,`recorded_by`,`start_time`,`end_time`,`duration_min`,`status`,`note`,`quality`,`sleep_period`) VALUES",
        sleep_vals,
    )
    out.append("")
    out.append("INSERT INTO `growth_record` (`id`,`baby_id`,`recorded_by`,`record_date`,`weight_g`,`height_mm`,`head_mm`,`note`) VALUES")
    out.append(
        f"  ({esc(new_id())}, {esc(BABY_ID)}, {esc(UID_MOM)}, '2025-12-26', 3300, 500, 340, NULL),"
    )
    out.append(
        f"  ({esc(new_id())}, {esc(BABY_ID)}, {esc(UID_MOM)}, '2025-12-28', 3120, 500, NULL, {esc('生理性体重下降')});"
    )
    out.append("")
    out.append("INSERT INTO `health_record` (`id`,`baby_id`,`recorded_by`,`record_time`,`temperature`,`mood`,`allergy_symptoms`,`allergy_severity`,`medications`,`skin_care`,`note`) VALUES")
    out.append(
        f"  ({esc(new_id())}, {esc(BABY_ID)}, {esc(UID_DAD)}, '2025-12-27 10:00:00', 36.7, 2, NULL, NULL, NULL, NULL, NULL);"
    )
    out.append("")
    out.append("SET foreign_key_checks = 1;")
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
