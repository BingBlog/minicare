import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { DATABASE_POOL } from '../common/database/database.module';

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
  items: Array<{ foodName: string; status: number; firstIntroAt: string }>;
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
  complementaryCount: number;
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
}

export interface DailyHealthData {
  date: string;
  temperature: number | null;
  mood: number | null;
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

// ── 简单内存缓存（TTL 1小时）─────────────────────────────────────────
interface CacheEntry<T> {
  data: T;
  expireAt: number;
}

class MemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private readonly ttlMs: number;

  constructor(ttlMs = 60 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expireAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T): void {
    this.store.set(key, { data, expireAt: Date.now() + this.ttlMs });
  }

  /** 删除指定前缀的所有缓存键 */
  deleteByPrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }
}

@Injectable()
export class ReportService {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  /** 图表数据缓存，key = `chart-data:${babyId}:${startDate}:${endDate}` */
  private readonly chartCache = new MemoryCache(60 * 60 * 1000);

  /**
   * 清除某个宝宝的所有图表缓存（在记录写入/更新/删除时调用）
   */
  invalidateChartCache(babyId: string): void {
    this.chartCache.deleteByPrefix(`chart-data:${babyId}:`);
  }

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
   * 获取图表逐日数据（带缓存）
   * GET /report/chart-data?babyId=&startDate=&endDate=
   */
  async getChartData(
    babyId: string,
    startDate: string,
    endDate: string,
  ): Promise<ChartData & { fromCache: boolean }> {
    const cacheKey = `chart-data:${babyId}:${startDate}:${endDate}`;
    const cached = this.chartCache.get<ChartData>(cacheKey);
    if (cached) {
      return { ...cached, fromCache: true };
    }

    // 并行查询各模块逐日数据
    const [feeding, diaper, sleep, health, growth] = await Promise.all([
      this.getDailyFeedingData(babyId, startDate, endDate),
      this.getDailyDiaperData(babyId, startDate, endDate),
      this.getDailySleepData(babyId, startDate, endDate),
      this.getDailyHealthData(babyId, startDate, endDate),
      this.getGrowthRecords(babyId, startDate, endDate),
    ]);

    const result: ChartData = { feeding, diaper, sleep, health, growth };
    this.chartCache.set(cacheKey, result);
    return { ...result, fromCache: false };
  }

  // ── 喂养逐日统计 ───────────────────────────────────────────────
  private async getDailyFeedingData(
    babyId: string,
    startDate: string,
    endDate: string,
  ): Promise<{ daily: DailyFeedingData[] }> {
    const [rows] = await this.db.query<any[]>(
      `SELECT
         DATE(record_time) AS day_date,
         SUM(CASE WHEN feed_type = 2 THEN COALESCE(formula_ml, 0) ELSE 0 END) AS formula_ml,
         COUNT(CASE WHEN feed_type = 1 THEN 1 END) AS breast_count,
         COUNT(CASE WHEN feed_type = 3 THEN 1 END) AS complementary_count
       FROM feeding_record
       WHERE baby_id = ? AND DATE(record_time) BETWEEN ? AND ?
       GROUP BY day_date ORDER BY day_date ASC`,
      [babyId, startDate, endDate],
    );
    return {
      daily: (rows as any[]).map((r) => ({
        date: r.day_date instanceof Date
          ? r.day_date.toISOString().slice(0, 10)
          : String(r.day_date),
        formulaMl: Number(r.formula_ml) || 0,
        breastCount: Number(r.breast_count) || 0,
        complementaryCount: Number(r.complementary_count) || 0,
      })),
    };
  }

  // ── 尿布逐日统计 ───────────────────────────────────────────────
  private async getDailyDiaperData(
    babyId: string,
    startDate: string,
    endDate: string,
  ): Promise<{ daily: DailyDiaperData[] }> {
    const [rows] = await this.db.query<any[]>(
      `SELECT
         DATE(record_time) AS day_date,
         COUNT(CASE WHEN diaper_type = 2 THEN 1 END) AS dirty_count,
         COUNT(CASE WHEN diaper_type = 1 THEN 1 END) AS wet_count,
         COUNT(CASE WHEN diaper_type = 3 THEN 1 END) AS mixed_count
       FROM diaper_record
       WHERE baby_id = ? AND DATE(record_time) BETWEEN ? AND ?
       GROUP BY day_date ORDER BY day_date ASC`,
      [babyId, startDate, endDate],
    );
    return {
      daily: (rows as any[]).map((r) => ({
        date: r.day_date instanceof Date
          ? r.day_date.toISOString().slice(0, 10)
          : String(r.day_date),
        dirtyCount: Number(r.dirty_count) || 0,
        wetCount: Number(r.wet_count) || 0,
        mixedCount: Number(r.mixed_count) || 0,
      })),
    };
  }

