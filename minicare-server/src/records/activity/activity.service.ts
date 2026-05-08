import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_POOL } from '../../common/database/database.module';
import { CreateActivityDto, UpdateActivityDto } from './dto/create-activity.dto';
import { toMysqlDatetime, getBeijingToday, addDays } from '../../common/utils/date.util';

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
        dto.activity_type,
        dto.duration_min ?? null,
        dto.intensity    ?? null,
        dto.note         ?? null,
      ],
    );
    return { id };
  }

  async findAll(babyId: string, beforeDate?: string) {
    const endDate = beforeDate || addDays(getBeijingToday(), 1);
    const startDate = addDays(endDate, -7);
    const startDatetime = `${startDate} 00:00:00`;
    const endDatetime = `${endDate} 00:00:00`;

    const [rows] = await this.db.query<any[]>(
      `SELECT * FROM activity_record WHERE baby_id = ? AND record_time >= ? AND record_time < ? ORDER BY record_time DESC`,
      [babyId, startDatetime, endDatetime],
    );
    const items = rows;

    let hasMore = false;
    if (items.length > 0) {
      hasMore = true;
    } else {
      const [countResult] = await this.db.query<any[]>(
        `SELECT COUNT(*) AS total FROM activity_record WHERE baby_id = ? AND record_time < ?`,
        [babyId, startDatetime],
      );
      hasMore = countResult[0]?.total > 0;
    }

    return { items, nextBeforeDate: hasMore ? startDate : null };
  }

  async findOne(id: string) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT * FROM activity_record WHERE id = ?',
      [id],
    );
    if (!rows[0]) return null;
    return rows[0];
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
    if (dto.activity_type !== undefined) { setClauses.push('activity_type = ?'); values.push(dto.activity_type); }
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
