import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_POOL } from '../../common/database/database.module';
import {
  CreateFeedingDto,
  UpdateFeedingDto,
} from './dto/create-feeding.dto';
import { toMysqlDatetime, getBeijingToday, addDays } from '../../common/utils/date.util';

/** JSON 字段解析辅助（mysql2 有时返回字符串） */
function parseJson(val: unknown) {
  if (val == null) return null;
  if (typeof val === 'string') { try { return JSON.parse(val); } catch { return null; } }
  return val;
}

/**
 * 解析 supplement_items，兼容历史脏数据中可能出现的 [[...]] 双层嵌套。
 */
function parseSupplementItems(val: unknown): Array<{ key: string; label?: string; dose?: string; unit?: string }> | null {
  const parsed = parseJson(val);
  if (!Array.isArray(parsed)) return null;
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

  // ============================================================
  // CREATE
  // ============================================================

  async create(userId: string, dto: CreateFeedingDto) {
    const id = uuidv4();

    if (dto.feed_type === 'breast') {
      await this.db.execute(
        `INSERT INTO feeding_breast_record
           (id, baby_id, recorded_by, record_time, breast_side, duration_min, note)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          dto.baby_id,
          userId,
          toMysqlDatetime(dto.record_time),
          dto.breast_side ?? null,
          dto.duration_min ?? null,
          dto.note ?? null,
        ],
      );
      return { id };
    }

    if (dto.feed_type === 'formula') {
      await this.db.execute(
        `INSERT INTO feeding_formula_record
           (id, baby_id, recorded_by, record_time, formula_ml, note)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          id,
          dto.baby_id,
          userId,
          toMysqlDatetime(dto.record_time),
          dto.formula_ml ?? null,
          dto.note ?? null,
        ],
      );
      // 明细行：每种奶粉一行
      if (dto.milk_types?.length && dto.milk_scoops) {
        for (const milkType of dto.milk_types) {
          const scoops = dto.milk_scoops[milkType];
          if (scoops != null) {
            await this.db.execute(
              `INSERT INTO feeding_formula_mix (id, record_id, milk_type, scoops) VALUES (?, ?, ?, ?)`,
              [uuidv4(), id, milkType, scoops],
            );
          }
        }
      }
      return { id };
    }

    if (dto.feed_type === 'complementary') {
      // 营养素：存到 feeding_supplement_record
      if (dto.supplement_items?.length || dto.complementary_food === '营养素') {
        const flatItems = flattenSupplementItems(dto.supplement_items ?? []);
        await this.db.execute(
          `INSERT INTO feeding_supplement_record
             (id, baby_id, recorded_by, record_time, supplement_items, note)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            id,
            dto.baby_id,
            userId,
            toMysqlDatetime(dto.record_time),
            JSON.stringify(flatItems),
            dto.note ?? null,
          ],
        );
        return { id };
      }

      // 辅食：主表 + 明细行
      await this.db.execute(
        `INSERT INTO feeding_food_record
           (id, baby_id, recorded_by, record_time, note)
         VALUES (?, ?, ?, ?, ?)`,
        [
          id,
          dto.baby_id,
          userId,
          toMysqlDatetime(dto.record_time),
          dto.note ?? null,
        ],
      );
      // 解析食物列表（兼容逗号/顿号分隔字符串）
      const foodNames = dto.complementary_food
        ? dto.complementary_food.split(/[,，、]/).map((s) => s.trim()).filter(Boolean)
        : [];
      for (const foodName of foodNames) {
        await this.db.execute(
          `INSERT INTO feeding_food_item (id, record_id, food_name, amount_g) VALUES (?, ?, ?, ?)`,
          [uuidv4(), id, foodName, dto.amount_g ?? null],
        );
      }
      return { id };
    }

    throw new Error(`Unsupported feed_type: ${dto.feed_type}`);
  }

  // ============================================================
  // READ
  // ============================================================

  private mapBreastRow(r: any) {
    return { ...r, feed_type: 'breast' };
  }

  private mapFormulaRow(r: any, mixRows: any[]) {
    const milk_types = mixRows.map((m) => m.milk_type);
    const milk_scoops: Record<string, number> = {};
    for (const m of mixRows) milk_scoops[m.milk_type] = Number(m.scoops);
    return {
      ...r,
      feed_type: 'formula',
      milk_types: milk_types.length > 0 ? milk_types : null,
      milk_scoops: milk_types.length > 0 ? milk_scoops : null,
    };
  }

  private mapFoodRow(r: any, itemRows: any[]) {
    const foods = itemRows.map((i) => i.food_name);
    return {
      ...r,
      feed_type: 'complementary',
      complementary_food: foods.join('、'),
      amount_g: itemRows[0]?.amount_g ?? null,
      food_items: itemRows,
    };
  }

  private mapSupplementRow(r: any) {
    return {
      ...r,
      feed_type: 'complementary',
      complementary_food: '营养素',
      supplement_items: parseSupplementItems(r.supplement_items),
    };
  }

  /**
   * 日期分页查询喂养记录
   *
   * 设计：
   * - 每次返回固定 3 天（北京时间）的完整数据，保证日完整性
   * - before_date: 北京日期 YYYY-MM-DD，查询 [before_date - 3天, before_date) 范围
   * - 初次不传 before_date，默认从明天开始（包含今天的数据）
   * - 如果查询范围内无数据，用 COUNT 检查更早是否还有记录
   *
   * @returns { items, nextBeforeDate } — nextBeforeDate 为 null 表示没有更多数据
   */
  async findAll(babyId: string, beforeDate?: string) {
    // 默认 before_date = 明天（这样 < before_date 就包含今天）
    const endDate = beforeDate || addDays(getBeijingToday(), 1);
    const startDate = addDays(endDate, -7);

    // 数据库存储北京时间，直接用日期字符串比较
    // record_time >= 'startDate 00:00:00' AND record_time < 'endDate 00:00:00'
    const startDatetime = `${startDate} 00:00:00`;
    const endDatetime = `${endDate} 00:00:00`;

    // 查询四张表
    const [breast] = await this.db.query<any[]>(
      `SELECT id, baby_id, recorded_by, record_time, breast_side, duration_min, note, created_at, updated_at,
              'breast' AS _src
       FROM feeding_breast_record
       WHERE baby_id = ? AND record_time >= ? AND record_time < ?
       ORDER BY record_time DESC`,
      [babyId, startDatetime, endDatetime],
    );
    const [formula] = await this.db.query<any[]>(
      `SELECT id, baby_id, recorded_by, record_time, formula_ml, note, created_at, updated_at,
              'formula' AS _src
       FROM feeding_formula_record
       WHERE baby_id = ? AND record_time >= ? AND record_time < ?
       ORDER BY record_time DESC`,
      [babyId, startDatetime, endDatetime],
    );
    const [food] = await this.db.query<any[]>(
      `SELECT id, baby_id, recorded_by, record_time, note, created_at, updated_at,
              'food' AS _src
       FROM feeding_food_record
       WHERE baby_id = ? AND record_time >= ? AND record_time < ?
       ORDER BY record_time DESC`,
      [babyId, startDatetime, endDatetime],
    );
    const [supplement] = await this.db.query<any[]>(
      `SELECT id, baby_id, recorded_by, record_time, supplement_items, note, created_at, updated_at,
              'supplement' AS _src
       FROM feeding_supplement_record
       WHERE baby_id = ? AND record_time >= ? AND record_time < ?
       ORDER BY record_time DESC`,
      [babyId, startDatetime, endDatetime],
    );

    // 收集需要 JOIN 的 id
    const formulaIds = formula.map((r) => r.id);
    const foodIds    = food.map((r) => r.id);

    const mixMap:  Record<string, any[]> = {};
    const itemMap: Record<string, any[]> = {};

    if (formulaIds.length > 0) {
      const placeholders = formulaIds.map(() => '?').join(',');
      const [mixes] = await this.db.query<any[]>(
        `SELECT record_id, milk_type, scoops FROM feeding_formula_mix WHERE record_id IN (${placeholders})`,
        formulaIds,
      );
      for (const m of mixes) {
        if (!mixMap[m.record_id]) mixMap[m.record_id] = [];
        mixMap[m.record_id].push(m);
      }
    }

    if (foodIds.length > 0) {
      const placeholders = foodIds.map(() => '?').join(',');
      const [items] = await this.db.query<any[]>(
        `SELECT record_id, food_name, amount_g FROM feeding_food_item WHERE record_id IN (${placeholders})`,
        foodIds,
      );
      for (const i of items) {
        if (!itemMap[i.record_id]) itemMap[i.record_id] = [];
        itemMap[i.record_id].push(i);
      }
    }

    // 合并 + 映射
    const all = [
      ...breast.map((r) => this.mapBreastRow(r)),
      ...formula.map((r) => this.mapFormulaRow(r, mixMap[r.id] ?? [])),
      ...food.map((r) => this.mapFoodRow(r, itemMap[r.id] ?? [])),
      ...supplement.map((r) => this.mapSupplementRow(r)),
    ];

    // 排序：record_time 降序
    all.sort((a, b) => {
      const ta = new Date(a.record_time).getTime();
      const tb = new Date(b.record_time).getTime();
      if (tb !== ta) return tb - ta;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    // 判断是否还有更多数据
    let hasMore = false;
    if (all.length > 0) {
      // 有数据，nextBeforeDate 就是 startDate
      hasMore = true;
    } else {
      // 当前 3 天范围无数据，检查更早是否还有记录
      const [countResult] = await this.db.query<any[]>(
        `SELECT
          (SELECT COUNT(*) FROM feeding_breast_record WHERE baby_id = ? AND record_time < ?) +
          (SELECT COUNT(*) FROM feeding_formula_record WHERE baby_id = ? AND record_time < ?) +
          (SELECT COUNT(*) FROM feeding_food_record WHERE baby_id = ? AND record_time < ?) +
          (SELECT COUNT(*) FROM feeding_supplement_record WHERE baby_id = ? AND record_time < ?)
        AS total`,
        [babyId, startDatetime, babyId, startDatetime, babyId, startDatetime, babyId, startDatetime],
      );
      hasMore = countResult[0]?.total > 0;
    }

    const nextBeforeDate = hasMore ? startDate : null;

    return { items: all, nextBeforeDate };
  }

  async findOne(id: string) {
    // 依次查各表，找到即返回
    const [b] = await this.db.execute<any[]>(
      'SELECT * FROM feeding_breast_record WHERE id = ?', [id],
    );
    if (b[0]) return this.mapBreastRow(b[0]);

    const [f] = await this.db.execute<any[]>(
      'SELECT * FROM feeding_formula_record WHERE id = ?', [id],
    );
    if (f[0]) {
      const [mixes] = await this.db.execute<any[]>(
        'SELECT milk_type, scoops FROM feeding_formula_mix WHERE record_id = ?', [id],
      );
      return this.mapFormulaRow(f[0], mixes);
    }

    const [fo] = await this.db.execute<any[]>(
      'SELECT * FROM feeding_food_record WHERE id = ?', [id],
    );
    if (fo[0]) {
      const [items] = await this.db.execute<any[]>(
        'SELECT food_name, amount_g FROM feeding_food_item WHERE record_id = ? ORDER BY id', [id],
      );
      return this.mapFoodRow(fo[0], items);
    }

    const [s] = await this.db.execute<any[]>(
      'SELECT * FROM feeding_supplement_record WHERE id = ?', [id],
    );
    if (s[0]) return this.mapSupplementRow(s[0]);

    return null;
  }

  // ============================================================
  // UPDATE
  // ============================================================

  async update(id: string, dto: UpdateFeedingDto) {
    // 先确定记录在哪张表
    const record = await this.findOne(id);
    if (!record) throw new NotFoundException('找不到该喂养记录');

    const feedType = record.feed_type as string;

    if (feedType === 'breast') {
      const setClauses: string[] = [];
      const values: any[] = [];
      if (dto.record_time  !== undefined) { setClauses.push('record_time = ?');  values.push(toMysqlDatetime(dto.record_time)); }
      if (dto.breast_side  !== undefined) { setClauses.push('breast_side = ?');  values.push(dto.breast_side); }
      if (dto.duration_min !== undefined) { setClauses.push('duration_min = ?'); values.push(dto.duration_min); }
      if (dto.note         !== undefined) { setClauses.push('note = ?');         values.push(dto.note); }
      if (setClauses.length > 0) {
        values.push(id);
        await this.db.execute(`UPDATE feeding_breast_record SET ${setClauses.join(', ')} WHERE id = ?`, values);
      }
      return this.findOne(id);
    }

    if (feedType === 'formula') {
      const setClauses: string[] = [];
      const values: any[] = [];
      if (dto.record_time !== undefined) { setClauses.push('record_time = ?'); values.push(toMysqlDatetime(dto.record_time)); }
      if (dto.formula_ml  !== undefined) { setClauses.push('formula_ml = ?');  values.push(dto.formula_ml); }
      if (dto.note        !== undefined) { setClauses.push('note = ?');        values.push(dto.note); }
      if (setClauses.length > 0) {
        values.push(id);
        await this.db.execute(`UPDATE feeding_formula_record SET ${setClauses.join(', ')} WHERE id = ?`, values);
      }
      // 更新配比明细（先删后写）
      if (dto.milk_types !== undefined || dto.milk_scoops !== undefined) {
        await this.db.execute('DELETE FROM feeding_formula_mix WHERE record_id = ?', [id]);
        const milkTypes  = dto.milk_types  ?? record.milk_types  ?? [];
        const milkScoops = dto.milk_scoops ?? record.milk_scoops ?? {};
        for (const milkType of milkTypes) {
          const scoops = milkScoops[milkType];
          if (scoops != null) {
            await this.db.execute(
              'INSERT INTO feeding_formula_mix (id, record_id, milk_type, scoops) VALUES (?, ?, ?, ?)',
              [uuidv4(), id, milkType, scoops],
            );
          }
        }
      }
      return this.findOne(id);
    }

    if (feedType === 'complementary') {
      // 营养素
      if (record.complementary_food === '营养素') {
        const setClauses: string[] = [];
        const values: any[] = [];
        if (dto.record_time      !== undefined) { setClauses.push('record_time = ?');      values.push(toMysqlDatetime(dto.record_time)); }
        if (dto.supplement_items !== undefined) { setClauses.push('supplement_items = ?'); values.push(JSON.stringify(flattenSupplementItems(dto.supplement_items))); }
        if (dto.note             !== undefined) { setClauses.push('note = ?');             values.push(dto.note); }
        if (setClauses.length > 0) {
          values.push(id);
          await this.db.execute(`UPDATE feeding_supplement_record SET ${setClauses.join(', ')} WHERE id = ?`, values);
        }
        return this.findOne(id);
      }

      // 辅食
      const setClauses: string[] = [];
      const values: any[] = [];
      if (dto.record_time !== undefined) { setClauses.push('record_time = ?'); values.push(toMysqlDatetime(dto.record_time)); }
      if (dto.note        !== undefined) { setClauses.push('note = ?');        values.push(dto.note); }
      if (setClauses.length > 0) {
        values.push(id);
        await this.db.execute(`UPDATE feeding_food_record SET ${setClauses.join(', ')} WHERE id = ?`, values);
      }
      // 更新食物明细（先删后写）
      if (dto.complementary_food !== undefined || dto.amount_g !== undefined) {
        await this.db.execute('DELETE FROM feeding_food_item WHERE record_id = ?', [id]);
        const foodStr  = dto.complementary_food ?? record.complementary_food ?? '';
        const foodNames = foodStr.split(/[,，、]/).map((s: string) => s.trim()).filter(Boolean);
        const amountG  = dto.amount_g ?? null;
        for (const foodName of foodNames) {
          await this.db.execute(
            'INSERT INTO feeding_food_item (id, record_id, food_name, amount_g) VALUES (?, ?, ?, ?)',
            [uuidv4(), id, foodName, amountG],
          );
        }
      }
      return this.findOne(id);
    }

    return this.findOne(id);
  }

  // ============================================================
  // DELETE
  // ============================================================

  async remove(id: string) {
    // 级联删除或各表尝试删除（formula_mix / food_item 由 ON DELETE CASCADE 自动删除）
    await this.db.execute('DELETE FROM feeding_breast_record   WHERE id = ?', [id]);
    await this.db.execute('DELETE FROM feeding_formula_record  WHERE id = ?', [id]);
    await this.db.execute('DELETE FROM feeding_food_record     WHERE id = ?', [id]);
    await this.db.execute('DELETE FROM feeding_supplement_record WHERE id = ?', [id]);
    return { id };
  }
}
