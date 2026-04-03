import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_POOL } from '../../common/database/database.module';
import {
  CreateActivityDto,
  UpdateActivityDto,
  ACTIVITY_TYPE_TO_INT,
  INT_TO_ACTIVITY_TYPE,
} from './dto/create-activity.dto';
import { toMysqlDatetime } from '../../common/utils/date.util';

@Injectable()
export class ActivityService {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  async create(userId: string, dto: CreateActivityDto) {
    const id = uuidv4();
    await this.db.execute(
      `INSERT INTO activity_record
         (id, baby_id, recorded_by, record_time, activity_type, duration_min, intensity, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        dto.baby_id,
        userId,
        toMysqlDatetime(dto.record_time),
        ACTIVITY_TYPE_TO_INT[dto.activity_type] ?? 5,
        dto.duration_min ?? null,
        dto.intensity    ?? null,
        dto.note         ?? null,
      ],
    );
    return { id };
  }

  async findAll(babyId: string, limit = 20, offset = 0) {
    const safeLimit  = Math.max(1, Math.min(200, Math.floor(Number(limit)  || 20)));
    const safeOffset = Math.max(0, Math.floor(Number(offset) || 0));
    const [rows] = await this.db.query<any[]>(
      `SELECT * FROM activity_record WHERE baby_id = ? ORDER BY record_time DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      [babyId],
    );
    return rows.map((r) => ({
      ...r,
      activity_type: INT_TO_ACTIVITY_TYPE[r.activity_type] ?? r.activity_type,
    }));
  }

  async findOne(id: string) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT * FROM activity_record WHERE id = ?',
      [id],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return { ...r, activity_type: INT_TO_ACTIVITY_TYPE[r.activity_type] ?? r.activity_type };
  }

  async update(id: string, dto: UpdateActivityDto) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT id FROM activity_record WHERE id = ?',
      [id],
    );
    if (rows.length === 0) throw new NotFoundException('找不到该活动记录');

    const setClauses: string[] = [];
    const values: any[] = [];

    if (dto.record_time   !== undefined) { setClauses.push('record_time = ?');   values.push(toMysqlDatetime(dto.record_time)); }
    if (dto.activity_type !== undefined) { setClauses.push('activity_type = ?'); values.push(ACTIVITY_TYPE_TO_INT[dto.activity_type] ?? 5); }
    if (dto.duration_min  !== undefined) { setClauses.push('duration_min = ?');  values.push(dto.duration_min); }
    if (dto.intensity     !== undefined) { setClauses.push('intensity = ?');     values.push(dto.intensity); }
    if (dto.note          !== undefined) { setClauses.push('note = ?');          values.push(dto.note); }

    if (setClauses.length === 0) return this.findOne(id);

    values.push(id);
    await this.db.execute(
      `UPDATE activity_record SET ${setClauses.join(', ')} WHERE id = ?`,
      values,
    );
    return this.findOne(id);
  }

  async remove(id: string) {
    await this.db.execute('DELETE FROM activity_record WHERE id = ?', [id]);
    return { id };
  }
}