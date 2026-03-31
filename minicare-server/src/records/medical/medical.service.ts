import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_POOL } from '../../common/database/database.module';
import { CreateMedicalDto } from './dto/create-medical.dto';
import { toMysqlDate } from '../../common/utils/date.util';

@Injectable()
export class MedicalService {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  async create(userId: string, dto: CreateMedicalDto) {
    const id = uuidv4();
    await this.db.execute(
      `INSERT INTO medical_record
         (id, baby_id, recorded_by, visit_date,
          visit_type, hospital, doctor, diagnosis,
          result_summary, medications, photo_ids,
          follow_up_date, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        dto.baby_id,
        userId,
        toMysqlDate(dto.visit_date),
        dto.visit_type     ?? null,
        dto.hospital       ?? null,
        dto.doctor         ?? null,
        dto.diagnosis      ?? null,
        dto.result_summary ?? null,
        dto.medications ? JSON.stringify(dto.medications) : null,
        dto.photo_ids   ? JSON.stringify(dto.photo_ids)   : null,
        dto.follow_up_date ? toMysqlDate(dto.follow_up_date) : null,
        dto.note           ?? null,
      ],
    );
    return { id };
  }

  async findAll(babyId: string, limit = 20, offset = 0) {
    const [rows] = await this.db.execute<any[]>(
      `SELECT id, baby_id, recorded_by, visit_date,
              visit_type, hospital, doctor, diagnosis,
              result_summary, medications, photo_ids,
              follow_up_date, note, created_at, updated_at
       FROM medical_record
       WHERE baby_id = ?
       ORDER BY visit_date DESC
       LIMIT ? OFFSET ?`,
      [babyId, limit, offset],
    );
    return rows.map((r) => ({
      ...r,
      medications: r.medications
        ? (typeof r.medications === 'string' ? JSON.parse(r.medications) : r.medications)
        : [],
      photo_ids: r.photo_ids
        ? (typeof r.photo_ids === 'string' ? JSON.parse(r.photo_ids) : r.photo_ids)
        : [],
    }));
  }

  async remove(id: string) {
    await this.db.execute('DELETE FROM medical_record WHERE id = ?', [id]);
    return { id };
  }
}