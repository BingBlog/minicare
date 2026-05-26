import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { DATABASE_POOL } from '../../common/database/database.module';
import { FeedFilterType, FeedQueryDto } from './dto/feed-query.dto';

type SummaryTheme = 'pink' | 'warm' | 'purple' | 'fever';

interface FeedSummary {
  title: string;
  tags?: string[];
  value?: string;
  unit?: string;
  theme?: SummaryTheme;
  active?: boolean;
}

interface FeedCursor {
  t: string;
  id: string;
}

export interface FeedItem {
  id: string;
  type: Exclude<FeedFilterType, 'all'>;
  event_time: string;
  note?: string | null;
  summary: FeedSummary;
  detail?: Record<string, unknown>;
}

export interface FeedListResponse {
  items: FeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

@Injectable()
export class FeedService {
  private readonly feedReadSource = (process.env.FEED_READ_SOURCE ?? 'union').toLowerCase();

  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  async list(query: FeedQueryDto): Promise<FeedListResponse> {
    const filterDate = this.resolveFilterDate(query.date);
    if (filterDate) {
      return this.listSingleDate(query, filterDate);
    }
    if (this.feedReadSource !== 'union') {
      const timelineResult = await this.tryListFromTimeline(query, filterDate);
      if (timelineResult) return timelineResult;
    }
    return this.listFromUnion(query, filterDate);
  }

  /**
   * 单日筛选固定一次性返回整天数据，不走分页/游标。
   * 这样前端无需触底加载，且旧版本误传 cursor 也不会继续翻页。
   */
  private async listSingleDate(query: FeedQueryDto, filterDate: string): Promise<FeedListResponse> {
    const type = (query.type ?? 'all') as FeedFilterType;
    if (this.feedReadSource !== 'union') {
      try {
        const rows = await this.queryTimelineSameDayRows(query.baby_id, type, null, filterDate);
        return {
          items: rows.map((row) => this.mapTimelineRow(row)),
          nextCursor: null,
          hasMore: false,
        };
      } catch (err: any) {
        if (!(err?.code === 'ER_NO_SUCH_TABLE' || err?.errno === 1146)) {
          throw err;
        }
      }
    }

    const { baseSql, baseParams } = this.buildBaseQuery(type, query.baby_id);
    const rows = await this.querySameDayRows(baseSql, baseParams, null, filterDate);
    return {
      items: rows.map((row) => this.mapRow(row)),
      nextCursor: null,
      hasMore: false,
    };
  }

  private async listFromUnion(query: FeedQueryDto, filterDate?: string): Promise<FeedListResponse> {
    const type = (query.type ?? 'all') as FeedFilterType;
    const limit = query.limit ?? 20;
    const cursor = this.decodeCursor(query.cursor);

    const { baseSql, baseParams } = this.buildBaseQuery(type, query.baby_id);
    const initialRows = await this.queryFeedRows(baseSql, baseParams, cursor, limit + 1, filterDate);
    if (initialRows.length === 0) {
      return { items: [], nextCursor: null, hasMore: false };
    }

    const initialHasOverflow = initialRows.length > limit;
    let pageRows = initialHasOverflow ? initialRows.slice(0, limit) : initialRows;

    // 做法 A：limit 作为最小条数，若页尾落在某一天中间，补齐该天剩余数据（按日筛选时无需补齐）
    if (!filterDate && initialHasOverflow && pageRows.length > 0) {
      const tailDate = this.getDateKey(pageRows[pageRows.length - 1].event_time);
      const dayRows = await this.querySameDayRows(baseSql, baseParams, cursor, tailDate);
      pageRows = this.mergeAndSortRows(pageRows, dayRows);
    }

    const items = pageRows.map((row) => this.mapRow(row));
    const oldest = items[items.length - 1];
    if (!oldest) {
      return { items: [], nextCursor: null, hasMore: false };
    }

    const hasMore = await this.checkHasMore(baseSql, baseParams, cursor, oldest, filterDate);
    const nextCursor = hasMore ? this.encodeCursor({ t: oldest.event_time, id: oldest.id }) : null;

    return { items, nextCursor, hasMore };
  }

