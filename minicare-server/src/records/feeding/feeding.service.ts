import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_POOL } from '../../common/database/database.module';
import {
  CreateFeedingDto,
  FEED_TYPE_TO_INT,
  BREAST_SIDE_TO_INT,
  INT_TO_FEED_TYPE,
  INT_TO_BREAST_SIDE,
} from './dto/create-feeding.dto';
import { toMysqlDatetime } from '../../common/utils/date.util';

@Injectable()
export class FeedingService {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  async create(userId: string, dto: CreateFeedingDto) {
    const id = uuidv4();
    await this.db.execute(
      `INSERT INTO feeding_record
         (id, baby_id, recorded_by, record_time, feed_type,
          breast_side, duration_min, formula_ml,
          complementary_food, amount_g, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        dto.baby_id,
        userId,
        toMysqlDatetime(dto.record_time),
        FEED_TYPE_TO_INT[dto.feed_type] ?? 1,
        dto.breast_side != null ? (BREAST_SIDE_TO_INT[dto.breast_side] ?? null) : null,
        dto.duration_min    ?? null,
        dto.formula_ml      ?? null,
        dto.complementary_food ?? null,
        dto.amount_g        ?? null,
        dto.note            ?? null,
      ],
    );
    return { id };
  }

  async findAll(babyId: string, limit = 20, offset = 0) {
    const [rows] = await this.db.execute<any[]>(
      `SELECT * FROM feeding_record WHERE baby_id = ? ORDER BY record_time DESC LIMIT ? OFFSET ?`,
      [babyId, limit, offset],
    );
    return rows.map((r) => ({
      ...r,
      feed_type:   INT_TO_FEED_TYPE[r.feed_type]   ?? r.feed_type,
      breast_side: r.breast_side != null ? (INT_TO_BREAST_SIDE[r.breast_side] ?? r.breast_side) : null,
    }));
  }

  async findOne(id: string) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT * FROM feeding_record WHERE id = ?', [id],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      ...r,
      feed_type:   INT_TO_FEED_TYPE[r.feed_type]   ?? r.feed_type,
      breast_side: r.breast_side != null ? (INT_TO_BREAST_SIDE[r.breast_side] ?? r.breast_side) : null,
    };
  }

  async remove(id: string) {
    await this.db.execute('DELETE FROM feeding_record WHERE id = ?', [id]);
    return { id };
  }
}