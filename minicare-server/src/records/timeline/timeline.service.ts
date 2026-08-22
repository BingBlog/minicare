import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { DATABASE_POOL } from '../../common/database/database.module';

type SourceType =
  | 'feeding'
  | 'sleep'
  | 'diaper'
  | 'activity'
  | 'health'
  | 'symptom'
  | 'growth'
  | 'medical'
  | 'medication';

@Injectable()
export class TimelineService {
  private readonly logger = new Logger(TimelineService.name);
  private readonly strictWrite = (process.env.TIMELINE_WRITE_MODE ?? 'best_effort').toLowerCase() === 'strict';

  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  async upsertFromSource(sourceType: SourceType, sourceId: string): Promise<void> {
    try {
      const payload = await this.loadSourcePayload(sourceType, sourceId);
      if (!payload) return;

      await this.db.execute(
        `INSERT INTO record_timeline
          (baby_id, source_type, source_id, event_time, note,
           summary_title, summary_tags_json, summary_value, summary_unit, summary_theme, summary_active,
           detail_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           baby_id = VALUES(baby_id),
           event_time = VALUES(event_time),
           note = VALUES(note),
           summary_title = VALUES(summary_title),
           summary_tags_json = VALUES(summary_tags_json),
           summary_value = VALUES(summary_value),
           summary_unit = VALUES(summary_unit),
           summary_theme = VALUES(summary_theme),
           summary_active = VALUES(summary_active),
           detail_json = VALUES(detail_json)`,
        [
          payload.babyId,
          sourceType,
          sourceId,
          payload.eventTime,
          payload.note,
          payload.summaryTitle,
          payload.summaryTagsJson,
          payload.summaryValue,
          payload.summaryUnit,
          payload.summaryTheme,
          payload.summaryActive ? 1 : 0,
          payload.detailJson,
        ],
      );
    } catch (err: any) {
      if (err?.code === 'ER_NO_SUCH_TABLE' || err?.errno === 1146) return;
      if (this.strictWrite) throw err;
      this.logger.warn(
        `skip timeline upsert (best_effort): sourceType=${sourceType}, sourceId=${sourceId}, reason=${err?.message ?? 'unknown error'}`,
      );
    }
  }

  async removeBySource(sourceType: SourceType, sourceId: string): Promise<void> {
    try {
      await this.db.execute(
        'DELETE FROM record_timeline WHERE source_type = ? AND source_id = ?',
        [sourceType, sourceId],
      );
    } catch (err: any) {
      if (err?.code === 'ER_NO_SUCH_TABLE' || err?.errno === 1146) return;
      if (this.strictWrite) throw err;
      this.logger.warn(
        `skip timeline remove (best_effort): sourceType=${sourceType}, sourceId=${sourceId}, reason=${err?.message ?? 'unknown error'}`,
      );
    }
  }

  private async loadSourcePayload(sourceType: SourceType, sourceId: string) {
    if (sourceType === 'feeding') return this.loadFeedingPayload(sourceId);
    if (sourceType === 'sleep') return this.loadSleepPayload(sourceId);
    if (sourceType === 'diaper') return this.loadDiaperPayload(sourceId);
    if (sourceType === 'activity') return this.loadActivityPayload(sourceId);
    if (sourceType === 'health') return this.loadHealthPayload(sourceId);
    if (sourceType === 'symptom') return this.loadSymptomPayload(sourceId);
    if (sourceType === 'growth') return this.loadGrowthPayload(sourceId);
    if (sourceType === 'medication') return this.loadMedicationPayload(sourceId);
    return this.loadMedicalPayload(sourceId);
  }