  private async tryListFromTimeline(query: FeedQueryDto, filterDate?: string): Promise<FeedListResponse | null> {
    try {
      const result = await this.listFromTimeline(query, filterDate);
      if (!query.cursor && result.items.length === 0) return null;
      return result;
    } catch (err: any) {
      if (err?.code === 'ER_NO_SUCH_TABLE' || err?.errno === 1146) return null;
      throw err;
    }
  }

  private async listFromTimeline(query: FeedQueryDto, filterDate?: string): Promise<FeedListResponse> {
    const type = (query.type ?? 'all') as FeedFilterType;
    const limit = query.limit ?? 20;
    const cursor = this.decodeCursor(query.cursor);

    const initialRows = await this.queryTimelineRows(query.baby_id, type, cursor, limit + 1, filterDate);
    if (initialRows.length === 0) {
      return { items: [], nextCursor: null, hasMore: false };
    }

    const initialHasOverflow = initialRows.length > limit;
    let pageRows = initialHasOverflow ? initialRows.slice(0, limit) : initialRows;

    if (!filterDate && initialHasOverflow && pageRows.length > 0) {
      const tailDate = this.getDateKey(pageRows[pageRows.length - 1].event_time);
      const dayRows = await this.queryTimelineSameDayRows(query.baby_id, type, cursor, tailDate);
      pageRows = this.mergeTimelineRows(pageRows, dayRows);
    }

    const items = pageRows.map((row) => this.mapTimelineRow(row));
    const oldest = pageRows[pageRows.length - 1];
    if (!oldest) return { items: [], nextCursor: null, hasMore: false };

    const oldestTime = this.toSqlDateTime(oldest.event_time);
    const hasMore = await this.checkTimelineHasMore(query.baby_id, type, cursor, oldest, filterDate);
    const nextCursor = hasMore
      ? this.encodeCursor({ t: oldestTime, id: String(oldest.timeline_id) })
      : null;

    return { items, nextCursor, hasMore };
  }

  private async queryTimelineRows(
    babyId: string,
    type: FeedFilterType,
    cursor: FeedCursor | null,
    limit: number,
    filterDate?: string,
  ): Promise<any[]> {
    const params: Array<string | number> = [babyId];
    const whereClauses = ['baby_id = ?'];
    if (type !== 'all') {
      whereClauses.push('source_type = ?');
      params.push(type);
    }
    this.appendDateRangeToWhere(whereClauses, params, filterDate);
    if (cursor) {
      whereClauses.push('(event_time < ? OR (event_time = ? AND timeline_id < ?))');
      params.push(cursor.t, cursor.t, Number(cursor.id));
    }
    params.push(limit);

    const sql = `
      SELECT timeline_id, source_type, source_id, event_time, note,
             summary_title, summary_tags_json, summary_value, summary_unit, summary_theme, summary_active,
             detail_json
      FROM record_timeline
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY event_time DESC, timeline_id DESC
      LIMIT ?
    `;
    const [rows] = await this.db.query<any[]>(sql, params);
    return rows;
  }

  private async queryTimelineSameDayRows(
    babyId: string,
    type: FeedFilterType,
    cursor: FeedCursor | null,
    dateKey: string,
  ): Promise<any[]> {
    const dayStart = `${dateKey} 00:00:00`;
    const dayEnd = `${this.getNextDate(dateKey)} 00:00:00`;
    const params: Array<string | number> = [babyId, dayStart, dayEnd];
    const whereClauses = ['baby_id = ?', 'event_time >= ?', 'event_time < ?'];

    if (type !== 'all') {
      whereClauses.push('source_type = ?');
      params.push(type);
    }
    if (cursor) {
      whereClauses.push('(event_time < ? OR (event_time = ? AND timeline_id < ?))');
      params.push(cursor.t, cursor.t, Number(cursor.id));
    }

    const sql = `
      SELECT timeline_id, source_type, source_id, event_time, note,
             summary_title, summary_tags_json, summary_value, summary_unit, summary_theme, summary_active,
             detail_json
      FROM record_timeline
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY event_time DESC, timeline_id DESC
    `;
    const [rows] = await this.db.query<any[]>(sql, params);
    return rows;
  }

