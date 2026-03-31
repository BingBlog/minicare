import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_POOL } from '../../common/database/database.module';
import { CreateHealthDto, MOOD_TO_INT, INT_TO_MOOD } from './dto/create-health.dto';
import { toMysqlDatetime } from '../../common/utils/date.util';

@Injectable()
export class HealthService {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  async create(userId: string, dto: CreateHealthDto) {
    const id = uuidv4();
    await this.db.execute(
      `INSERT INTO health_record (id, baby_id, recorded_by, record_time, temperature, mood, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        dto.baby_id,
        userId,
        toMysqlDatetime(dto.record_time),
        dto.temperature ?? null,
        dto.mood != null ? (MOOD_TO_INT[dto.mood] ?? null) : null,
        dto.note ?? null,
      ],
    );
    return { id };
  }

  async findAll(babyId: string, limit = 20, offset = 0) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT * FROM health_record WHERE baby_id = ? ORDER BY record_time DESC LIMIT ? OFFSET ?',
      [babyId, limit, offset],
    );
    return rows.map((r) => ({
      ...r,
      mood: r.mood != null ? (INT_TO_MOOD[r.mood] ?? r.mood) : null,
    }));
  }

  async remove(id: string) {
    await this.db.execute('DELETE FROM health_record WHERE id = ?', [id]);
    return { id };
  }
}