  // ── 睡眠逐日统计 ───────────────────────────────────────────────
  private async getDailySleepData(
    babyId: string,
    startDate: string,
    endDate: string,
  ): Promise<{ daily: DailySleepData[] }> {
    const [rows] = await this.db.query<any[]>(
      `SELECT
         DATE(start_time) AS day_date,
         SUM(duration_min) AS total_min
       FROM sleep_record
       WHERE baby_id = ? AND status = 2
         AND DATE(start_time) BETWEEN ? AND ?
       GROUP BY day_date ORDER BY day_date ASC`,
      [babyId, startDate, endDate],
    );
    return {
      daily: (rows as any[]).map((r) => ({
        date: r.day_date instanceof Date
          ? r.day_date.toISOString().slice(0, 10)
          : String(r.day_date),
        totalMin: Number(r.total_min) || 0,
      })),
    };
  }

  // ── 健康逐日数据 ───────────────────────────────────────────────
  private async getDailyHealthData(
    babyId: string,
    startDate: string,
    endDate: string,
  ): Promise<{ daily: DailyHealthData[] }> {
    // 每条记录单独返回（体温/情绪）
    const [rows] = await this.db.query<any[]>(
      `SELECT
         DATE(record_time) AS day_date,
         temperature,
         mood
       FROM health_record
       WHERE baby_id = ? AND DATE(record_time) BETWEEN ? AND ?
       ORDER BY record_time ASC`,
      [babyId, startDate, endDate],
    );
    return {
      daily: (rows as any[]).map((r) => ({
        date: r.day_date instanceof Date
          ? r.day_date.toISOString().slice(0, 10)
          : String(r.day_date),
        temperature: r.temperature != null ? Number(r.temperature) : null,
        mood: r.mood != null ? Number(r.mood) : null,
      })),
    };
  }

