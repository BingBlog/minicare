import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { DATABASE_POOL } from '../common/database/database.module';
import { formatSqlDate } from '../common/utils/date.util';

export interface FeedingStats {
  totalFormulaMl: number;
  avgDailyFormulaMl: number;
  formulaCount: number;
  breastCount: number;
  complementaryCount: number;
  totalFeedCount: number;
  /** 每日奶量图表数据（最近 N 天，按日期升序） */
  dailyFormulaChart: Array<{ date: string; ml: number }>;
}

export interface SleepStats {
  totalMin: number;
  avgDailyMin: number;
  sessionCount: number;
}

export interface DiaperStats {
  totalCount: number;
  wetCount: number;
  dirtyCount: number;
  mixedCount: number;
  dryCount: number;
}

export interface ActivityStats {
  totalCount: number;
  bathCount: number;
  outdoorCount: number;
  playCount: number;
  tummyTimeCount: number;
  otherCount: number;
}

export interface GrowthStats {
  latestWeightG: number | null;
  latestHeightMm: number | null;
  latestHeadMm: number | null;
  latestDate: string | null;
  /** 体重趋势（最近10条，按日期升序） */
  weightTrend: Array<{ date: string; weightG: number }>;
}

export interface HealthStats {
  avgTemperature: number | null;
  maxTemperature: number | null;
  moodHappyCount: number;
  moodNeutralCount: number;
  moodFussyCount: number;
  moodCryingCount: number;
  feverCount: number;       // 体温 > 37.5 的次数
}

export interface MedicalStats {
  visitCount: number;
  lastVisitDate: string | null;
  lastHospital: string | null;
}

export interface SymptomStats {
  count: number;
}

export interface FoodObservationStats {
  observingCount: number;
  safeCount: number;
  allergicCount: number;
  items: Array<{ foodName: string; status: string; firstIntroAt: string }>;
}

export interface ReportSummary {
  babyId: string;
  startDate: string;
  endDate: string;
  days: number;
  feeding: FeedingStats;
  sleep: SleepStats;
  diaper: DiaperStats;
  activity: ActivityStats;
  growth: GrowthStats;
  health: HealthStats;
  medical: MedicalStats;
  symptom: SymptomStats;
  foodObservation: FoodObservationStats;
}

/** 已保存报告的列表条目 */
export interface SavedReportItem {
  id: string;
  familyId: string;
  babyId: string;
  title: string;
  startDate: string;
  endDate: string;
  days: number;
  createdAt: string;
}

/** 已保存报告的完整内容（含 summary） */
export interface SavedReport extends SavedReportItem {
  summary: ReportSummary;
}

// ── 图表数据接口类型 ────────────────────────────────────────────────

export interface DailyFeedingData {
  date: string;
  formulaMl: number;
  breastCount: number;
  /** 当日配方奶喂养次数（feeding_formula_record 条数） */
  formulaCount: number;
  /** 辅食次数（feeding_food_record 条数） */
  complementaryCount: number;
  /** 营养素次数（feeding_supplement_record 条数） */
  supplementCount: number;
  /** 当日配方奶按奶粉类型拆分的毫升数（有结构化字段时才有；key 同 milk_types） */
  formulaMlByMilkType?: Record<string, number>;
}

export interface DailyDiaperData {
  date: string;
  dirtyCount: number;
  wetCount: number;
  mixedCount: number;
}

export interface DailySleepData {
  date: string;
  totalMin: number;
  /** 当日睡眠段数（按 start_time 所在日历日） */
  sessionCount: number;
  /** 落在 22:00–次日 06:00 的分钟数（按 start_time 所在日累加） */
  nightSleepMin: number;
}

export interface DailyHealthData {
  date: string;
  temperature: number | null;
  /** 情绪：来自 symptom_record.mood，VARCHAR 枚举 happy/neutral/fussy/crying（null 表示当日无症状记录） */
  mood: string | null;
  /** 精神状态：来自 symptom_record.spirit（active/normal/tired/lethargic），null 表示当日无症状记录 */
  spirit: string | null;
}

export interface GrowthRecord {
  date: string;
  weightG: number | null;
  heightMm: number | null;
  headMm: number | null;
}

export interface ChartData {
  feeding: { daily: DailyFeedingData[] };
  diaper: { daily: DailyDiaperData[] };
  sleep: { daily: DailySleepData[] };
  health: { daily: DailyHealthData[] };
  growth: { records: GrowthRecord[] };
}