  private async loadFeedingPayload(sourceId: string) {
    const [b] = await this.db.query<any[]>(
      `SELECT id, baby_id, record_time, note, breast_side, duration_min
       FROM feeding_breast_record WHERE id = ? LIMIT 1`,
      [sourceId],
    );
    if (b[0]) {
      const detail = { feed_type: 'breast', breast_side: b[0].breast_side, duration_min: b[0].duration_min };
      return {
        babyId: b[0].baby_id,
        eventTime: b[0].record_time,
        note: b[0].note ?? null,
        summaryTitle: '母乳',
        summaryTagsJson: JSON.stringify([this.breastSideLabel(b[0].breast_side)]),
        summaryValue: b[0].duration_min != null ? String(b[0].duration_min) : null,
        summaryUnit: null,
        summaryTheme: 'pink',
        summaryActive: false,
        detailJson: JSON.stringify(detail),
      };
    }

    const [f] = await this.db.query<any[]>(
      `SELECT id, baby_id, record_time, note, formula_ml
       FROM feeding_formula_record WHERE id = ? LIMIT 1`,
      [sourceId],
    );
    if (f[0]) {
      const [mixes] = await this.db.query<any[]>(
        'SELECT milk_type, scoops FROM feeding_formula_mix WHERE record_id = ?',
        [sourceId],
      );
      const milkTypes = mixes.map((m) => m.milk_type);
      const milkScoops = mixes.reduce((acc: Record<string, number>, m) => {
        acc[m.milk_type] = Number(m.scoops);
        return acc;
      }, {});
      const detail = {
        feed_type: 'formula',
        formula_ml: f[0].formula_ml,
        milk_types: milkTypes,
        milk_scoops: milkScoops,
      };
      return {
        babyId: f[0].baby_id,
        eventTime: f[0].record_time,
        note: f[0].note ?? null,
        summaryTitle: '配方奶',
        summaryTagsJson: null,
        summaryValue: f[0].formula_ml != null ? String(f[0].formula_ml) : null,
        summaryUnit: f[0].formula_ml != null ? 'ml' : null,
        summaryTheme: 'pink',
        summaryActive: false,
        detailJson: JSON.stringify(detail),
      };
    }

    const [food] = await this.db.query<any[]>(
      `SELECT id, baby_id, record_time, note
       FROM feeding_food_record WHERE id = ? LIMIT 1`,
      [sourceId],
    );
    if (food[0]) {
      const [items] = await this.db.query<any[]>(
        'SELECT food_name, amount_g FROM feeding_food_item WHERE record_id = ? ORDER BY id',
        [sourceId],
      );
      const foodNames = items.map((it) => it.food_name).join('、');
      const amount = items[0]?.amount_g ?? null;
      const detail = {
        feed_type: 'complementary',
        complementary_food: foodNames,
        amount_g: amount,
      };
      return {
        babyId: food[0].baby_id,
        eventTime: food[0].record_time,
        note: food[0].note ?? null,
        summaryTitle: '辅食',
        summaryTagsJson: foodNames ? JSON.stringify([foodNames]) : null,
        summaryValue: amount != null ? String(amount) : null,
        summaryUnit: amount != null ? 'g' : null,
        summaryTheme: 'warm',
        summaryActive: false,
        detailJson: JSON.stringify(detail),
      };
    }

    const [s] = await this.db.query<any[]>(
      `SELECT id, baby_id, record_time, note, supplement_items
       FROM feeding_supplement_record WHERE id = ? LIMIT 1`,
      [sourceId],
    );
    if (!s[0]) return null;

    const detail = {
      feed_type: 'supplement',
      complementary_food: '营养素',
      supplement_items: this.tryParseJson(s[0].supplement_items),
    };
    return {
      babyId: s[0].baby_id,
      eventTime: s[0].record_time,
      note: s[0].note ?? null,
      summaryTitle: '营养素',
      summaryTagsJson: null,
      summaryValue: null,
      summaryUnit: null,
      summaryTheme: 'purple',
      summaryActive: false,
      detailJson: JSON.stringify(detail),
    };
  }

