import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_POOL } from '../../common/database/database.module';
import {
  CreateDiaperDto,
  DIAPER_TYPE_TO_INT,
  INT_TO_DIAPER_TYPE,
} from './dto/create-diaper.dto';
import { toMysqlDatetime } from '../../common/utils/date.util';

@Injectable()
export class DiaperService {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  async create(userId: string, dto: CreateDiaperDto) {
    const id = uuidv4();
    await this.db.execute(
      `INSERT INTO diaper_record (id, baby_id, recorded_by, record_time, diaper_type, color, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        dto.baby_id,
        userId,
        toMysqlDatetime(dto.record_time),
        DIAPER_TYPE_TO_INT[dto.diaper_type] ?? 1,
        dto.color ?? null,
        dto.note  ?? null,
      ],
    );
    return { id };
  }

  async findAll(babyId: string, limit = 20, offset = 0) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT * FROM diaper_record WHERE baby_id = ? ORDER BY record_time DESC LIMIT ? OFFSET ?',
      [babyId, limit, offset],
    );
    return rows.map((r) => ({
      ...r,
      diaper_type: INT_TO_DIAPER_TYPE[r.diaper_type] ?? r.diaper_type,
    }));
  }

  async remove(id: string) {
    await this.db.execute('DELETE FROM diaper_record WHERE id = ?', [id]);
    return { id };
  }
}