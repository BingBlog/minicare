import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_POOL } from '../../common/database/database.module';
import { CreateDiaperDto } from './dto/create-diaper.dto';

@Injectable()
export class DiaperService {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  async create(userId: string, dto: CreateDiaperDto) {
    const id = uuidv4();
    await this.db.execute(
      `INSERT INTO diaper_record (id, baby_id, recorded_by, type, recorded_at, stool_color, stool_consistency, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, dto.baby_id, userId, dto.type, dto.recorded_at,
       dto.stool_color ?? null, dto.stool_consistency ?? null, dto.note ?? null],
    );
    return { id };
  }

  async findAll(babyId: string, limit = 20, offset = 0) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT * FROM diaper_record WHERE baby_id = ? ORDER BY recorded_at DESC LIMIT ? OFFSET ?',
      [babyId, limit, offset],
    );
    return rows;
  }

  async remove(id: string) {
    await this.db.execute('DELETE FROM diaper_record WHERE id = ?', [id]);
    return { id };
  }
}
