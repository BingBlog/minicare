import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_POOL } from '../../common/database/database.module';
import { CreateSymptomDto } from './dto/create-symptom.dto';

@Injectable()
export class SymptomService {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  async create(userId: string, dto: CreateSymptomDto) {
    const id = uuidv4();
    await this.db.execute(
      `INSERT INTO symptom_record (id, baby_id, recorded_by, recorded_at, symptoms, severity, photo_urls, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, dto.baby_id, userId, dto.recorded_at,
       JSON.stringify(dto.symptoms),
       dto.severity ?? null,
       dto.photo_urls ? JSON.stringify(dto.photo_urls) : null,
       dto.note ?? null],
    );
    return { id };
  }

  async findAll(babyId: string, limit = 20, offset = 0) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT * FROM symptom_record WHERE baby_id = ? ORDER BY recorded_at DESC LIMIT ? OFFSET ?',
      [babyId, limit, offset],
    );
    return rows.map((r) => ({
      ...r,
      symptoms: typeof r.symptoms === 'string' ? JSON.parse(r.symptoms) : r.symptoms,
      photo_urls: r.photo_urls ? (typeof r.photo_urls === 'string' ? JSON.parse(r.photo_urls) : r.photo_urls) : [],
    }));
  }

  async remove(id: string) {
    await this.db.execute('DELETE FROM symptom_record WHERE id = ?', [id]);
    return { id };
  }
}