/** 与前端睡眠 Tab 一致：夜间窗口为当日 22:00 至次日 06:00（本地时区） */
function minutesInNightWindow22to06(start: Date, end: Date): number {
  if (!(start instanceof Date) || !(end instanceof Date) || end <= start) return 0;
  let totalMs = 0;
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const limit = new Date(end);
  limit.setDate(limit.getDate() + 2);
  for (let d = new Date(cursor); d < limit; d.setDate(d.getDate() + 1)) {
    const winStart = new Date(d);
    winStart.setHours(22, 0, 0, 0);
    const winEnd = new Date(d);
    winEnd.setDate(winEnd.getDate() + 1);
    winEnd.setHours(6, 0, 0, 0);
    const o0 = Math.max(start.getTime(), winStart.getTime());
    const o1 = Math.min(end.getTime(), winEnd.getTime());
    if (o1 > o0) totalMs += o1 - o0;
  }
  return Math.round(totalMs / 60000);
}

function parseJsonField(val: unknown): unknown {
  if (val == null) return null;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }
  return val;
}

/**
 * 将单条配方奶量按奶粉类型拆分：优先 milk_scoops 勺数比例，其次单类型全量，多类型无勺数则均分。
 * 无 milk_types 时记入 unlabeled，便于与有标注数据区分。
 */
function splitFormulaMlByMilkTypes(
  formulaMl: number,
  milkTypesRaw: unknown,
  milkScoopsRaw: unknown,
): Record<string, number> {
  const ml = Math.max(0, formulaMl);
  if (ml <= 0) return {};

  const milkTypes = parseJsonField(milkTypesRaw);
  const scoopsRaw = parseJsonField(milkScoopsRaw);
  const types = Array.isArray(milkTypes)
    ? milkTypes.filter((t): t is string => typeof t === 'string' && t.length > 0)
    : [];
  const scoops =
    scoopsRaw != null && typeof scoopsRaw === 'object' && !Array.isArray(scoopsRaw)
      ? (scoopsRaw as Record<string, number>)
      : null;

  if (types.length === 0) {
    return { unlabeled: ml };
  }

  if (scoops) {
    let totalW = 0;
    const weights: Record<string, number> = {};
    for (const t of types) {
      const w = scoops[t] != null ? Number(scoops[t]) : 0;
      weights[t] = w;
      if (w > 0) totalW += w;
    }
    if (totalW > 0) {
      const out: Record<string, number> = {};
      for (const t of types) {
        const w = weights[t] ?? 0;
        if (w <= 0) continue;
        out[t] = Math.round(((ml * w) / totalW) * 10) / 10;
      }
      const sum = Object.values(out).reduce((a, b) => a + b, 0);
      const drift = ml - sum;
      if (Math.abs(drift) > 0.01) {
        const adj =
          types.find((t) => (out[t] ?? 0) > 0) ?? types[0];
        out[adj] = Math.round(((out[adj] ?? 0) + drift) * 10) / 10;
      }
      return out;
    }
  }

  if (types.length === 1) {
    return { [types[0]]: ml };
  }

  const per = ml / types.length;
  const out: Record<string, number> = {};
  let allocated = 0;
  types.forEach((t, i) => {
    const v = i === types.length - 1 ? ml - allocated : Math.round(per * 10) / 10;
    out[t] = v;
    allocated += v;
  });
  return out;
}

@Injectable()
export class ReportService {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  async getSummary(
    babyId: string,
    startDate: string,
    endDate: string,
  ): Promise<ReportSummary> {
    // 计算天数
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.max(
      1,
      Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1,
    );

    // 并行查询所有模块
    const [feeding, sleep, diaper, activity, growth, health, medical, symptom, foodObs] =
      await Promise.all([
        this.getFeedingStats(babyId, startDate, endDate, days),
        this.getSleepStats(babyId, startDate, endDate, days),
        this.getDiaperStats(babyId, startDate, endDate),
        this.getActivityStats(babyId, startDate, endDate),
        this.getGrowthStats(babyId, startDate, endDate),
        this.getHealthStats(babyId, startDate, endDate),
        this.getMedicalStats(babyId, startDate, endDate),
        this.getSymptomStats(babyId, startDate, endDate),
        this.getFoodObservationStats(babyId),
      ]);

    return {
      babyId,
      startDate,
      endDate,
      days,
      feeding,
      sleep,
      diaper,
      activity,
      growth,
      health,
      medical,
      symptom,
      foodObservation: foodObs,
    };
  }