  // ── 生长记录全量（用于曲线） ────────────────────────────────────
  private async getGrowthRecords(
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
        date: r.record_date instanceof Date
          ? r.record_date.toISOString().slice(0, 10)
          : String(r.record_date),
        weightG: r.weight_g != null ? Number(r.weight_g) : null,
        heightMm: r.height_mm != null ? Number(r.height_mm) : null,
        headMm: r.head_mm != null ? Number(r.head_mm) : null,
      })),
    };
  }

  // ── 喂养统计 ──────────────────────────────────────────────────────
  private async getFeedingStats(
    babyId: string,
    startDate: string,
    endDate: string,
    days: number,
  ): Promise<FeedingStats> {
    const [rows] = await this.db.query<any[]>(
      `SELECT
         SUM(CASE WHEN feed_type = 2 THEN COALESCE(formula_ml, 0) ELSE 0 END) AS total_formula_ml,
         COUNT(CASE WHEN feed_type = 2 THEN 1 END)  AS formula_count,
         COUNT(CASE WHEN feed_type = 1 THEN 1 END)  AS breast_count,
         COUNT(CASE WHEN feed_type = 3 THEN 1 END)  AS complementary_count,
         COUNT(*)                                    AS total_count
       FROM feeding_record
       WHERE baby_id = ? AND DATE(record_time) BETWEEN ? AND ?`,
      [babyId, startDate, endDate],
    );
    const r = rows[0] ?? {};
    const totalFormulaMl = Number(r.total_formula_ml) || 0;

    // 每日奶量图表
    const [chartRows] = await this.db.query<any[]>(
      `SELECT DATE(record_time) AS day_date, SUM(COALESCE(formula_ml, 0)) AS ml
       FROM feeding_record
       WHERE baby_id = ? AND feed_type = 2 AND DATE(record_time) BETWEEN ? AND ?
       GROUP BY day_date ORDER BY day_date ASC`,
      [babyId, startDate, endDate],
    );

    return {
      totalFormulaMl,
      avgDailyFormulaMl: days > 0 ? Math.round(totalFormulaMl / days) : 0,
      formulaCount: Number(r.formula_count) || 0,
      breastCount: Number(r.breast_count) || 0,
      complementaryCount: Number(r.complementary_count) || 0,
      totalFeedCount: Number(r.total_count) || 0,
      dailyFormulaChart: (chartRows as any[]).map((cr) => ({
        date: cr.day_date instanceof Date
          ? cr.day_date.toISOString().slice(0, 10)
          : String(cr.day_date),
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
       WHERE baby_id = ? AND status = 2
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
         COUNT(*)                                  AS total_count,
         COUNT(CASE WHEN diaper_type = 1 THEN 1 END) AS wet_count,
         COUNT(CASE WHEN diaper_type = 2 THEN 1 END) AS dirty_count,
         COUNT(CASE WHEN diaper_type = 3 THEN 1 END) AS mixed_count,
         COUNT(CASE WHEN diaper_type = 4 THEN 1 END) AS dry_count
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
         COUNT(*)                                        AS total_count,
         COUNT(CASE WHEN activity_type = 1 THEN 1 END)  AS bath_count,
         COUNT(CASE WHEN activity_type = 2 THEN 1 END)  AS outdoor_count,
         COUNT(CASE WHEN activity_type = 3 THEN 1 END)  AS play_count,
         COUNT(CASE WHEN activity_type = 4 THEN 1 END)  AS tummy_time_count,
         COUNT(CASE WHEN activity_type = 5 THEN 1 END)  AS other_count
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
        ? (latest.record_date instanceof Date
            ? latest.record_date.toISOString().slice(0, 10)
            : String(latest.record_date))
        : null,
      weightTrend: (trendRows as any[])
        .reverse()
        .map((tr) => ({
          date: tr.record_date instanceof Date
            ? tr.record_date.toISOString().slice(0, 10)
            : String(tr.record_date),
          weightG: Number(tr.weight_g) || 0,
        })),
    };
  }

  // ── 健康统计 ──────────────────────────────────────────────────────
  private async getHealthStats(
    babyId: string,
    startDate: string,
    endDate: string,
  ): Promise<HealthStats> {
    const [rows] = await this.db.query<any[]>(
      `SELECT
         AVG(temperature)                              AS avg_temp,
         MAX(temperature)                              AS max_temp,
         COUNT(CASE WHEN temperature > 37.5 THEN 1 END) AS fever_count,
         COUNT(CASE WHEN mood = 1 THEN 1 END)          AS happy_count,
         COUNT(CASE WHEN mood = 2 THEN 1 END)          AS neutral_count,
         COUNT(CASE WHEN mood = 3 THEN 1 END)          AS fussy_count,
         COUNT(CASE WHEN mood = 4 THEN 1 END)          AS crying_count
       FROM health_record
       WHERE baby_id = ? AND DATE(record_time) BETWEEN ? AND ?`,
      [babyId, startDate, endDate],
    );
    const r = rows[0] ?? {};
    const avgTemp = r.avg_temp != null ? Math.round(Number(r.avg_temp) * 10) / 10 : null;
    const maxTemp = r.max_temp != null ? Math.round(Number(r.max_temp) * 10) / 10 : null;
    return {
      avgTemperature: avgTemp,
      maxTemperature: maxTemp,
      moodHappyCount: Number(r.happy_count) || 0,
      moodNeutralCount: Number(r.neutral_count) || 0,
      moodFussyCount: Number(r.fussy_count) || 0,
      moodCryingCount: Number(r.crying_count) || 0,
      feverCount: Number(r.fever_count) || 0,
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
        ? (r.last_visit_date instanceof Date
            ? r.last_visit_date.toISOString().slice(0, 10)
            : String(r.last_visit_date))
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
      status: Number(r.status),
      firstIntroAt: r.first_intro_at instanceof Date
        ? r.first_intro_at.toISOString().slice(0, 10)
        : String(r.first_intro_at),
    }));
    return {
      observingCount: items.filter((i) => i.status === 1).length,
      safeCount: items.filter((i) => i.status === 2).length,
      allergicCount: items.filter((i) => i.status === 3).length,
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
      startDate: r.start_date instanceof Date
        ? r.start_date.toISOString().slice(0, 10)
        : String(r.start_date),
      endDate: r.end_date instanceof Date
        ? r.end_date.toISOString().slice(0, 10)
        : String(r.end_date),
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
      startDate: r.start_date instanceof Date
        ? r.start_date.toISOString().slice(0, 10)
        : String(r.start_date),
      endDate: r.end_date instanceof Date
        ? r.end_date.toISOString().slice(0, 10)
        : String(r.end_date),
      days: Number(r.days),
      createdAt: r.created_at instanceof Date
        ? r.created_at.toISOString()
        : String(r.created_at),
      summary: JSON.parse(r.summary_json as string) as ReportSummary,
    };
  }
}
