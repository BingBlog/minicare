import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_POOL } from '../../common/database/database.module';
import { CreateHealthDto } from './dto/create-health.dto';

@Injectable()
export class HealthService {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  async create(userId: string, dto: CreateHealthDto) {
    const id = uuidv4();
    await this.db.execute(
      `INSERT INTO health_record (id, baby_id, recorded_by, recorded_at, temperature_c, mood, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, dto.baby_id, userId, dto.recorded_at,
       dto.temperature_c ?? null, dto.mood ?? null, dto.note ?? null],
    );
    return { id };
  }

  async findAll(babyId: string, limit = 20, offset = 0) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT * FROM health_record WHERE baby_id = ? ORDER BY recorded_at DESC LIMIT ? OFFSET ?',
      [babyId, limit, offset],
    );
    return rows;
  }

  async remove(id: string) {
    await this.db.execute('DELETE FROM health_record WHERE id = ?', [id]);
    return { id };
  }
}