  /**
   * 获取图表逐日数据（已废弃：请使用按 Tab 拆分的独立接口）
   * @deprecated 使用 getDailyFeedingData / getDailyDiaperData / getDailySleepData / getDailyHealthData / getGrowthRecords
   */
  async getChartData(
    babyId: string,
    startDate: string,
    endDate: string,
  ): Promise<ChartData> {
    const [feeding, diaper, sleep, health, growth] = await Promise.all([
      this.getDailyFeedingData(babyId, startDate, endDate),
      this.getDailyDiaperData(babyId, startDate, endDate),
      this.getDailySleepData(babyId, startDate, endDate),
      this.getDailyHealthData(babyId, startDate, endDate),
      this.getGrowthRecords(babyId, startDate, endDate),
    ]);
    return { feeding, diaper, sleep, health, growth };
  }

  // ── 喂养逐日统计 ───────────────────────────────────────────────
  async getDailyFeedingData(
    babyId: string,
    startDate: string,
    endDate: string,
  ): Promise<{ daily: DailyFeedingData[] }> {
    // 从 4 张子表 UNION 后按日期聚合（Migration 008: 拆分为独立子表）
    const [rows] = await this.db.query<any[]>(
      `SELECT
         day_date,
         SUM(formula_ml)        AS formula_ml,
         SUM(breast_count)      AS breast_count,
         SUM(formula_count)     AS formula_count,
         SUM(complementary_count) AS complementary_count,
         SUM(supplement_count)  AS supplement_count
       FROM (
         SELECT DATE(record_time) AS day_date,
                0 AS formula_ml, 1 AS breast_count, 0 AS formula_count,
                0 AS complementary_count, 0 AS supplement_count
           FROM feeding_breast_record
           WHERE baby_id = ? AND DATE(record_time) BETWEEN ? AND ?
         UNION ALL
         SELECT DATE(record_time), COALESCE(formula_ml, 0), 0, 1, 0, 0
           FROM feeding_formula_record
           WHERE baby_id = ? AND DATE(record_time) BETWEEN ? AND ?
         UNION ALL
         SELECT DATE(record_time), 0, 0, 0, 1, 0
           FROM feeding_food_record
           WHERE baby_id = ? AND DATE(record_time) BETWEEN ? AND ?
         UNION ALL
         SELECT DATE(record_time), 0, 0, 0, 0, 1
           FROM feeding_supplement_record
           WHERE baby_id = ? AND DATE(record_time) BETWEEN ? AND ?
       ) t
       GROUP BY day_date ORDER BY day_date ASC`,
      [babyId, startDate, endDate,
       babyId, startDate, endDate,
       babyId, startDate, endDate,
       babyId, startDate, endDate],
    );

    // milk_types/milk_scoops 已拆分到 feeding_formula_mix 明细表
    // 每条配方奶记录 JOIN 其配比行，聚合为 JSON 数组 / 对象供 splitFormulaMlByMilkTypes 使用
    // 注意：使用 INNER JOIN + 子查询过滤，避免 LEFT JOIN 时 m.milk_type=NULL
    // 导致 JSON_OBJECTAGG key 为 NULL 在 CynosDB 上报 Error 3158
    const [formulaRows] = await this.db.query<any[]>(
      `SELECT
         DATE(f.record_time)                              AS day_date,
         f.formula_ml,
         JSON_ARRAYAGG(m.milk_type)                       AS milk_types,
         JSON_OBJECTAGG(m.milk_type, m.scoops)            AS milk_scoops
       FROM feeding_formula_record f
       INNER JOIN feeding_formula_mix m ON m.record_id = f.id
       WHERE f.baby_id = ? AND DATE(f.record_time) BETWEEN ? AND ?
         AND m.milk_type IS NOT NULL
       GROUP BY f.id, f.record_time, f.formula_ml
       ORDER BY f.record_time ASC`,
      [babyId, startDate, endDate],
    );

    const byDayMilk = new Map<string, Record<string, number>>();
    for (const fr of formulaRows as any[]) {
      const dayStr = formatSqlDate(fr.day_date);
      const ml = Number(fr.formula_ml) || 0;
      // milk_types: JSON_ARRAYAGG 返回数组（无配比行时为 [null]，需过滤）
      const rawTypes = Array.isArray(fr.milk_types)
        ? fr.milk_types.filter((t: unknown) => t != null)
        : [];
      const parts = splitFormulaMlByMilkTypes(ml, rawTypes.length ? rawTypes : null, fr.milk_scoops);
      const cur = byDayMilk.get(dayStr) ?? {};
      for (const [k, v] of Object.entries(parts)) {
        cur[k] = (cur[k] ?? 0) + v;
      }
      byDayMilk.set(dayStr, cur);
    }

    return {
      daily: (rows as any[]).map((r) => {
        const dateStr = formatSqlDate(r.day_date);
        const milkMap = byDayMilk.get(dateStr);
        const hasMilkBreakdown =
          milkMap != null && Object.keys(milkMap).length > 0;
        return {
          date: dateStr,
          formulaMl: Number(r.formula_ml) || 0,
          breastCount: Number(r.breast_count) || 0,
          formulaCount: Number(r.formula_count) || 0,
          complementaryCount: Number(r.complementary_count) || 0,
          supplementCount: Number(r.supplement_count) || 0,
          ...(hasMilkBreakdown ? { formulaMlByMilkType: milkMap } : {}),
        };
      }),
    };
  }

