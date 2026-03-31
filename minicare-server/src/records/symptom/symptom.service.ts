import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_POOL } from '../../common/database/database.module';
import { CreateSymptomDto } from './dto/create-symptom.dto';
import { toMysqlDatetime } from '../../common/utils/date.util';

@Injectable()
export class SymptomService {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  async create(userId: string, dto: CreateSymptomDto) {
    const id = uuidv4();
    await this.db.execute(
      `INSERT INTO symptom_record (id, baby_id, recorded_by, record_time, symptoms, photo_ids, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        dto.baby_id,
        userId,
        toMysqlDatetime(dto.record_time),
        JSON.stringify(dto.symptoms),
        dto.photo_ids ? JSON.stringify(dto.photo_ids) : null,
        dto.note ?? null,
      ],
    );
    return { id };
  }

  async findAll(babyId: string, limit = 20, offset = 0) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT * FROM symptom_record WHERE baby_id = ? ORDER BY record_time DESC LIMIT ? OFFSET ?',
      [babyId, limit, offset],
    );
    return rows.map((r) => ({
      ...r,
      symptoms:  typeof r.symptoms  === 'string' ? JSON.parse(r.symptoms)  : (r.symptoms  ?? []),
      photo_ids: typeof r.photo_ids === 'string' ? JSON.parse(r.photo_ids) : (r.photo_ids ?? []),
    }));
  }

  async remove(id: string) {
    await this.db.execute('DELETE FROM symptom_record WHERE id = ?', [id]);
    return { id };
  }
}