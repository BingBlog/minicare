import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_POOL } from '../../common/database/database.module';
import { CreateDiaperDto, UpdateDiaperDto } from './dto/create-diaper.dto';
import { toMysqlDatetime } from '../../common/utils/date.util';

/** JSON 字段解析辅助（mysql2 有时返回字符串） */
function parseJson(val: unknown): unknown {
  if (val == null) return null;
  if (typeof val === 'string') { try { return JSON.parse(val); } catch { return null; } }
  return val;
}

@Injectable()
export class DiaperService {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  async create(userId: string, dto: CreateDiaperDto) {
    const id = uuidv4();
    await this.db.execute(
      `INSERT INTO diaper_record
         (id, baby_id, recorded_by, record_time, diaper_type, stool_colors, poop_type, butt_condition, diaper_count, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        dto.baby_id,
        userId,
        toMysqlDatetime(dto.record_time),
        dto.diaper_type,
        dto.stool_colors?.length ? JSON.stringify(dto.stool_colors) : null,
        dto.poop_type      ?? null,
        dto.butt_condition ?? null,
        dto.diaper_count   ?? null,
        dto.note           ?? null,
      ],
    );
    return { id };
  }

  private mapRow(r: any) {
    return {
      ...r,
      // diaper_type 已是 VARCHAR，无需映射
      stool_colors: parseJson(r.stool_colors) ?? [],
    };
  }

  async findAll(babyId: string, limit = 20, offset = 0) {
    const safeLimit  = Math.max(1, Math.min(200, Math.floor(Number(limit)  || 20)));
    const safeOffset = Math.max(0, Math.floor(Number(offset) || 0));
    const [rows] = await this.db.query<any[]>(
      `SELECT * FROM diaper_record WHERE baby_id = ? ORDER BY record_time DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      [babyId],
    );
    return rows.map((r) => this.mapRow(r));
  }

  async findOne(id: string) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT * FROM diaper_record WHERE id = ?',
      [id],
    );
    if (!rows[0]) return null;
    return this.mapRow(rows[0]);
  }

  async update(id: string, dto: UpdateDiaperDto) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT id FROM diaper_record WHERE id = ?',
      [id],
    );
    if (rows.length === 0) throw new NotFoundException('找不到该尿布记录');

    const setClauses: string[] = [];
    const values: any[] = [];

    if (dto.record_time   !== undefined) { setClauses.push('record_time = ?');   values.push(toMysqlDatetime(dto.record_time)); }
    if (dto.diaper_type   !== undefined) { setClauses.push('diaper_type = ?');   values.push(dto.diaper_type); }
    if (dto.stool_colors  !== undefined) { setClauses.push('stool_colors = ?');  values.push(dto.stool_colors?.length ? JSON.stringify(dto.stool_colors) : null); }
    if (dto.poop_type     !== undefined) { setClauses.push('poop_type = ?');     values.push(dto.poop_type); }
    if (dto.butt_condition !== undefined) { setClauses.push('butt_condition = ?'); values.push(dto.butt_condition); }
    if (dto.diaper_count  !== undefined) { setClauses.push('diaper_count = ?');  values.push(dto.diaper_count); }
    if (dto.note          !== undefined) { setClauses.push('note = ?');          values.push(dto.note); }

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
