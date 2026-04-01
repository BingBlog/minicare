import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_POOL } from '../../common/database/database.module';
import { CreateSymptomDto, UpdateSymptomDto } from './dto/create-symptom.dto';
import { toMysqlDatetime } from '../../common/utils/date.util';

function parseJson(val: unknown) {
  if (val == null) return null;
  if (typeof val === 'string') { try { return JSON.parse(val); } catch { return null; } }
  return val;
}

@Injectable()
export class SymptomService {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  async create(userId: string, dto: CreateSymptomDto) {
    const id = uuidv4();
    await this.db.execute(
      `INSERT INTO symptom_record
         (id, baby_id, recorded_by, record_time, symptoms, spirit, mood, photo_ids, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        dto.baby_id,
        userId,
        toMysqlDatetime(dto.record_time),
        JSON.stringify(dto.symptoms),
        dto.spirit    ?? null,
        dto.mood      ?? null,
        dto.photo_ids ? JSON.stringify(dto.photo_ids) : null,
        dto.note      ?? null,
      ],
    );
    return { id };
  }

  private mapRow(r: any) {
    return {
      ...r,
      symptoms:  parseJson(r.symptoms)  ?? [],
      photo_ids: parseJson(r.photo_ids) ?? [],
    };
  }

  async findAll(babyId: string, limit = 20, offset = 0) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT * FROM symptom_record WHERE baby_id = ? ORDER BY record_time DESC LIMIT ? OFFSET ?',
      [babyId, limit, offset],
    );
    return rows.map((r) => this.mapRow(r));
  }

  async findOne(id: string) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT * FROM symptom_record WHERE id = ?',
      [id],
    );
    if (!rows[0]) return null;
    return this.mapRow(rows[0]);
  }

  async update(id: string, dto: UpdateSymptomDto) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT id FROM symptom_record WHERE id = ?',
      [id],
    );
    if (rows.length === 0) throw new NotFoundException('找不到该症状记录');

    const setClauses: string[] = [];
    const values: any[] = [];

    if (dto.record_time !== undefined) { setClauses.push('record_time = ?'); values.push(toMysqlDatetime(dto.record_time)); }
    if (dto.symptoms    !== undefined) { setClauses.push('symptoms = ?');    values.push(JSON.stringify(dto.symptoms)); }
    if (dto.spirit      !== undefined) { setClauses.push('spirit = ?');      values.push(dto.spirit); }
    if (dto.mood        !== undefined) { setClauses.push('mood = ?');        values.push(dto.mood); }
    if (dto.photo_ids   !== undefined) { setClauses.push('photo_ids = ?');   values.push(JSON.stringify(dto.photo_ids)); }
    if (dto.note        !== undefined) { setClauses.push('note = ?');        values.push(dto.note); }

    if (setClauses.length === 0) return this.findOne(id);

    values.push(id);
    await this.db.execute(
      `UPDATE symptom_record SET ${setClauses.join(', ')} WHERE id = ?`,
      values,
    );
    return this.findOne(id);
  }

  async remove(id: string) {
    await this.db.execute('DELETE FROM symptom_record WHERE id = ?', [id]);
    return { id };
  }
}