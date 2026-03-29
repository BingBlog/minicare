import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_POOL } from '../../common/database/database.module';
import { CreateFeedingDto } from './dto/create-feeding.dto';

@Injectable()
export class FeedingService {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  async create(userId: string, dto: CreateFeedingDto) {
    const id = uuidv4();
    await this.db.execute(
      `INSERT INTO feeding_record (id, baby_id, recorded_by, type, started_at, duration_min, amount_ml, food_name, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, dto.baby_id, userId, dto.type, dto.started_at,
       dto.duration_min ?? null, dto.amount_ml ?? null,
       dto.food_name ?? null, dto.note ?? null],
    );
    return { id };
  }

  async findAll(babyId: string, limit = 20, offset = 0) {
    const [rows] = await this.db.execute<any[]>(
      `SELECT * FROM feeding_record WHERE baby_id = ? ORDER BY started_at DESC LIMIT ? OFFSET ?`,
      [babyId, limit, offset],
    );
    return rows;
  }

  async findOne(id: string) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT * FROM feeding_record WHERE id = ?', [id],
    );
    return rows[0] ?? null;
  }

  async remove(id: string) {
    await this.db.execute('DELETE FROM feeding_record WHERE id = ?', [id]);
    return { id };
  }
}