  // ── 尿布逐日统计 ───────────────────────────────────────────────
  async getDailyDiaperData(
    babyId: string,
    startDate: string,
    endDate: string,
  ): Promise<{ daily: DailyDiaperData[] }> {
    const [rows] = await this.db.query<any[]>(
      `SELECT
         DATE(record_time) AS day_date,
         COUNT(CASE WHEN diaper_type = 'dirty' THEN 1 END) AS dirty_count,
         COUNT(CASE WHEN diaper_type = 'wet'   THEN 1 END) AS wet_count,
         COUNT(CASE WHEN diaper_type = 'mixed' THEN 1 END) AS mixed_count
       FROM diaper_record
       WHERE baby_id = ? AND DATE(record_time) BETWEEN ? AND ?
       GROUP BY day_date ORDER BY day_date ASC`,
      [babyId, startDate, endDate],
    );
    return {
      daily: (rows as any[]).map((r) => ({
        date: formatSqlDate(r.day_date),
        dirtyCount: Number(r.dirty_count) || 0,
        wetCount: Number(r.wet_count) || 0,
        mixedCount: Number(r.mixed_count) || 0,
      })),
    };
  }

  // ── 睡眠逐日统计 ───────────────────────────────────────────────
  async getDailySleepData(
    babyId: string,
    startDate: string,
    endDate: string,
  ): Promise<{ daily: DailySleepData[] }> {
    const [rows] = await this.db.query<any[]>(
      `SELECT
         DATE_FORMAT(start_time, '%Y-%m-%d') AS day_date,
         SUM(duration_min) AS total_min,
         COUNT(*) AS session_count
       FROM sleep_record
       WHERE baby_id = ? AND status = 'ended'
         AND DATE(start_time) BETWEEN ? AND ?
       GROUP BY day_date ORDER BY day_date ASC`,
      [babyId, startDate, endDate],
    );

    const [detailRowsRaw] = await this.db.query(
      `SELECT
         DATE_FORMAT(start_time, '%Y-%m-%d') AS day_key,
         start_time,
         end_time
       FROM sleep_record
       WHERE baby_id = ? AND status = 'ended'
         AND DATE(start_time) BETWEEN ? AND ?
       ORDER BY start_time ASC`,
      [babyId, startDate, endDate],
    );
    const detailRows = detailRowsRaw as Array<{
      day_key: string;
      start_time: Date;
      end_time: Date | null;
    }>;

    const nightByDay = new Map<string, number>();
    for (const r of detailRows) {
      const st = r.start_time instanceof Date ? r.start_time : new Date(r.start_time);
      const en = r.end_time
        ? r.end_time instanceof Date
          ? r.end_time
          : new Date(r.end_time)
        : null;
      if (!en || en <= st) continue;
      const dayKey = String(r.day_key);
      const night = minutesInNightWindow22to06(st, en);
      if (night <= 0) continue;
      nightByDay.set(dayKey, (nightByDay.get(dayKey) ?? 0) + night);
    }

    return {
      daily: (rows as any[]).map((r) => {
        const dateStr = formatSqlDate(r.day_date);
        return {
          date: dateStr,
          totalMin: Number(r.total_min) || 0,
          sessionCount: Number(r.session_count) || 0,
          nightSleepMin: nightByDay.get(dateStr) ?? 0,
        };
      }),
    };
  }

