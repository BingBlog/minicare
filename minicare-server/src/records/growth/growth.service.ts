import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_POOL } from '../../common/database/database.module';
import { CreateGrowthDto, UpdateGrowthDto } from './dto/create-growth.dto';
import { toMysqlDate } from '../../common/utils/date.util';

@Injectable()
export class GrowthService {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  async create(userId: string, dto: CreateGrowthDto) {
    const id = uuidv4();
    const dateStr = toMysqlDate(dto.record_date);

    // INSERT ... ON DUPLICATE KEY UPDATE：同一宝宝同一天重复提交时覆盖已有记录
    // uk_growth_baby_date (baby_id, record_date) 唯一索引触发 ON DUPLICATE 分支
    await this.db.execute(
      `INSERT INTO growth_record (id, baby_id, recorded_by, record_date, weight_g, height_mm, head_mm, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         weight_g  = VALUES(weight_g),
         height_mm = VALUES(height_mm),
         head_mm   = VALUES(head_mm),
         note      = VALUES(note)`,
      [
        id,
        dto.baby_id,
        userId,
        dateStr,
        dto.weight_g  ?? null,
        dto.height_mm ?? null,
        dto.head_mm   ?? null,
        dto.note      ?? null,
      ],
    );

    // 查出实际记录的 id（ON DUPLICATE KEY UPDATE 时原有 id 不变）
    const [rows] = await this.db.execute<any[]>(
      'SELECT id FROM growth_record WHERE baby_id = ? AND record_date = ?',
      [dto.baby_id, dateStr],
    );
    return { id: rows[0]?.id ?? id };
  }

  async findAll(babyId: string, limit = 50, offset = 0) {
    const safeLimit  = Math.max(1, Math.min(200, Math.floor(Number(limit)  || 50)));
    const safeOffset = Math.max(0, Math.floor(Number(offset) || 0));
    const [rows] = await this.db.query<any[]>(
      `SELECT * FROM growth_record WHERE baby_id = ? ORDER BY record_date DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      [babyId],
    );
    return rows;
  }

  async findOne(id: string) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT * FROM growth_record WHERE id = ?',
      [id],
    );
    if (!rows[0]) return null;
    return rows[0];
  }

  async update(id: string, dto: UpdateGrowthDto) {
    const [rows] = await this.db.execute<any[]>('SELECT id FROM growth_record WHERE id = ?', [id]);
    if (rows.length === 0) throw new NotFoundException('找不到该生长记录');

    const setClauses: string[] = [];
    const values: any[] = [];

    if (dto.record_date !== undefined) { setClauses.push('record_date = ?'); values.push(toMysqlDate(dto.record_date)); }
    if (dto.weight_g   !== undefined) { setClauses.push('weight_g = ?');   values.push(dto.weight_g   ?? null); }
    if (dto.height_mm  !== undefined) { setClauses.push('height_mm = ?');  values.push(dto.height_mm  ?? null); }
    if (dto.head_mm    !== undefined) { setClauses.push('head_mm = ?');    values.push(dto.head_mm    ?? null); }
    if (dto.note       !== undefined) { setClauses.push('note = ?');       values.push(dto.note       ?? null); }

    if (setClauses.length > 0) {
      values.push(id);
      await this.db.execute(`UPDATE growth_record SET ${setClauses.join(', ')} WHERE id = ?`, values);
    }

    const [updated] = await this.db.execute<any[]>('SELECT * FROM growth_record WHERE id = ?', [id]);
    return updated[0];
  }

  async remove(id: string) {
    await this.db.execute('DELETE FROM growth_record WHERE id = ?', [id]);
    return { id };
  }
}