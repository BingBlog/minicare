import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_POOL } from '../../common/database/database.module';
import {
  CreateDiaperDto,
  UpdateDiaperDto,
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
      `INSERT INTO diaper_record
         (id, baby_id, recorded_by, record_time, diaper_type, color, poop_type, butt_condition, diaper_count, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        dto.baby_id,
        userId,
        toMysqlDatetime(dto.record_time),
        DIAPER_TYPE_TO_INT[dto.diaper_type] ?? 1,
        dto.color          ?? null,
        dto.poop_type      ?? null,
        dto.butt_condition ?? null,
        dto.diaper_count   ?? null,
        dto.note           ?? null,
      ],
    );
    return { id };
  }

  async findAll(babyId: string, limit = 20, offset = 0) {
    const safeLimit  = Math.max(1, Math.min(200, Math.floor(Number(limit)  || 20)));
    const safeOffset = Math.max(0, Math.floor(Number(offset) || 0));
    const [rows] = await this.db.query<any[]>(
      `SELECT * FROM diaper_record WHERE baby_id = ? ORDER BY record_time DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      [babyId],
    );
    return rows.map((r) => ({
      ...r,
      diaper_type: INT_TO_DIAPER_TYPE[r.diaper_type] ?? r.diaper_type,
    }));
  }

  async findOne(id: string) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT * FROM diaper_record WHERE id = ?',
      [id],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return { ...r, diaper_type: INT_TO_DIAPER_TYPE[r.diaper_type] ?? r.diaper_type };
  }

  async update(id: string, dto: UpdateDiaperDto) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT id FROM diaper_record WHERE id = ?',
      [id],
    );
    if (rows.length === 0) throw new NotFoundException('找不到该尿布记录');

    const setClauses: string[] = [];
    const values: any[] = [];

    if (dto.record_time !== undefined) { setClauses.push('record_time = ?'); values.push(toMysqlDatetime(dto.record_time)); }
    if (dto.diaper_type !== undefined) { setClauses.push('diaper_type = ?'); values.push(DIAPER_TYPE_TO_INT[dto.diaper_type] ?? 1); }
    if (dto.color          !== undefined) { setClauses.push('color = ?');          values.push(dto.color); }
    if (dto.poop_type      !== undefined) { setClauses.push('poop_type = ?');      values.push(dto.poop_type); }
    if (dto.butt_condition !== undefined) { setClauses.push('butt_condition = ?'); values.push(dto.butt_condition); }
    if (dto.diaper_count   !== undefined) { setClauses.push('diaper_count = ?');   values.push(dto.diaper_count); }
    if (dto.note           !== undefined) { setClauses.push('note = ?');           values.push(dto.note); }

    if (setClauses.length === 0) return this.findOne(id);

    values.push(id);
    await this.db.execute(
      `UPDATE diaper_record SET ${setClauses.join(', ')} WHERE id = ?`,
      values,
    );
    return this.findOne(id);
  }

  async remove(id: string) {
    await this.db.execute('DELETE FROM diaper_record WHERE id = ?', [id]);
    return { id };
  }
}