  // ── 健康逐日数据 ───────────────────────────────────────────────
  async getDailyHealthData(
    babyId: string,
    startDate: string,
    endDate: string,
  ): Promise<{ daily: DailyHealthData[] }> {
    // 查询 health_record：每条记录返回体温（mood 已在 Migration 008 删除，统一由 symptom_record.mood 记录）
    const [healthRows] = await this.db.query<any[]>(
      `SELECT
         DATE(record_time) AS day_date,
         temperature
       FROM health_record
       WHERE baby_id = ? AND DATE(record_time) BETWEEN ? AND ?
       ORDER BY record_time ASC`,
      [babyId, startDate, endDate],
    );

    // 查询 symptom_record：每日取最新一条的 spirit 和 mood（均为 VARCHAR 枚举，无需整数映射）
    const [symptomRows] = await this.db.query<any[]>(
      `SELECT
         DATE(record_time) AS day_date,
         spirit,
         mood
       FROM symptom_record
       WHERE baby_id = ? AND DATE(record_time) BETWEEN ? AND ?
       ORDER BY record_time ASC`,
      [babyId, startDate, endDate],
    );

    // 按日期汇总 spirit / mood（取当日最后一条，即 ORDER BY ASC 后最后覆盖）
    const spiritByDay = new Map<string, string>();
    const moodByDay   = new Map<string, string>();
    for (const r of symptomRows as any[]) {
      const day = formatSqlDate(r.day_date);
      if (r.spirit) spiritByDay.set(day, String(r.spirit));
      if (r.mood)   moodByDay.set(day,   String(r.mood));
    }

    return {
      daily: (healthRows as any[]).map((r) => {
        const dateStr = formatSqlDate(r.day_date);
        return {
          date:        dateStr,
          temperature: r.temperature != null ? Number(r.temperature) : null,
          mood:        moodByDay.get(dateStr)   ?? null,
          spirit:      spiritByDay.get(dateStr) ?? null,
        };
      }),
    };
  }

  // ── 生长记录全量（用于曲线） ────────────────────────────────────
  async getGrowthRecords(
    babyId: string,
    startDate: string,
    endDate: string,
  ): Promise<{ records: GrowthRecord[] }> {
    const [rows] = await this.db.query<any[]>(
      `SELECT record_date, weight_g, height_mm, head_mm
       FROM growth_record
       WHERE baby_id = ? AND record_date BETWEEN ? AND ?
       ORDER BY record_date ASC`,
      [babyId, startDate, endDate],
    );
    return {
      records: (rows as any[]).map((r) => ({
        date: formatSqlDate(r.record_date),
        weightG: r.weight_g != null ? Number(r.weight_g) : null,
        heightMm: r.height_mm != null ? Number(r.height_mm) : null,
        headMm: r.head_mm != null ? Number(r.head_mm) : null,
      })),
    };
  }

  // ── 喂养统计 ──────────────────────────────────────────────────────
  // Migration 008: feeding_record 已拆分为 4 张子表，统计跨表 UNION 汇总
  private async getFeedingStats(
    babyId: string,
    startDate: string,
    endDate: string,
    days: number,
  ): Promise<FeedingStats> {
    // 各子表独立计数 + 配方奶汇总
    const [[breastRow], [formulaRow], [foodRow], [suppRow]] = await Promise.all([
      this.db.query<any[]>(
        `SELECT COUNT(*) AS cnt FROM feeding_breast_record
         WHERE baby_id = ? AND DATE(record_time) BETWEEN ? AND ?`,
        [babyId, startDate, endDate],
      ),
      this.db.query<any[]>(
        `SELECT COUNT(*) AS cnt, SUM(COALESCE(formula_ml, 0)) AS total_ml
         FROM feeding_formula_record
         WHERE baby_id = ? AND DATE(record_time) BETWEEN ? AND ?`,
        [babyId, startDate, endDate],
      ),
      this.db.query<any[]>(
        `SELECT COUNT(*) AS cnt FROM feeding_food_record
         WHERE baby_id = ? AND DATE(record_time) BETWEEN ? AND ?`,
        [babyId, startDate, endDate],
      ),
      this.db.query<any[]>(
        `SELECT COUNT(*) AS cnt FROM feeding_supplement_record
         WHERE baby_id = ? AND DATE(record_time) BETWEEN ? AND ?`,
        [babyId, startDate, endDate],
      ),
    ]);

    const breastCount       = Number(breastRow[0]?.cnt)     || 0;
    const formulaCount      = Number(formulaRow[0]?.cnt)    || 0;
    const complementaryCount = Number(foodRow[0]?.cnt)      || 0;
    const supplementCount   = Number(suppRow[0]?.cnt)       || 0;
    const totalFormulaMl    = Number(formulaRow[0]?.total_ml) || 0;
    const totalFeedCount    = breastCount + formulaCount + complementaryCount + supplementCount;

    // 每日奶量图表（仅 feeding_formula_record）
    const [chartRows] = await this.db.query<any[]>(
      `SELECT DATE(record_time) AS day_date, SUM(COALESCE(formula_ml, 0)) AS ml
       FROM feeding_formula_record
       WHERE baby_id = ? AND DATE(record_time) BETWEEN ? AND ?
       GROUP BY day_date ORDER BY day_date ASC`,
      [babyId, startDate, endDate],
    );

    return {
      totalFormulaMl,
      avgDailyFormulaMl: days > 0 ? Math.round(totalFormulaMl / days) : 0,
      formulaCount,
      breastCount,
      complementaryCount,
      totalFeedCount,
      dailyFormulaChart: (chartRows as any[]).map((cr) => ({
        date: formatSqlDate(cr.day_date),
        ml: Number(cr.ml) || 0,
      })),
    };
  }

