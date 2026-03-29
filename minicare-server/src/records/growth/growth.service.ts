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
    // TODO: 后续可在此处调用 WHO 百分位计算服务
    await this.db.execute(
      `INSERT INTO growth_record (id, baby_id, recorded_by, measured_at, weight_g, height_cm, head_cm, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, dto.baby_id, userId, dto.measured_at,
       dto.weight_g ?? null, dto.height_cm ?? null,
       dto.head_cm ?? null, dto.note ?? null],
    );
    return { id };
  }

  async findAll(babyId: string, limit = 50, offset = 0) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT * FROM growth_record WHERE baby_id = ? ORDER BY measured_at DESC LIMIT ? OFFSET ?',
      [babyId, limit, offset],
    );
    return rows;
  }

  async remove(id: string) {
    await this.db.execute('DELETE FROM growth_record WHERE id = ?', [id]);
    return { id };
  }
}
