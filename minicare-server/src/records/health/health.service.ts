import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_POOL } from '../../common/database/database.module';
import { CreateHealthDto, UpdateHealthDto } from './dto/create-health.dto';
import { toMysqlDatetime, getBeijingToday, addDays } from '../../common/utils/date.util';
import { TimelineService } from '../timeline/timeline.service';

function parseJson(val: unknown): unknown {
  if (val == null) return null;
  if (typeof val === 'string') { try { return JSON.parse(val); } catch { return null; } }
  return val;
}

@Injectable()
export class HealthService {
  constructor(
    @Inject(DATABASE_POOL) private readonly db: Pool,
    private readonly timelineService: TimelineService,
  ) {}

  private mapRow(r: any) {
    return {
      ...r,
      // mood 字段已从 health_record 中删除（Migration 008），无需映射
      allergy_symptoms: parseJson(r.allergy_symptoms) ?? [],
      medications:      parseJson(r.medications) ?? [],
      skin_care:        parseJson(r.skin_care) ?? [],
    };
  }

  async create(userId: string, dto: CreateHealthDto) {
    const id = uuidv4();
    await this.db.execute(
      `INSERT INTO health_record
         (id, baby_id, recorded_by, record_time, temperature,
          allergy_symptoms, allergy_severity, medications, skin_care, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        dto.baby_id,
        userId,
        toMysqlDatetime(dto.record_time),
        dto.temperature        ?? null,
        dto.allergy_symptoms?.length  ? JSON.stringify(dto.allergy_symptoms) : null,
        dto.allergy_severity           ?? null,
        dto.medications?.length        ? JSON.stringify(dto.medications)      : null,
        dto.skin_care?.length          ? JSON.stringify(dto.skin_care)        : null,
        dto.note                       ?? null,
      ],
    );
    await this.timelineService.upsertFromSource('health', id);
    return { id };
  }

  async findAll(babyId: string, beforeDate?: string) {
    const endDate = beforeDate || addDays(getBeijingToday(), 1);
    const startDate = addDays(endDate, -7);
    const startDatetime = `${startDate} 00:00:00`;
    const endDatetime = `${endDate} 00:00:00`;

    const [rows] = await this.db.query<any[]>(
      `SELECT id, baby_id, recorded_by, record_time, temperature,
              allergy_symptoms, allergy_severity, medications, skin_care,
              note, created_at, updated_at
       FROM health_record
       WHERE baby_id = ? AND record_time >= ? AND record_time < ?
       ORDER BY record_time DESC`,
      [babyId, startDatetime, endDatetime],
    );
    const items = rows.map((r) => this.mapRow(r));

    let hasMore = false;
    if (items.length > 0) {
      hasMore = true;
    } else {
      const [countResult] = await this.db.query<any[]>(
        `SELECT COUNT(*) AS total FROM health_record WHERE baby_id = ? AND record_time < ?`,
        [babyId, startDatetime],
      );
      hasMore = countResult[0]?.total > 0;
    }

    return { items, nextBeforeDate: hasMore ? startDate : null };
  }

  async findOne(id: string) {
    const [rows] = await this.db.execute<any[]>(
      `SELECT id, baby_id, recorded_by, record_time, temperature,
              allergy_symptoms, allergy_severity, medications, skin_care,
              note, created_at, updated_at
       FROM health_record WHERE id = ?`,
      [id],
    );
    if (!rows[0]) return null;
    return this.mapRow(rows[0]);
  }

  async update(id: string, dto: UpdateHealthDto) {
    const [rows] = await this.db.execute<any[]>('SELECT id FROM health_record WHERE id = ?', [id]);
    if (rows.length === 0) throw new NotFoundException('找不到该健康记录');

    const setClauses: string[] = [];
    const values: any[] = [];

    if (dto.record_time       !== undefined) { setClauses.push('record_time = ?');       values.push(toMysqlDatetime(dto.record_time)); }
    if (dto.temperature       !== undefined) { setClauses.push('temperature = ?');       values.push(dto.temperature ?? null); }
    if (dto.allergy_symptoms  !== undefined) { setClauses.push('allergy_symptoms = ?');  values.push(dto.allergy_symptoms?.length ? JSON.stringify(dto.allergy_symptoms) : null); }
    if (dto.allergy_severity  !== undefined) { setClauses.push('allergy_severity = ?');  values.push(dto.allergy_severity ?? null); }
    if (dto.medications       !== undefined) { setClauses.push('medications = ?');       values.push(dto.medications?.length ? JSON.stringify(dto.medications) : null); }
    if (dto.skin_care         !== undefined) { setClauses.push('skin_care = ?');         values.push(dto.skin_care?.length ? JSON.stringify(dto.skin_care) : null); }
    if (dto.note              !== undefined) { setClauses.push('note = ?');              values.push(dto.note ?? null); }

    if (setClauses.length > 0) {
      values.push(id);
      await this.db.execute(`UPDATE health_record SET ${setClauses.join(', ')} WHERE id = ?`, values);
      await this.timelineService.upsertFromSource('health', id);
    }

    const [updated] = await this.db.execute<any[]>(
      `SELECT id, baby_id, recorded_by, record_time, temperature,
              allergy_symptoms, allergy_severity, medications, skin_care,
              note, created_at, updated_at
       FROM health_record WHERE id = ?`,
      [id],
    );
    return this.mapRow(updated[0]);
  }

  async remove(id: string) {
    await this.db.execute('DELETE FROM health_record WHERE id = ?', [id]);
    await this.timelineService.removeBySource('health', id);
    return { id };
  }
}
