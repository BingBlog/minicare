import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_POOL } from '../../common/database/database.module';
import { CreateMedicalDto, UpdateMedicalDto } from './dto/create-medical.dto';
import { toMysqlDate, getBeijingToday, addDays } from '../../common/utils/date.util';

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

  async findAll(babyId: string, beforeDate?: string) {
    const endDate = beforeDate || addDays(getBeijingToday(), 1);
    const startDate = addDays(endDate, -7);

    const [rows] = await this.db.query<any[]>(
      `SELECT id, baby_id, recorded_by, visit_date,
              visit_type, hospital, doctor, diagnosis,
              result_summary, medications, photo_ids,
              follow_up_date, note, created_at, updated_at
       FROM medical_record
       WHERE baby_id = ? AND visit_date >= ? AND visit_date < ?
       ORDER BY visit_date DESC`,
      [babyId, startDate, endDate],
    );
    const items = rows.map((r) => this.mapListRow(r));

    let hasMore = false;
    if (items.length > 0) {
      hasMore = true;
    } else {
      const [countResult] = await this.db.query<any[]>(
        `SELECT COUNT(*) AS total FROM medical_record WHERE baby_id = ? AND visit_date < ?`,
        [babyId, startDate],
      );
      hasMore = countResult[0]?.total > 0;
    }

    return { items, nextBeforeDate: hasMore ? startDate : null };
  }

  private mapListRow(r: any) {
    return {
      ...r,
      medications: r.medications
        ? (typeof r.medications === 'string' ? JSON.parse(r.medications) : r.medications)
        : [],
      photo_ids: r.photo_ids
        ? (typeof r.photo_ids === 'string' ? JSON.parse(r.photo_ids) : r.photo_ids)
        : [],
    };
  }

  async findOne(id: string) {
    const [rows] = await this.db.execute<any[]>(
      `SELECT id, baby_id, recorded_by, visit_date,
              visit_type, hospital, doctor, diagnosis,
              result_summary, medications, photo_ids,
              follow_up_date, note, created_at, updated_at
       FROM medical_record WHERE id = ?`,
      [id],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      ...r,
      medications: r.medications
        ? (typeof r.medications === 'string' ? JSON.parse(r.medications) : r.medications)
        : [],
      photo_ids: r.photo_ids
        ? (typeof r.photo_ids === 'string' ? JSON.parse(r.photo_ids) : r.photo_ids)
        : [],
    };
  }

  async update(id: string, dto: UpdateMedicalDto) {
    const [rows] = await this.db.execute<any[]>('SELECT id FROM medical_record WHERE id = ?', [id]);
    if (rows.length === 0) throw new NotFoundException('找不到该医疗记录');

    const setClauses: string[] = [];
    const values: any[] = [];

    if (dto.visit_date     !== undefined) { setClauses.push('visit_date = ?');     values.push(toMysqlDate(dto.visit_date)); }
    if (dto.visit_type     !== undefined) { setClauses.push('visit_type = ?');     values.push(dto.visit_type ?? null); }
    if (dto.hospital       !== undefined) { setClauses.push('hospital = ?');       values.push(dto.hospital ?? null); }
    if (dto.doctor         !== undefined) { setClauses.push('doctor = ?');         values.push(dto.doctor ?? null); }
    if (dto.diagnosis      !== undefined) { setClauses.push('diagnosis = ?');      values.push(dto.diagnosis ?? null); }
    if (dto.result_summary !== undefined) { setClauses.push('result_summary = ?'); values.push(dto.result_summary ?? null); }
    if (dto.medications    !== undefined) { setClauses.push('medications = ?');    values.push(dto.medications ? JSON.stringify(dto.medications) : null); }
    if (dto.photo_ids      !== undefined) { setClauses.push('photo_ids = ?');      values.push(dto.photo_ids ? JSON.stringify(dto.photo_ids) : null); }
    if (dto.follow_up_date !== undefined) { setClauses.push('follow_up_date = ?'); values.push(dto.follow_up_date ? toMysqlDate(dto.follow_up_date) : null); }
    if (dto.note           !== undefined) { setClauses.push('note = ?');           values.push(dto.note ?? null); }

    if (setClauses.length > 0) {
      values.push(id);
      await this.db.execute(`UPDATE medical_record SET ${setClauses.join(', ')} WHERE id = ?`, values);
    }

    const [updated] = await this.db.execute<any[]>('SELECT * FROM medical_record WHERE id = ?', [id]);
    const r = updated[0];
    return {
      ...r,
      medications: r.medications
        ? (typeof r.medications === 'string' ? JSON.parse(r.medications) : r.medications)
        : [],
      photo_ids: r.photo_ids
        ? (typeof r.photo_ids === 'string' ? JSON.parse(r.photo_ids) : r.photo_ids)
        : [],
    };
  }

  async remove(id: string) {
    await this.db.execute('DELETE FROM medical_record WHERE id = ?', [id]);
    return { id };
  }
}