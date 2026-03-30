import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_POOL } from '../../common/database/database.module';
import { CreateGrowthDto } from './dto/create-growth.dto';

@Injectable()
export class GrowthService {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  async create(userId: string, dto: CreateGrowthDto) {
    const id = uuidv4();
    await this.db.execute(
      `INSERT INTO growth_record (id, baby_id, recorded_by, record_date, weight_g, height_mm, head_mm, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        dto.baby_id,
        userId,
        dto.record_date,
        dto.weight_g  ?? null,
        dto.height_mm ?? null,
        dto.head_mm   ?? null,
        dto.note      ?? null,
      ],
    );
    return { id };
  }

  async findAll(babyId: string, limit = 50, offset = 0) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT * FROM growth_record WHERE baby_id = ? ORDER BY record_date DESC LIMIT ? OFFSET ?',
      [babyId, limit, offset],
    );
    return rows;
  }

  async remove(id: string) {
    await this.db.execute('DELETE FROM growth_record WHERE id = ?', [id]);
    return { id };
  }
}