  private async loadSleepPayload(sourceId: string) {
    const [rows] = await this.db.query<any[]>(
      `SELECT id, baby_id, start_time, end_time, status, duration_min, sleep_period, quality, note
       FROM sleep_record WHERE id = ? LIMIT 1`,
      [sourceId],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    const detail = {
      status: r.status,
      duration_min: r.duration_min,
      sleep_period: r.sleep_period,
      quality: r.quality,
      start_time: r.start_time,
      end_time: r.end_time,
    };
    return {
      babyId: r.baby_id,
      eventTime: r.start_time,
      note: r.note ?? null,
      summaryTitle: r.status === 'ongoing' ? '睡眠中' : '睡眠',
      summaryTagsJson: r.status === 'ongoing' ? JSON.stringify(['进行中']) : null,
      summaryValue: r.duration_min != null ? String(r.duration_min) : null,
      summaryUnit: null,
      summaryTheme: r.status === 'ongoing' ? 'pink' : 'warm',
      summaryActive: r.status === 'ongoing',
      detailJson: JSON.stringify(detail),
    };
  }

  private async loadDiaperPayload(sourceId: string) {
    const [rows] = await this.db.query<any[]>(
      `SELECT id, baby_id, record_time, diaper_type, poop_type, diaper_count, note
       FROM diaper_record WHERE id = ? LIMIT 1`,
      [sourceId],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    const tags = this.diaperTags(r.diaper_type);
    return {
      babyId: r.baby_id,
      eventTime: r.record_time,
      note: r.note ?? null,
      summaryTitle: '换尿布',
      summaryTagsJson: tags.length ? JSON.stringify(tags) : null,
      summaryValue: null,
      summaryUnit: null,
      summaryTheme: 'warm',
      summaryActive: false,
      detailJson: JSON.stringify({
        diaper_type: r.diaper_type,
        poop_type: r.poop_type,
        diaper_count: r.diaper_count,
      }),
    };
  }

  private async loadActivityPayload(sourceId: string) {
    const [rows] = await this.db.query<any[]>(
      `SELECT id, baby_id, record_time, activity_type, duration_min, intensity, note
       FROM activity_record WHERE id = ? LIMIT 1`,
      [sourceId],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      babyId: r.baby_id,
      eventTime: r.record_time,
      note: r.note ?? null,
      summaryTitle: '活动',
      summaryTagsJson: null,
      summaryValue: r.duration_min != null ? String(r.duration_min) : null,
      summaryUnit: null,
      summaryTheme: 'warm',
      summaryActive: false,
      detailJson: JSON.stringify({
        activity_type: r.activity_type,
        duration_min: r.duration_min,
        intensity: r.intensity,
      }),
    };
  }

  private async loadHealthPayload(sourceId: string) {
    const [rows] = await this.db.query<any[]>(
      `SELECT id, baby_id, record_time, temperature, allergy_symptoms, medications, note
       FROM health_record WHERE id = ? LIMIT 1`,
      [sourceId],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    const temp = Number(r.temperature ?? 0);
    const isFever = Number.isFinite(temp) && temp >= 37.5;
    return {
      babyId: r.baby_id,
      eventTime: r.record_time,
      note: r.note ?? null,
      summaryTitle: '健康',
      summaryTagsJson: null,
      summaryValue: Number.isFinite(temp) && temp > 0 ? String(temp) : null,
      summaryUnit: Number.isFinite(temp) && temp > 0 ? '℃' : null,
      summaryTheme: isFever ? 'fever' : 'pink',
      summaryActive: isFever,
      detailJson: JSON.stringify({
        temperature: r.temperature,
        allergy_symptoms: this.tryParseJson(r.allergy_symptoms),
        medications: this.tryParseJson(r.medications),
      }),
    };
  }

  private async loadSymptomPayload(sourceId: string) {
    const [rows] = await this.db.query<any[]>(
      `SELECT id, baby_id, record_time, mood, spirit, symptoms, note
       FROM symptom_record WHERE id = ? LIMIT 1`,
      [sourceId],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      babyId: r.baby_id,
      eventTime: r.record_time,
      note: r.note ?? null,
      summaryTitle: '表现',
      summaryTagsJson: JSON.stringify([r.mood, r.spirit].filter(Boolean)),
      summaryValue: null,
      summaryUnit: null,
      summaryTheme: 'purple',
      summaryActive: false,
      detailJson: JSON.stringify({
        mood: r.mood,
        spirit: r.spirit,
        symptoms: this.tryParseJson(r.symptoms),
      }),
    };
  }

  private async loadGrowthPayload(sourceId: string) {
    const [rows] = await this.db.query<any[]>(
      `SELECT id, baby_id, record_date, height_mm, weight_g, head_mm, note
       FROM growth_record WHERE id = ? LIMIT 1`,
      [sourceId],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    const tags = [
      r.height_mm != null ? `${(Number(r.height_mm) / 10).toFixed(1)}cm` : '',
      r.weight_g != null ? `${(Number(r.weight_g) / 1000).toFixed(2)}kg` : '',
    ].filter(Boolean);
    return {
      babyId: r.baby_id,
      eventTime: `${r.record_date} 00:00:00`,
      note: r.note ?? null,
      summaryTitle: '生长',
      summaryTagsJson: tags.length ? JSON.stringify(tags) : null,
      summaryValue: null,
      summaryUnit: null,
      summaryTheme: 'purple',
      summaryActive: false,
      detailJson: JSON.stringify({
        record_date: r.record_date,
        height_mm: r.height_mm,
        weight_g: r.weight_g,
        head_mm: r.head_mm,
      }),
    };
  }

  private async loadMedicalPayload(sourceId: string) {
    const [rows] = await this.db.query<any[]>(
      `SELECT id, baby_id, visit_date, visit_time, visit_type, hospital, diagnosis, note
       FROM medical_record WHERE id = ? LIMIT 1`,
      [sourceId],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    // 有时间则用 visit_time，否则落到当日 00:00:00
    const eventTime = r.visit_time
      ? `${r.visit_date} ${r.visit_time}:00`
      : `${r.visit_date} 00:00:00`;
    return {
      babyId: r.baby_id,
      eventTime,
      note: r.note ?? null,
      summaryTitle: '医疗',
      summaryTagsJson: r.hospital ? JSON.stringify([r.hospital]) : null,
      summaryValue: null,
      summaryUnit: null,
      summaryTheme: 'purple',
      summaryActive: false,
      detailJson: JSON.stringify({
        visit_date: r.visit_date,
        visit_time: r.visit_time,
        visit_type: r.visit_type,
        hospital: r.hospital,
        diagnosis: r.diagnosis,
      }),
    };
  }

  private async loadMedicationPayload(sourceId: string) {
    const [rows] = await this.db.query<any[]>(
      `SELECT id, baby_id, medication_name, dose, record_time, note
       FROM medication_record WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [sourceId],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      babyId: r.baby_id,
      eventTime: r.record_time,
      note: r.note ?? null,
      summaryTitle: '用药',
      summaryTagsJson: r.medication_name ? JSON.stringify([r.medication_name]) : null,
      summaryValue: r.dose ?? null,
      summaryUnit: null,
      summaryTheme: 'purple',
      summaryActive: false,
      detailJson: JSON.stringify({
        medication_name: r.medication_name,
        dose: r.dose,
      }),
    };
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

  private breastSideLabel(side: string): string {
    if (side === 'left') return '左乳';
    if (side === 'right') return '右乳';
    return '双侧';
  }

  private diaperTags(diaperType: string): string[] {
    if (diaperType === 'wet') return ['嘘嘘'];
    if (diaperType === 'dirty') return ['臭臭'];
    if (diaperType === 'mixed') return ['嘘嘘', '臭臭'];
    if (diaperType === 'dry') return ['干净'];
    return [];
  }
}
