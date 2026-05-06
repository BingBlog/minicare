import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_POOL } from '../../common/database/database.module';
import {
  CreateFeedingDto,
  UpdateFeedingDto,
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
   * Cursor-based 分页查询喂养记录
   *
   * 设计要点：
   * 1. 使用 before（时间游标）+ before_id（同时间去重）实现稳定分页
   * 2. 保证返回数据中最后一天（北京时间）的记录是完整的（日完整性）
   * 3. 初次查询不传 before，从最新记录开始
   * 4. 兼容旧的 offset 参数（降级为旧逻辑）
   *
   * @returns { items, nextCursor } — nextCursor 为 null 表示没有更多数据
   */
  async findAll(babyId: string, limit = 20, offset = 0, before?: string, beforeId?: string) {
    const safeLimit = Math.max(1, Math.min(200, Math.floor(Number(limit) || 20)));

    // ── 兼容旧 offset 模式（如果传了 offset > 0 且没有 before，走旧逻辑） ──
    if (!before && offset > 0) {
      return this._findAllLegacy(babyId, safeLimit, offset);
    }

    // ── Cursor-based 分页 ──

    // 构建 WHERE 条件：如果有 before 游标，查询 record_time <= before 的记录
    // 使用 <= 而非 <，因为同一秒可能有多条记录，需要配合 beforeId 在内存中精确跳过
    //
    // 重要：before 参数来自前端，是 JSON 序列化的 record_time（UTC ISO 格式如 '2026-04-11T19:52:00.000Z'）
    // 但数据库中 record_time 存储的是北京时间（如 '2026-04-12 03:52:00'），
    // MySQL DATETIME 比较是纯字符串/数值比较，不做时区转换。
    // 因此必须将 before 从 UTC 转换为北京时间格式再传入 SQL。
    let beforeLocal: string | undefined;
    if (before) {
      // 将 UTC ISO 字符串转换为北京时间的 MySQL DATETIME 格式
      const d = new Date(before);
      // 加 8 小时得到北京时间，然后用本地时间分量格式化
      const bj = new Date(d.getTime() + 8 * 60 * 60 * 1000);
      const y  = bj.getUTCFullYear();
      const mo = String(bj.getUTCMonth() + 1).padStart(2, '0');
      const da = String(bj.getUTCDate()).padStart(2, '0');
      const h  = String(bj.getUTCHours()).padStart(2, '0');
      const mi = String(bj.getUTCMinutes()).padStart(2, '0');
      const s  = String(bj.getUTCSeconds()).padStart(2, '0');
      beforeLocal = `${y}-${mo}-${da} ${h}:${mi}:${s}`;
    }
    const cursorCondition = beforeLocal
      ? `AND record_time <= ?`
      : '';
    const cursorParams = beforeLocal ? [babyId, beforeLocal] : [babyId];

    // 查询四张表（带游标条件，减少数据量）
    const [breast] = await this.db.query<any[]>(
      `SELECT id, baby_id, recorded_by, record_time, breast_side, duration_min, note, created_at, updated_at,
              'breast' AS _src
       FROM feeding_breast_record WHERE baby_id = ? ${cursorCondition}
       ORDER BY record_time DESC`,
      cursorParams,
    );
    const [formula] = await this.db.query<any[]>(
      `SELECT id, baby_id, recorded_by, record_time, formula_ml, note, created_at, updated_at,
              'formula' AS _src
       FROM feeding_formula_record WHERE baby_id = ? ${cursorCondition}
       ORDER BY record_time DESC`,
      cursorParams,
    );
    const [food] = await this.db.query<any[]>(
      `SELECT id, baby_id, recorded_by, record_time, note, created_at, updated_at,
              'food' AS _src
       FROM feeding_food_record WHERE baby_id = ? ${cursorCondition}
       ORDER BY record_time DESC`,
      cursorParams,
    );
    const [supplement] = await this.db.query<any[]>(
      `SELECT id, baby_id, recorded_by, record_time, supplement_items, note, created_at, updated_at,
              'supplement' AS _src
       FROM feeding_supplement_record WHERE baby_id = ? ${cursorCondition}
       ORDER BY record_time DESC`,
      cursorParams,
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

    // 排序：record_time 降序，同时间用 id 字典序作为 tie-breaker
    all.sort((a, b) => {
      const ta = new Date(a.record_time).getTime();
      const tb = new Date(b.record_time).getTime();
      if (tb !== ta) return tb - ta;
      // 同时间：id 字典序升序（确保稳定排序）
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    // 如果有 beforeId，跳过上一页已返回的记录
    // 排序为 record_time DESC + id ASC，所以需要跳过：
    //   - record_time > before 的记录（不应存在，SQL 已过滤）
    //   - record_time === before 且 id <= beforeId 的记录（上一页已包含）
    let startIdx = 0;
    if (before && beforeId) {
      const beforeTime = new Date(before).getTime();
      for (let i = 0; i < all.length; i++) {
        const t = new Date(all[i].record_time).getTime();
        if (t > beforeTime) {
          // 不应出现（SQL 已过滤），跳过
          startIdx = i + 1;
        } else if (t === beforeTime && all[i].id <= beforeId) {
          // 同时间且 id <= beforeId，上一页已包含，跳过
          startIdx = i + 1;
        } else {
          break;
        }
      }
    }

    // 取 limit 条
    const page = all.slice(startIdx, startIdx + safeLimit);

    if (page.length === 0) {
      return { items: page, nextCursor: null };
    }

    // ── 日完整性保证 ──
    // 获取最后一条记录的日期（北京时间，直接从 record_time 字符串提取）
    const lastRecordTime = page[page.length - 1].record_time;
    const lastDateKey = this.extractDateKey(lastRecordTime);

    // 检查 page 之后是否还有同一天的记录，如果有则追加
    let extIdx = startIdx + safeLimit;
    while (extIdx < all.length) {
      const recDateKey = this.extractDateKey(all[extIdx].record_time);
      if (recDateKey === lastDateKey) {
        page.push(all[extIdx]);
        extIdx++;
      } else {
        break;
      }
    }

    // 计算 nextCursor
    const hasMore = extIdx < all.length;
    const nextCursor = hasMore
      ? { before: page[page.length - 1].record_time, before_id: page[page.length - 1].id }
      : null;

    return { items: page, nextCursor };
  }

  /**
   * 从 record_time 提取北京时间日期 key（YYYY-MM-DD）
   *
   * record_time 在数据库中存储为北京时间（timezone: '+08:00'），
   * mysql2 返回的是 Date 对象或字符串，统一处理。
   */
  private extractDateKey(recordTime: unknown): string {
    if (recordTime instanceof Date) {
      // mysql2 + timezone:'+08:00' 返回的 Date 对象，用本地时间分量
      const y = recordTime.getFullYear();
      const m = String(recordTime.getMonth() + 1).padStart(2, '0');
      const d = String(recordTime.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    // 字符串格式：'2026-05-03 01:00:00' 或 '2026-05-03T01:00:00.000Z'
    const str = String(recordTime);
    // 如果是 ISO 格式带 Z（UTC），需要转换为北京时间
    if (str.endsWith('Z') || str.includes('+')) {
      const date = new Date(str);
      // 加 8 小时得到北京时间
      const bjDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
      const y = bjDate.getUTCFullYear();
      const m = String(bjDate.getUTCMonth() + 1).padStart(2, '0');
      const d = String(bjDate.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    // 纯本地时间字符串（如 '2026-05-03 01:00:00'），直接截取前 10 位
    return str.slice(0, 10);
  }

  /** 旧的 offset 分页逻辑（向后兼容） */
  private async _findAllLegacy(babyId: string, limit: number, offset: number) {
    const safeOffset = Math.max(0, Math.floor(Number(offset) || 0));

    const [breast] = await this.db.query<any[]>(
      `SELECT id, baby_id, recorded_by, record_time, breast_side, duration_min, note, created_at, updated_at,
              'breast' AS _src
       FROM feeding_breast_record WHERE baby_id = ?`,
      [babyId],
    );
    const [formula] = await this.db.query<any[]>(
      `SELECT id, baby_id, recorded_by, record_time, formula_ml, note, created_at, updated_at,
              'formula' AS _src
       FROM feeding_formula_record WHERE baby_id = ?`,
      [babyId],
    );
    const [food] = await this.db.query<any[]>(
      `SELECT id, baby_id, recorded_by, record_time, note, created_at, updated_at,
              'food' AS _src
       FROM feeding_food_record WHERE baby_id = ?`,
      [babyId],
    );
    const [supplement] = await this.db.query<any[]>(
      `SELECT id, baby_id, recorded_by, record_time, supplement_items, note, created_at, updated_at,
              'supplement' AS _src
       FROM feeding_supplement_record WHERE baby_id = ?`,
      [babyId],
    );

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

    const all = [
      ...breast.map((r) => this.mapBreastRow(r)),
      ...formula.map((r) => this.mapFormulaRow(r, mixMap[r.id] ?? [])),
      ...food.map((r) => this.mapFoodRow(r, itemMap[r.id] ?? [])),
      ...supplement.map((r) => this.mapSupplementRow(r)),
    ];

    all.sort((a, b) => {
      const ta = new Date(a.record_time).getTime();
      const tb = new Date(b.record_time).getTime();
      return tb - ta;
    });

    return all.slice(safeOffset, safeOffset + limit);
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
