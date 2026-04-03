import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_POOL } from '../../common/database/database.module';
import {
  CreateFeedingDto,
  UpdateFeedingDto,
  FEED_TYPE_TO_INT,
  BREAST_SIDE_TO_INT,
  INT_TO_FEED_TYPE,
  INT_TO_BREAST_SIDE,
} from './dto/create-feeding.dto';
import { toMysqlDatetime } from '../../common/utils/date.util';

/** JSON 字段解析辅助（mysql2 有时返回字符串） */
function parseJson(val: unknown) {
  if (val == null) return null;
  if (typeof val === 'string') { try { return JSON.parse(val); } catch { return null; } }
  return val;
}

/**
 * 解析 supplement_items，兼容历史脏数据中可能出现的 [[...]] 双层嵌套。
 * class-transformer 在 transform:true + @IsArray() 无 @Type 时，有时会把
 * [{ key, ... }] 包裹成 [[{ key, ... }]]，此处展平一层以保证数据正确。
 */
function parseSupplementItems(val: unknown): Array<{ key: string; label?: string; dose?: string; unit?: string }> | null {
  const parsed = parseJson(val);
  if (!Array.isArray(parsed)) return null;
  // 如果第一个元素是数组，说明是双层嵌套，展平一层
  if (parsed.length > 0 && Array.isArray(parsed[0])) {
    return (parsed as unknown[][]).flat() as Array<{ key: string; label?: string; dose?: string; unit?: string }>;
  }
  return parsed;
}

/** 在写入数据库前，确保 supplement_items 不含双层嵌套 */
function flattenSupplementItems(items: unknown): unknown {
  if (!Array.isArray(items)) return items;
  if (items.length > 0 && Array.isArray(items[0])) {
    return (items as unknown[][]).flat();
  }
  return items;
}

@Injectable()
export class FeedingService {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  async create(userId: string, dto: CreateFeedingDto) {
    const id = uuidv4();
    await this.db.execute(
      `INSERT INTO feeding_record
         (id, baby_id, recorded_by, record_time, feed_type,
          breast_side, duration_min, formula_ml,
          complementary_food, amount_g,
          milk_types, milk_scoops, supplement_items, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        dto.baby_id,
        userId,
        toMysqlDatetime(dto.record_time),
        FEED_TYPE_TO_INT[dto.feed_type] ?? 1,
        dto.breast_side != null ? (BREAST_SIDE_TO_INT[dto.breast_side] ?? null) : null,
        dto.duration_min          ?? null,
        dto.formula_ml            ?? null,
        dto.complementary_food    ?? null,
        dto.amount_g              ?? null,
        dto.milk_types       != null ? JSON.stringify(dto.milk_types)       : null,
        dto.milk_scoops      != null ? JSON.stringify(dto.milk_scoops)      : null,
        dto.supplement_items != null ? JSON.stringify(flattenSupplementItems(dto.supplement_items)) : null,
        dto.note                  ?? null,
      ],
    );
    return { id };
  }

  private mapRow(r: any) {
    return {
      ...r,
      feed_type:        INT_TO_FEED_TYPE[r.feed_type]   ?? r.feed_type,
      breast_side:      r.breast_side != null ? (INT_TO_BREAST_SIDE[r.breast_side] ?? r.breast_side) : null,
      milk_types:       parseJson(r.milk_types),
      milk_scoops:      parseJson(r.milk_scoops),
      supplement_items: parseSupplementItems(r.supplement_items),
    };
  }

  async findAll(babyId: string, limit = 20, offset = 0) {
    const safeLimit  = Math.max(1, Math.min(200, Math.floor(Number(limit)  || 20)));
    const safeOffset = Math.max(0, Math.floor(Number(offset) || 0));
    const [rows] = await this.db.query<any[]>(
      `SELECT * FROM feeding_record WHERE baby_id = ? ORDER BY record_time DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      [babyId],
    );
    return rows.map((r) => this.mapRow(r));
  }

  async findOne(id: string) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT * FROM feeding_record WHERE id = ?', [id],
    );
    if (!rows[0]) return null;
    return this.mapRow(rows[0]);
  }

  async update(id: string, dto: UpdateFeedingDto) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT id FROM feeding_record WHERE id = ?', [id],
    );
    if (rows.length === 0) throw new NotFoundException('找不到该喂养记录');

    const setClauses: string[] = [];
    const values: any[] = [];

    if (dto.record_time        !== undefined) { setClauses.push('record_time = ?');        values.push(toMysqlDatetime(dto.record_time)); }
    if (dto.feed_type          !== undefined) { setClauses.push('feed_type = ?');          values.push(FEED_TYPE_TO_INT[dto.feed_type] ?? 1); }
    if (dto.breast_side        !== undefined) { setClauses.push('breast_side = ?');        values.push(dto.breast_side != null ? (BREAST_SIDE_TO_INT[dto.breast_side] ?? null) : null); }
    if (dto.duration_min       !== undefined) { setClauses.push('duration_min = ?');       values.push(dto.duration_min); }
    if (dto.formula_ml         !== undefined) { setClauses.push('formula_ml = ?');         values.push(dto.formula_ml); }
    if (dto.complementary_food !== undefined) { setClauses.push('complementary_food = ?'); values.push(dto.complementary_food); }
    if (dto.amount_g           !== undefined) { setClauses.push('amount_g = ?');           values.push(dto.amount_g); }
    if (dto.milk_types         !== undefined) { setClauses.push('milk_types = ?');         values.push(JSON.stringify(dto.milk_types)); }
    if (dto.milk_scoops        !== undefined) { setClauses.push('milk_scoops = ?');        values.push(JSON.stringify(dto.milk_scoops)); }
    if (dto.supplement_items   !== undefined) { setClauses.push('supplement_items = ?');   values.push(JSON.stringify(flattenSupplementItems(dto.supplement_items))); }
    if (dto.note               !== undefined) { setClauses.push('note = ?');               values.push(dto.note); }

    if (setClauses.length === 0) return this.findOne(id);

    values.push(id);
    await this.db.execute(
      `UPDATE feeding_record SET ${setClauses.join(', ')} WHERE id = ?`,
      values,
    );
    return this.findOne(id);
  }

  async remove(id: string) {
    await this.db.execute('DELETE FROM feeding_record WHERE id = ?', [id]);
    return { id };
  }
}