  private mergeTimelineRows(baseRows: any[], appendRows: any[]): any[] {
    const map = new Map<string, any>();
    for (const row of [...baseRows, ...appendRows]) {
      map.set(String(row.timeline_id), row);
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.event_time !== b.event_time) return a.event_time < b.event_time ? 1 : -1;
      return Number(b.timeline_id) - Number(a.timeline_id);
    });
  }

  private async checkTimelineHasMore(
    babyId: string,
    type: FeedFilterType,
    cursor: FeedCursor | null,
    oldestRow: any,
    filterDate?: string,
  ): Promise<boolean> {
    const params: Array<string | number> = [babyId];
    const whereClauses = ['baby_id = ?'];
    if (type !== 'all') {
      whereClauses.push('source_type = ?');
      params.push(type);
    }
    this.appendDateRangeToWhere(whereClauses, params, filterDate);
    whereClauses.push('(event_time < ? OR (event_time = ? AND timeline_id < ?))');
    const oldestTime = this.toSqlDateTime(oldestRow.event_time);
    params.push(oldestTime, oldestTime, Number(oldestRow.timeline_id));

    if (cursor) {
      whereClauses.push('(event_time < ? OR (event_time = ? AND timeline_id < ?))');
      params.push(cursor.t, cursor.t, Number(cursor.id));
    }

    const sql = `
      SELECT timeline_id
      FROM record_timeline
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY event_time DESC, timeline_id DESC
      LIMIT 1
    `;
    const [rows] = await this.db.query<any[]>(sql, params);
    return rows.length > 0;
  }

  private mapTimelineRow(row: any): FeedItem {
    const tagsRaw = this.tryParseJson(row.summary_tags_json);
    const tags = Array.isArray(tagsRaw) ? tagsRaw.map((x) => String(x)).filter(Boolean) : [];
    const detail = this.parseDetail(row.detail_json);

    return {
      id: row.source_id,
      type: row.source_type,
      event_time: this.toApiDateTime(row.event_time),
      note: row.note ?? null,
      summary: {
        title: row.summary_title ?? '记录',
        tags,
        value: row.summary_value ?? undefined,
        unit: row.summary_unit ?? undefined,
        theme: row.summary_theme ?? undefined,
        active: !!row.summary_active,
      },
      detail,
    };
  }

  private buildBaseQuery(type: FeedFilterType, babyId: string): { baseSql: string; baseParams: string[] } {
    if (type === 'all') {
      return this.buildAllTypeQuery(babyId);
    }
    return this.buildSingleTypeQuery(type, babyId);
  }

  private buildAllTypeQuery(babyId: string): { baseSql: string; baseParams: string[] } {
    const parts = [
      this.feedingBreastSql(),
      this.feedingFormulaSql(),
      this.feedingFoodSql(),
      this.feedingSupplementSql(),
      this.sleepSql(),
      this.diaperSql(),
      this.activitySql(),
      this.healthSql(),
      this.symptomSql(),
      this.growthSql(),
      this.medicalSql(),
    ];
    return {
      baseSql: parts.join(' UNION ALL '),
      baseParams: Array(parts.length).fill(babyId),
    };
  }

  private buildSingleTypeQuery(type: Exclude<FeedFilterType, 'all'>, babyId: string): { baseSql: string; baseParams: string[] } {
    const sqlMap: Record<Exclude<FeedFilterType, 'all'>, string> = {
      feeding: [
        this.feedingBreastSql(),
        this.feedingFormulaSql(),
        this.feedingFoodSql(),
        this.feedingSupplementSql(),
      ].join(' UNION ALL '),
      sleep: this.sleepSql(),
      diaper: this.diaperSql(),
      activity: this.activitySql(),
      health: this.healthSql(),
      symptom: this.symptomSql(),
      growth: this.growthSql(),
      medical: this.medicalSql(),
    };
    const sql = sqlMap[type];
    const feedingPartCount = 4;
    const paramCount = type === 'feeding' ? feedingPartCount : 1;
    return {
      baseSql: sql,
      baseParams: Array(paramCount).fill(babyId),
    };
  }

  private feedingBreastSql(): string {
    return `
      SELECT
        id,
        'feeding' AS type,
        record_time AS event_time,
        note,
        JSON_OBJECT(
          'feed_type', 'breast',
          'breast_side', breast_side,
          'duration_min', duration_min
        ) AS detail_json
      FROM feeding_breast_record
      WHERE baby_id = ?
    `;
  }

  private feedingFormulaSql(): string {
    return `
      SELECT
        ff.id,
        'feeding' AS type,
        ff.record_time AS event_time,
        ff.note,
        JSON_OBJECT(
          'feed_type', 'formula',
          'formula_ml', ff.formula_ml,
          'milk_types', (
            SELECT JSON_ARRAYAGG(mix.milk_type)
            FROM feeding_formula_mix mix
            WHERE mix.record_id = ff.id
          ),
          'milk_scoops', (
            SELECT JSON_OBJECTAGG(mix.milk_type, mix.scoops)
            FROM feeding_formula_mix mix
            WHERE mix.record_id = ff.id
          )
        ) AS detail_json
      FROM feeding_formula_record ff
      WHERE ff.baby_id = ?
    `;
  }

  private feedingFoodSql(): string {
    return `
      SELECT
        f.id,
        'feeding' AS type,
        f.record_time AS event_time,
        f.note,
        JSON_OBJECT(
          'feed_type', 'complementary',
          'complementary_food', (
            SELECT GROUP_CONCAT(fi.food_name SEPARATOR '、')
            FROM feeding_food_item fi
            WHERE fi.record_id = f.id
          ),
          'amount_g', (
            SELECT MAX(fi.amount_g)
            FROM feeding_food_item fi
            WHERE fi.record_id = f.id
          )
        ) AS detail_json
      FROM feeding_food_record f
      WHERE f.baby_id = ?
    `;
  }

  private feedingSupplementSql(): string {
    return `
      SELECT
        id,
        'feeding' AS type,
        record_time AS event_time,
        note,
        JSON_OBJECT(
          'feed_type', 'supplement',
          'complementary_food', '营养素',
          'supplement_items', supplement_items
        ) AS detail_json
      FROM feeding_supplement_record
      WHERE baby_id = ?
    `;
  }

  private sleepSql(): string {
    return `
      SELECT
        id,
        'sleep' AS type,
        start_time AS event_time,
        note,
        JSON_OBJECT(
          'duration_min', duration_min,
          'sleep_period', sleep_period,
          'quality', quality,
          'status', status,
          'start_time', start_time,
          'end_time', end_time
        ) AS detail_json
      FROM sleep_record
      WHERE baby_id = ?
    `;
  }

  private diaperSql(): string {
    return `
      SELECT
        id,
        'diaper' AS type,
        record_time AS event_time,
        note,
        JSON_OBJECT(
          'diaper_type', diaper_type,
          'poop_type', poop_type,
          'diaper_count', diaper_count
        ) AS detail_json
      FROM diaper_record
      WHERE baby_id = ?
    `;
  }

  private activitySql(): string {
    return `
      SELECT
        id,
        'activity' AS type,
        record_time AS event_time,
        note,
        JSON_OBJECT(
          'activity_type', activity_type,
          'duration_min', duration_min,
          'intensity', intensity
        ) AS detail_json
      FROM activity_record
      WHERE baby_id = ?
    `;
  }

  private healthSql(): string {
    return `
      SELECT
        id,
        'health' AS type,
        record_time AS event_time,
        note,
        JSON_OBJECT(
          'temperature', temperature,
          'allergy_symptoms', allergy_symptoms,
          'medications', medications
        ) AS detail_json
      FROM health_record
      WHERE baby_id = ?
    `;
  }

  private symptomSql(): string {
    return `
      SELECT
        id,
        'symptom' AS type,
        record_time AS event_time,
        note,
        JSON_OBJECT(
          'mood', mood,
          'spirit', spirit,
          'symptoms', symptoms
        ) AS detail_json
      FROM symptom_record
      WHERE baby_id = ?
    `;
  }

  private growthSql(): string {
    return `
      SELECT
        id,
        'growth' AS type,
        CONCAT(record_date, ' 00:00:00') AS event_time,
        note,
        JSON_OBJECT(
          'record_date', record_date,
          'height_mm', height_mm,
          'weight_g', weight_g,
          'head_mm', head_mm
        ) AS detail_json
      FROM growth_record
      WHERE baby_id = ?
    `;
  }

  private medicalSql(): string {
    return `
      SELECT
        id,
        'medical' AS type,
        CONCAT(visit_date, ' 00:00:00') AS event_time,
        note,
        JSON_OBJECT(
          'visit_date', visit_date,
          'visit_type', visit_type,
          'hospital', hospital,
          'diagnosis', diagnosis
        ) AS detail_json
      FROM medical_record
      WHERE baby_id = ?
    `;
  }

  private mapRow(row: any): FeedItem {
    const detail = this.parseDetail(row.detail_json);
    return {
      id: row.id,
      type: row.type,
      event_time: this.toApiDateTime(row.event_time),
      note: row.note ?? null,
      summary: this.buildSummary(row.type, detail),
      detail,
    };
  }

  private parseDetail(raw: unknown): Record<string, unknown> {
    if (raw == null) return {};
    const parsed = typeof raw === 'string' ? this.tryParseJson(raw) : raw;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const detail = { ...(parsed as Record<string, unknown>) };
    detail.supplement_items = this.tryParseJson(detail.supplement_items);
    detail.milk_types = this.tryParseJson(detail.milk_types);
    detail.milk_scoops = this.tryParseJson(detail.milk_scoops);
    detail.medications = this.tryParseJson(detail.medications);
    detail.allergy_symptoms = this.tryParseJson(detail.allergy_symptoms);
    detail.symptoms = this.tryParseJson(detail.symptoms);
    return detail;
  }

  private tryParseJson(val: unknown): unknown {
    if (val == null) return null;
    if (typeof val !== 'string') return val;
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }

  private buildSummary(type: string, detail: Record<string, unknown>): FeedSummary {
    if (type === 'feeding') return this.buildFeedingSummary(detail);
    if (type === 'sleep') return this.buildSleepSummary(detail);
    if (type === 'diaper') return this.buildDiaperSummary(detail);
    if (type === 'activity') return this.buildActivitySummary(detail);
    if (type === 'health') return this.buildHealthSummary(detail);
    if (type === 'growth') return this.buildGrowthSummary(detail);
    if (type === 'medical') return this.buildMedicalSummary(detail);
    if (type === 'symptom') return this.buildSymptomSummary(detail);
    return { title: '记录' };
  }

  private buildFeedingSummary(detail: Record<string, unknown>): FeedSummary {
    const feedType = String(detail.feed_type ?? '');
    if (feedType === 'formula') {
      const value = detail.formula_ml != null ? String(detail.formula_ml) : undefined;
      return { title: '配方奶', value, unit: value ? 'ml' : undefined, theme: 'pink' };
    }
    if (feedType === 'breast') {
      const duration = Number(detail.duration_min ?? 0);
      return {
        title: '母乳',
        tags: [this.getBreastSideLabel(String(detail.breast_side ?? 'both'))],
        value: duration > 0 ? this.formatDuration(duration) : undefined,
        theme: 'pink',
      };
    }
    if (feedType === 'supplement') return { title: '营养素', theme: 'purple' };
    const food = String(detail.complementary_food ?? '');
    const amount = Number(detail.amount_g ?? 0);
    return {
      title: '辅食',
      tags: food ? [food] : [],
      value: amount > 0 ? String(amount) : undefined,
      unit: amount > 0 ? 'g' : undefined,
      theme: 'warm',
    };
  }

  private buildSleepSummary(detail: Record<string, unknown>): FeedSummary {
    const status = String(detail.status ?? '');
    const duration = Number(detail.duration_min ?? 0);
    return {
      title: status === 'ongoing' ? '睡眠中' : '睡眠',
      tags: status === 'ongoing' ? ['进行中'] : [],
      value: duration > 0 ? this.formatDuration(duration) : undefined,
      theme: status === 'ongoing' ? 'pink' : 'warm',
      active: status === 'ongoing',
    };
  }

  private buildDiaperSummary(detail: Record<string, unknown>): FeedSummary {
    const diaperType = String(detail.diaper_type ?? '');
    const tags: string[] = [];
    if (diaperType === 'wet') tags.push('嘘嘘');
    if (diaperType === 'dirty') tags.push('臭臭');
    if (diaperType === 'mixed') tags.push('嘘嘘', '臭臭');
    if (diaperType === 'dry') tags.push('干净');
    return { title: '换尿布', tags, theme: 'warm' };
  }

  private buildActivitySummary(detail: Record<string, unknown>): FeedSummary {
    const duration = Number(detail.duration_min ?? 0);
    return {
      title: '活动',
      value: duration > 0 ? this.formatDuration(duration) : undefined,
      theme: 'warm',
    };
  }

  private buildHealthSummary(detail: Record<string, unknown>): FeedSummary {
    const temp = Number(detail.temperature ?? 0);
    const isFever = Number.isFinite(temp) && temp >= 37.5;
    return {
      title: '健康',
      value: Number.isFinite(temp) && temp > 0 ? String(temp) : undefined,
      unit: Number.isFinite(temp) && temp > 0 ? '℃' : undefined,
      theme: isFever ? 'fever' : 'pink',
      active: isFever,
    };
  }

  private buildGrowthSummary(detail: Record<string, unknown>): FeedSummary {
    const h = detail.height_mm != null ? `${(Number(detail.height_mm) / 10).toFixed(1)}cm` : '';
    const w = detail.weight_g != null ? `${(Number(detail.weight_g) / 1000).toFixed(2)}kg` : '';
    const tags = [h, w].filter(Boolean);
    return { title: '生长', tags, theme: 'purple' };
  }

  private buildMedicalSummary(detail: Record<string, unknown>): FeedSummary {
    const hospital = String(detail.hospital ?? '');
    return { title: '医疗', tags: hospital ? [hospital] : [], theme: 'purple' };
  }

  private buildSymptomSummary(detail: Record<string, unknown>): FeedSummary {
    const mood = String(detail.mood ?? '');
    const spirit = String(detail.spirit ?? '');
    return { title: '表现', tags: [mood, spirit].filter(Boolean), theme: 'purple' };
  }

  private getBreastSideLabel(side: string): string {
    if (side === 'left') return '左乳';
    if (side === 'right') return '右乳';
    return '双侧';
  }

  private formatDuration(min: number): string {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  }

  private encodeCursor(cursor: FeedCursor): string {
    return Buffer.from(JSON.stringify(cursor)).toString('base64url');
  }

  private getDateKey(eventTime: unknown): string {
    return this.toSqlDateTime(eventTime).slice(0, 10);
  }

  private getNextDate(dateStr: string): string {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + 1));
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private toSqlDateTime(value: unknown): string {
    if (value instanceof Date) {
      const y = value.getFullYear();
      const m = String(value.getMonth() + 1).padStart(2, '0');
      const d = String(value.getDate()).padStart(2, '0');
      const hh = String(value.getHours()).padStart(2, '0');
      const mm = String(value.getMinutes()).padStart(2, '0');
      const ss = String(value.getSeconds()).padStart(2, '0');
      return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().replace('T', ' ').replace('Z', '');
      return normalized.length >= 19 ? normalized.slice(0, 19) : normalized;
    }
    return '';
  }

  private toApiDateTime(value: unknown): string {
    const sqlDateTime = this.toSqlDateTime(value);
    return sqlDateTime ? sqlDateTime.replace(' ', 'T') : '';
  }

  private async queryFeedRows(
    baseSql: string,
    baseParams: Array<string | number>,
    cursor: FeedCursor | null,
    limit: number,
    filterDate?: string,
  ): Promise<any[]> {
    const params: Array<string | number> = [...baseParams];
    const whereClauses: string[] = [];
    this.appendDateRangeToWhere(whereClauses, params, filterDate);
    if (cursor) {
      whereClauses.push('(event_time < ? OR (event_time = ? AND id < ?))');
      params.push(cursor.t, cursor.t, cursor.id);
    }
    let sql = `SELECT id, type, event_time, note, detail_json FROM (${baseSql}) feed`;
    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }
    sql += ' ORDER BY event_time DESC, id DESC LIMIT ?';
    params.push(limit);
    const [rows] = await this.db.query<any[]>(sql, params);
    return rows;
  }

  private async querySameDayRows(
    baseSql: string,
    baseParams: Array<string | number>,
    cursor: FeedCursor | null,
    dateKey: string,
  ): Promise<any[]> {
    const dayStart = `${dateKey} 00:00:00`;
    const dayEnd = `${this.getNextDate(dateKey)} 00:00:00`;
    const params: Array<string | number> = [...baseParams];

    let sql = `SELECT id, type, event_time, note, detail_json FROM (${baseSql}) feed`;
    const whereClauses: string[] = ['event_time >= ? AND event_time < ?'];
    params.push(dayStart, dayEnd);

    if (cursor) {
      whereClauses.push('(event_time < ? OR (event_time = ? AND id < ?))');
      params.push(cursor.t, cursor.t, cursor.id);
    }

    sql += ` WHERE ${whereClauses.join(' AND ')}`;
    sql += ' ORDER BY event_time DESC, id DESC';

    const [rows] = await this.db.query<any[]>(sql, params);
    return rows;
  }

  private mergeAndSortRows(baseRows: any[], appendRows: any[]): any[] {
    const map = new Map<string, any>();
    for (const row of [...baseRows, ...appendRows]) {
      map.set(`${row.type}:${row.id}`, row);
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.event_time !== b.event_time) return a.event_time < b.event_time ? 1 : -1;
      return a.id < b.id ? 1 : -1;
    });
  }

  private async checkHasMore(
    baseSql: string,
    baseParams: Array<string | number>,
    cursor: FeedCursor | null,
    oldest: FeedItem,
    filterDate?: string,
  ): Promise<boolean> {
    const params: Array<string | number> = [...baseParams];
    const whereClauses: string[] = [];
    this.appendDateRangeToWhere(whereClauses, params, filterDate);
    whereClauses.push('(event_time < ? OR (event_time = ? AND id < ?))');
    params.push(oldest.event_time, oldest.event_time, oldest.id);

    if (cursor) {
      whereClauses.push('(event_time < ? OR (event_time = ? AND id < ?))');
      params.push(cursor.t, cursor.t, cursor.id);
    }

    const sql = `
      SELECT id
      FROM (${baseSql}) feed
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY event_time DESC, id DESC
      LIMIT 1
    `;

    const [rows] = await this.db.query<any[]>(sql, params);
    return rows.length > 0;
  }

  private decodeCursor(cursor?: string): FeedCursor | null {
    if (!cursor) return null;
    try {
      const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as FeedCursor;
      if (!parsed?.t || !parsed?.id) throw new Error('invalid cursor');
      return parsed;
    } catch {
      throw new BadRequestException('cursor 参数无效');
    }
  }

  private resolveFilterDate(date?: string): string | undefined {
    if (!date) return undefined;
    const today = this.getTodayDateStr();
    if (date > today) {
      throw new BadRequestException('date 不能晚于今天');
    }
    return date;
  }

  private getTodayDateStr(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private buildDateRange(date: string): { dayStart: string; dayEnd: string } {
    return {
      dayStart: `${date} 00:00:00`,
      dayEnd: `${this.getNextDate(date)} 00:00:00`,
    };
  }

  private appendDateRangeToWhere(
    whereClauses: string[],
    params: Array<string | number>,
    filterDate?: string,
  ): void {
    if (!filterDate) return;
    const { dayStart, dayEnd } = this.buildDateRange(filterDate);
    whereClauses.push('event_time >= ?', 'event_time < ?');
    params.push(dayStart, dayEnd);
  }
}
