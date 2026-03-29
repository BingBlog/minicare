import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_POOL } from '../../common/database/database.module';
import { CreateMedicalDto } from './dto/create-medical.dto';

@Injectable()
export class MedicalService {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  async create(userId: string, dto: CreateMedicalDto) {
    const id = uuidv4();
    await this.db.execute(
      `INSERT INTO medical_record (id, baby_id, recorded_by, recorded_at, hospital, diagnosis, medications, photo_urls, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, dto.baby_id, userId, dto.recorded_at,
       dto.hospital ?? null, dto.diagnosis ?? null,
       dto.medications ? JSON.stringify(dto.medications) : null,
       dto.photo_urls ? JSON.stringify(dto.photo_urls) : null,
       dto.note ?? null],
    );
    return { id };
  }

  async findAll(babyId: string, limit = 20, offset = 0) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT * FROM medical_record WHERE baby_id = ? ORDER BY recorded_at DESC LIMIT ? OFFSET ?',
      [babyId, limit, offset],
    );
    return rows.map((r) => ({
      ...r,
      medications: r.medications ? JSON.parse(r.medications) : [],
      photo_urls: r.photo_urls ? JSON.parse(r.photo_urls) : [],
    }));
  }

  async remove(id: string) {
    await this.db.execute('DELETE FROM medical_record WHERE id = ?', [id]);
    return { id };
  }
}