  // ── 睡眠统计 ──────────────────────────────────────────────────────
  private async getSleepStats(
    babyId: string,
    startDate: string,
    endDate: string,
    days: number,
  ): Promise<SleepStats> {
    const [rows] = await this.db.query<any[]>(
      `SELECT
         SUM(duration_min)  AS total_min,
         COUNT(*)           AS session_count
       FROM sleep_record
       WHERE baby_id = ? AND status = 'ended'
         AND DATE(start_time) BETWEEN ? AND ?`,
      [babyId, startDate, endDate],
    );
    const r = rows[0] ?? {};
    const totalMin = Number(r.total_min) || 0;
    return {
      totalMin,
      avgDailyMin: days > 0 ? Math.round(totalMin / days) : 0,
      sessionCount: Number(r.session_count) || 0,
    };
  }

  // ── 尿布统计 ──────────────────────────────────────────────────────
  private async getDiaperStats(
    babyId: string,
    startDate: string,
    endDate: string,
  ): Promise<DiaperStats> {
    const [rows] = await this.db.query<any[]>(
      `SELECT
         COUNT(*)                                          AS total_count,
         COUNT(CASE WHEN diaper_type = 'wet'   THEN 1 END) AS wet_count,
         COUNT(CASE WHEN diaper_type = 'dirty' THEN 1 END) AS dirty_count,
         COUNT(CASE WHEN diaper_type = 'mixed' THEN 1 END) AS mixed_count,
         COUNT(CASE WHEN diaper_type = 'dry'   THEN 1 END) AS dry_count
       FROM diaper_record
       WHERE baby_id = ? AND DATE(record_time) BETWEEN ? AND ?`,
      [babyId, startDate, endDate],
    );
    const r = rows[0] ?? {};
    return {
      totalCount: Number(r.total_count) || 0,
      wetCount: Number(r.wet_count) || 0,
      dirtyCount: Number(r.dirty_count) || 0,
      mixedCount: Number(r.mixed_count) || 0,
      dryCount: Number(r.dry_count) || 0,
    };
  }

  // ── 活动统计 ──────────────────────────────────────────────────────
  private async getActivityStats(
    babyId: string,
    startDate: string,
    endDate: string,
  ): Promise<ActivityStats> {
    const [rows] = await this.db.query<any[]>(
      `SELECT
         COUNT(*)                                                   AS total_count,
         COUNT(CASE WHEN activity_type = 'bath'         THEN 1 END) AS bath_count,
         COUNT(CASE WHEN activity_type = 'outdoor'      THEN 1 END) AS outdoor_count,
         COUNT(CASE WHEN activity_type = 'play'         THEN 1 END) AS play_count,
         COUNT(CASE WHEN activity_type = 'tummy_time'   THEN 1 END) AS tummy_time_count,
         COUNT(CASE WHEN activity_type = 'other'        THEN 1 END) AS other_count
       FROM activity_record
       WHERE baby_id = ? AND DATE(record_time) BETWEEN ? AND ?`,
      [babyId, startDate, endDate],
    );
    const r = rows[0] ?? {};
    return {
      totalCount: Number(r.total_count) || 0,
      bathCount: Number(r.bath_count) || 0,
      outdoorCount: Number(r.outdoor_count) || 0,
      playCount: Number(r.play_count) || 0,
      tummyTimeCount: Number(r.tummy_time_count) || 0,
      otherCount: Number(r.other_count) || 0,
    };
  }

  // ── 生长统计 ──────────────────────────────────────────────────────
  private async getGrowthStats(
    babyId: string,
    _startDate: string,
    endDate: string,
  ): Promise<GrowthStats> {
    // 取截止日期前最新一条
    const [latestRows] = await this.db.query<any[]>(
      `SELECT record_date, weight_g, height_mm, head_mm
       FROM growth_record
       WHERE baby_id = ? AND record_date <= ?
       ORDER BY record_date DESC LIMIT 1`,
      [babyId, endDate],
    );
    const latest = latestRows[0] ?? null;

    // 取最近10条趋势
    const [trendRows] = await this.db.query<any[]>(
      `SELECT record_date, weight_g
       FROM growth_record
       WHERE baby_id = ? AND record_date <= ?
       ORDER BY record_date DESC LIMIT 10`,
      [babyId, endDate],
    );

    return {
      latestWeightG: latest ? Number(latest.weight_g) : null,
      latestHeightMm: latest ? Number(latest.height_mm) : null,
      latestHeadMm: latest ? Number(latest.head_mm) : null,
      latestDate: latest
        ? formatSqlDate(latest.record_date)
        : null,
      weightTrend: (trendRows as any[])
        .reverse()
        .map((tr) => ({
          date: formatSqlDate(tr.record_date),
          weightG: Number(tr.weight_g) || 0,
        })),
    };
  }

  // ── 健康统计 ──────────────────────────────────────────────────────
  // Migration 008: health_record.mood 已删除，mood 统一由 symptom_record.mood 记录（VARCHAR 枚举）
  private async getHealthStats(
    babyId: string,
    startDate: string,
    endDate: string,
  ): Promise<HealthStats> {
    // 体温统计仍从 health_record 获取
    const [healthRows] = await this.db.query<any[]>(
      `SELECT
         AVG(temperature)                              AS avg_temp,
         MAX(temperature)                              AS max_temp,
         COUNT(CASE WHEN temperature > 37.5 THEN 1 END) AS fever_count
       FROM health_record
       WHERE baby_id = ? AND DATE(record_time) BETWEEN ? AND ?`,
      [babyId, startDate, endDate],
    );
    const health = healthRows[0] ?? {};

    // mood 统计从 symptom_record 获取（VARCHAR 枚举）
    const [moodRows] = await this.db.query<any[]>(
      `SELECT
         COUNT(CASE WHEN mood = 'happy'   THEN 1 END) AS happy_count,
         COUNT(CASE WHEN mood = 'neutral' THEN 1 END) AS neutral_count,
         COUNT(CASE WHEN mood = 'fussy'   THEN 1 END) AS fussy_count,
         COUNT(CASE WHEN mood = 'crying'  THEN 1 END) AS crying_count
       FROM symptom_record
       WHERE baby_id = ? AND DATE(record_time) BETWEEN ? AND ?`,
      [babyId, startDate, endDate],
    );
    const mood = moodRows[0] ?? {};

    const avgTemp = health.avg_temp != null ? Math.round(Number(health.avg_temp) * 10) / 10 : null;
    const maxTemp = health.max_temp != null ? Math.round(Number(health.max_temp) * 10) / 10 : null;
    return {
      avgTemperature: avgTemp,
      maxTemperature: maxTemp,
      moodHappyCount: Number(mood.happy_count) || 0,
      moodNeutralCount: Number(mood.neutral_count) || 0,
      moodFussyCount: Number(mood.fussy_count) || 0,
      moodCryingCount: Number(mood.crying_count) || 0,
      feverCount: Number(health.fever_count) || 0,
    };
  }

  // ── 医疗统计 ──────────────────────────────────────────────────────
  private async getMedicalStats(
    babyId: string,
    startDate: string,
    endDate: string,
  ): Promise<MedicalStats> {
    const [rows] = await this.db.query<any[]>(
      `SELECT COUNT(*) AS visit_count,
              MAX(visit_date) AS last_visit_date,
              SUBSTRING_INDEX(GROUP_CONCAT(hospital ORDER BY visit_date DESC), ',', 1) AS last_hospital
       FROM medical_record
       WHERE baby_id = ? AND visit_date BETWEEN ? AND ?`,
      [babyId, startDate, endDate],
    );
    const r = rows[0] ?? {};
    return {
      visitCount: Number(r.visit_count) || 0,
      lastVisitDate: r.last_visit_date
        ? formatSqlDate(r.last_visit_date)
        : null,
      lastHospital: r.last_hospital ?? null,
    };
  }

  // ── 症状统计 ──────────────────────────────────────────────────────
  private async getSymptomStats(
    babyId: string,
    startDate: string,
    endDate: string,
  ): Promise<SymptomStats> {
    const [rows] = await this.db.query<any[]>(
      `SELECT COUNT(*) AS cnt FROM symptom_record
       WHERE baby_id = ? AND DATE(record_time) BETWEEN ? AND ?`,
      [babyId, startDate, endDate],
    );
    return { count: Number(rows[0]?.cnt) || 0 };
  }

  // ── 辅食观察统计 ──────────────────────────────────────────────────
  private async getFoodObservationStats(babyId: string): Promise<FoodObservationStats> {
    const [rows] = await this.db.query<any[]>(
      `SELECT food_name, status, first_intro_at
       FROM food_observation
       WHERE baby_id = ?
       ORDER BY first_intro_at ASC`,
      [babyId],
    );
    const items = (rows as any[]).map((r) => ({
      foodName: r.food_name as string,
      status: String(r.status ?? 'observing'),
      firstIntroAt: formatSqlDate(r.first_intro_at),
    }));
    return {
      observingCount: items.filter((i) => i.status === 'observing').length,
      safeCount: items.filter((i) => i.status === 'safe').length,
      allergicCount: items.filter((i) => i.status === 'allergic' || i.status === 'suspected').length,
      items,
    };
  }

  // ── 保存报告快照 ──────────────────────────────────────────────────
  /**
   * 将已生成的报告快照持久化到 saved_reports 表
   * 同一 family + baby + 相同日期范围若已存在则覆盖（upsert 式：先删再插）
   */
  async saveReport(
    familyId: string,
    summary: ReportSummary,
    title = '综合报告',
  ): Promise<{ id: string }> {
    // 生成 UUID（使用 MySQL UUID() 函数）
    const [[{ newId }]] = await this.db.query<any[]>('SELECT UUID() AS newId') as any;

    await this.db.query(
      `INSERT INTO saved_reports
         (id, family_id, baby_id, title, start_date, end_date, days, summary_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId,
        familyId,
        summary.babyId,
        title,
        summary.startDate,
        summary.endDate,
        summary.days,
        JSON.stringify(summary),
      ],
    );
    return { id: newId };
  }

  // ── 获取已保存报告列表 ──────────────────────────────────────────
  /**
   * 返回某家庭下某宝宝最近 N 条报告（不含 summary JSON，仅元数据）
   */
  async listSavedReports(
    familyId: string,
    babyId: string,
    limit = 10,
  ): Promise<SavedReportItem[]> {
    const [rows] = await this.db.query<any[]>(
      `SELECT id, family_id, baby_id, title, start_date, end_date, days, created_at
       FROM saved_reports
       WHERE family_id = ? AND baby_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [familyId, babyId, limit],
    );
    return (rows as any[]).map((r) => ({
      id: r.id as string,
      familyId: r.family_id as string,
      babyId: r.baby_id as string,
      title: r.title as string,
      startDate: formatSqlDate(r.start_date),
      endDate: formatSqlDate(r.end_date),
      days: Number(r.days),
      createdAt: r.created_at instanceof Date
        ? r.created_at.toISOString()
        : String(r.created_at),
    }));
  }

  // ── 获取单份已保存报告（含完整 summary） ────────────────────────
  async getSavedReport(
    reportId: string,
    familyId: string,
  ): Promise<SavedReport | null> {
    const [rows] = await this.db.query<any[]>(
      `SELECT id, family_id, baby_id, title, start_date, end_date, days, summary_json, created_at
       FROM saved_reports
       WHERE id = ? AND family_id = ?
       LIMIT 1`,
      [reportId, familyId],
    );
    if (!(rows as any[]).length) return null;
    const r = (rows as any[])[0];
    return {
      id: r.id as string,
      familyId: r.family_id as string,
      babyId: r.baby_id as string,
      title: r.title as string,
      startDate: formatSqlDate(r.start_date),
      endDate: formatSqlDate(r.end_date),
      days: Number(r.days),
      createdAt: r.created_at instanceof Date
        ? r.created_at.toISOString()
        : String(r.created_at),
      summary: JSON.parse(r.summary_json as string) as ReportSummary,
    };
  }
}
