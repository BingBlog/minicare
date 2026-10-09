import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_POOL } from '../common/database/database.module';
import { FamilyService } from '../family/family.service';
import { ScheduleItemType } from './schedule-item-type';
import { scheduleItemTypeDef } from './schedule-item-type.registry';
import {
  SCHEDULE_EARLY_MINUTES,
  SCHEDULE_ITEM_TYPE_LABELS,
  SCHEDULE_LATE_MINUTES,
  SCHEDULE_MIN_GAP_MINUTES,
  isJudgableItemType,
} from './schedule.constants';
import { getDefaultScheduleTemplate } from './schedule.default-template';
import { SaveScheduleTemplateDto, ScheduleItemDto } from './dto/save-schedule-template.dto';

/** 日程项派生状态（PRD-009 §1.3.2 状态机） */
export type ScheduleItemStatus =
  | 'upcoming'    // 待开始
  | 'preparing'   // 准备中（仅带准备节点的项）
  | 'doing'       // 执行中
  | 'done'        // 已完成（判定窗口内出现匹配记录）
  | 'missed'      // 已错过（超宽限期且无匹配记录）
  | 'disabled';   // 停用（当前不出现在 items 中，保留枚举以备后续"显示已停用项"）

interface ScheduleRow {
  id: string;
  baby_id: string;
  item_type: ScheduleItemType;
  title: string | null;
  execute_time: unknown;
  prepare_time: unknown;
  prepare_offset_min: number | null;
  enabled: number;
  sort_order: number;
  note: string | null;
}

export interface ScheduleItemVo {
  id: string;
  itemType: ScheduleItemType;
  title: string;
  executeTime: string;
  prepareTime: string | null;
  prepareOffsetMin: number | null;
  enabled: boolean;
  /** 展示顺序（0..n-1，由用户拖拽决定；`items` 数组本身已按此排序） */
  sortOrder: number;
  note: string | null;
  status?: ScheduleItemStatus;
  matchedRecord?: {
    id: string;
    type: string;
    recordTime: string;
    summary: string;
  } | null;
}

const MINUTES_PER_DAY = 24 * 60;

@Injectable()
export class ScheduleService {
  constructor(
    @Inject(DATABASE_POOL) private readonly db: Pool,
    private readonly familyService: FamilyService,
  ) {}

  // ─── 对外接口 ──────────────────────────────────────────────

  /**
   * 取作息计划模板（US-01）。
   * 库中无项时返回系统默认模板并标记 `isDefault: true` —— **不自动写库**，
   * 用户点"保存使用"才落库（PRD-009 §1.5 决策 D3 配套口径）。
   */
  async getTemplate(familyId: string, babyId: string) {
    await this.assertBabyInFamily(familyId, babyId);
    const rows = await this.selectItems(babyId);

    if (rows.length === 0) {
      const items: ScheduleItemVo[] = getDefaultScheduleTemplate().map((item, index) => ({
        id: '',
        itemType: item.item_type,
        title: item.title,
        executeTime: item.execute_time,
        prepareTime: item.prepare_time,
        prepareOffsetMin: item.prepare_offset_min,
        enabled: true,
        sortOrder: index,
        note: null,
      }));
      return { items, isDefault: true };
    }

    return { items: rows.map((row) => ScheduleService.rowToVo(row)), isDefault: false };
  }

  /**
   * 全量保存模板（US-02）。差集语义：未出现在 items 中的已有项被软删除。
   * 三条校验见 `validateItems`。
   */
  async saveTemplate(familyId: string, babyId: string, dto: SaveScheduleTemplateDto) {
    await this.assertBabyInFamily(familyId, babyId);

    const items = dto.items ?? [];
    this.validateItems(items);

    const [existingRows] = await this.db.execute<any[]>(
      `SELECT id FROM schedule_template_item WHERE baby_id = ? AND deleted_at IS NULL`,
      [babyId],
    );
    const existingIds = new Set<string>(existingRows.map((r) => r.id));
    const keepIds = new Set<string>(
      items
        .map((item) => item.id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0 && existingIds.has(id)),
    );

    const removedIds = [...existingIds].filter((id) => !keepIds.has(id));
    if (removedIds.length > 0) {
      const placeholders = removedIds.map(() => '?').join(', ');
      await this.db.execute(
        `UPDATE schedule_template_item SET deleted_at = NOW() WHERE id IN (${placeholders})`,
        removedIds,
      );
    }

    // 展示顺序 = 提交数组下标（0..n-1）。与 022 的"全量差集提交"语义一致：
    // 整体重写而非增量 diff，避免局部重排产生空洞或重复。
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const title = (item.title ?? '').trim() || SCHEDULE_ITEM_TYPE_LABELS[item.item_type];
      const prepareTime = item.prepare_time ?? null;
      const prepareOffset = item.prepare_time ? (item.prepare_offset_min ?? null) : null;
      const enabled = item.enabled === false ? 0 : 1;
      const note = item.note ?? null;
      const sortOrder = index;

      if (item.id && existingIds.has(item.id)) {
        await this.db.execute(
          `UPDATE schedule_template_item
             SET item_type = ?, title = ?, execute_time = ?, prepare_time = ?,
                 prepare_offset_min = ?, enabled = ?, sort_order = ?, note = ?
           WHERE id = ? AND baby_id = ?`,
          [item.item_type, title, item.execute_time, prepareTime, prepareOffset, enabled, sortOrder, note, item.id, babyId],
        );
      } else {
        await this.db.execute(
          `INSERT INTO schedule_template_item
             (id, baby_id, item_type, title, execute_time, prepare_time, prepare_offset_min, enabled, sort_order, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), babyId, item.item_type, title, item.execute_time, prepareTime, prepareOffset, enabled, sortOrder, note],
        );
      }
    }

    return this.getTemplate(familyId, babyId);
  }

  /**
   * 今日日程（US-05）：模板项 × 当日记录 → 实时派生状态与进度，**不落库**。
   *
   * 记录来源复用 `FamilyService.getTodayRecords`（与首页时间轴同一份口径），
   * 避免出现"首页说完成、日程 Bar 说未完成"的两套数据源。
   */
  async getToday(familyId: string, babyId: string) {
    await this.assertBabyInFamily(familyId, babyId);

    const [rows, records] = await Promise.all([
      this.selectItems(babyId),
      this.familyService.getTodayRecords(familyId),
    ]);

    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    // 停用项不参与展示、判定与进度分母（PRD-009 §2 US-02 异常处理）
    const items = this.deriveItems(
      rows.filter((row) => Number(row.enabled) === 1),
      records,
      nowMin,
    );

    const total = items.filter((item) => isJudgableItemType(item.itemType)).length;
    const done = items.filter((item) => item.status === 'done').length;

    return { items, progress: { done, total } };
  }

  // ─── 校验（US-02）──────────────────────────────────────────

  /**
   * 三条校验。
   *
   * ⚠️ 对**全部**提交项校验，**不因 enabled=false 跳过** —— 否则停用项被重新启用时
   * 会静默带出重叠窗口，判定变歧义。想暂存冲突项请直接删除（PRD-009 §2 US-02）。
   */
  private validateItems(items: ScheduleItemDto[]) {
    // ① 准备时序 / 不跨零点：prepare_time 必须严格早于 execute_time
    items.forEach((item, index) => {
      if (!item.prepare_time) return;
      if (ScheduleService.toMinutes(item.prepare_time) >= ScheduleService.toMinutes(item.execute_time)) {
        throw new BadRequestException(
          `第 ${index + 1} 项：准备时间需要早于执行时间（暂不支持跨天的事项，请调整时间）`,
        );
      }
    });

    // ② 同类项判定窗口不得重叠 → 同类相邻两项间隔 ≥ SCHEDULE_MIN_GAP_MINUTES
    const groups = new Map<ScheduleItemType, { index: number; minute: number }[]>();
    items.forEach((item, index) => {
      if (!isJudgableItemType(item.item_type)) return;
      const list = groups.get(item.item_type) ?? [];
      list.push({ index, minute: ScheduleService.toMinutes(item.execute_time) });
      groups.set(item.item_type, list);
    });

    for (const [type, list] of groups) {
      list.sort((a, b) => a.minute - b.minute);
      for (let i = 1; i < list.length; i += 1) {
        const gap = list[i].minute - list[i - 1].minute;
        if (gap < SCHEDULE_MIN_GAP_MINUTES) {
          throw new BadRequestException(
            `第 ${list[i - 1].index + 1} 项与第 ${list[i].index + 1} 项时间太接近：同为「${SCHEDULE_ITEM_TYPE_LABELS[type]}」，` +
              `同一段时间的记录无法判断属于哪一项，请至少间隔 ${SCHEDULE_MIN_GAP_MINUTES} 分钟`,
          );
        }
      }
    }
  }

  // ─── 派生（US-05）──────────────────────────────────────────

  /**
   * 批量派生当日状态（**两遍算法**）。
   *
   * ① **窗口匹配（高置信）**：逐项在自己的判定窗口 `[执行−60, 执行+90]` 内找最早的匹配记录。
   *    窗口口径见 `SCHEDULE_EARLY_MINUTES` / `SCHEDULE_LATE_MINUTES`。
   * ② **顺序兜底（低置信，PRD-009 §2 US-05 追加）**：一天里记录时间整体偏早/偏晚时，
   *    窗口会把所有项都判成 `missed` 并一直催补记录 —— 但"第 N 顿"其实已经发生了。
   *    因此对**同类**剩下的「未配对项」与「未消费记录」各按时间升序，**一一顺序配对**：
   *
   *      第 1 个未配对项 ← 第 1 条剩余记录，第 2 个 ← 第 2 条，以此类推（多出的项/记录不动）。
   *
   * ⚠️ 纯顺序口径，**不设时间偏差上限**（用户决策 2026-10-09）；因此加一条安全闸：
   *   **执行时间还没到的项不参与兜底** —— 未来的顿次不可能"已经喝了"，
   *   否则一顿补喂（多出的记录）会把晚上的项提前点亮成已完成。
   *
   * 记录消费是全局的（按 `records` 数组下标去重），保证一条记录只点亮一项。
   * 返回顺序与入参 `rows` 一致（即 `sort_order` 展示顺序）。
   */
  private deriveItems(rows: ScheduleRow[], records: any[], nowMin: number): ScheduleItemVo[] {
    /** rows 下标 → 命中的记录 */
    const matched = new Map<number, { record: any; minute: number }>();
    /** 已消费的 records 下标 */
    const consumed = new Set<number>();

    // ── ① 窗口匹配 ──
    rows.forEach((row, index) => {
      if (!isJudgableItemType(row.item_type)) return;
      const { start, end } = ScheduleService.windowOf(row);
      let bestIdx = -1;
      let bestMinute = Number.POSITIVE_INFINITY;

      records.forEach((record, idx) => {
        if (consumed.has(idx)) return;
        if (!ScheduleService.matchRecord(row.item_type, record)) return;
        const minute = ScheduleService.recordMinute(record);
        if (minute === null || minute < start || minute > end) return;
        if (minute < bestMinute) {
          bestMinute = minute;
          bestIdx = idx;
        }
      });

      if (bestIdx >= 0) {
        consumed.add(bestIdx);
        matched.set(index, { record: records[bestIdx], minute: bestMinute });
      }
    });

    // ── ② 顺序兜底 ──
    /** 类型 → 未配对且"执行时间已到"的 rows 下标 */
    const pendingByType = new Map<ScheduleItemType, number[]>();
    rows.forEach((row, index) => {
      if (matched.has(index) || !isJudgableItemType(row.item_type)) return;
      if (ScheduleService.toMinutes(ScheduleService.toHm(row.execute_time)) > nowMin) return;
      const list = pendingByType.get(row.item_type) ?? [];
      list.push(index);
      pendingByType.set(row.item_type, list);
    });

    for (const [type, indexes] of pendingByType) {
      const pool: { idx: number; record: any; minute: number }[] = [];
      records.forEach((record, idx) => {
        if (consumed.has(idx)) return;
        if (!ScheduleService.matchRecord(type, record)) return;
        const minute = ScheduleService.recordMinute(record);
        if (minute === null) return;
        pool.push({ idx, record, minute });
      });
      if (pool.length === 0) continue;

      // 项按「几点该做」升序（不是展示顺序）—— "第 N 顿"是时间概念
      indexes.sort(
        (a, b) =>
          ScheduleService.toMinutes(ScheduleService.toHm(rows[a].execute_time)) -
          ScheduleService.toMinutes(ScheduleService.toHm(rows[b].execute_time)),
      );
      pool.sort((a, b) => a.minute - b.minute);

      const count = Math.min(indexes.length, pool.length);
      for (let i = 0; i < count; i += 1) {
        consumed.add(pool[i].idx);
        matched.set(indexes[i], { record: pool[i].record, minute: pool[i].minute });
      }
    }

    return rows.map((row, index) => ScheduleService.buildVo(row, matched.get(index) ?? null, nowMin));
  }

  /** 判定窗口 `[执行 − 60, 执行 + 90]`，闭区间；夹在当日 00:00–24:00 内（跨零点不支持） */
  private static windowOf(row: ScheduleRow): { start: number; end: number } {
    const execMin = ScheduleService.toMinutes(ScheduleService.toHm(row.execute_time));
    return {
      start: Math.max(0, execMin - SCHEDULE_EARLY_MINUTES),
      end: Math.min(MINUTES_PER_DAY, execMin + SCHEDULE_LATE_MINUTES),
    };
  }

  /** 单项 → VO。状态机：命中 → done，否则按 准备/执行/宽限 三段推导 */
  private static buildVo(
    row: ScheduleRow,
    matched: { record: any; minute: number } | null,
    nowMin: number,
  ): ScheduleItemVo {
    const executeTime = ScheduleService.toHm(row.execute_time);
    const prepareTime = row.prepare_time ? ScheduleService.toHm(row.prepare_time) : null;

    const execMin = ScheduleService.toMinutes(executeTime);
    const prepareMin = prepareTime ? ScheduleService.toMinutes(prepareTime) : null;
    const { end: windowEnd } = ScheduleService.windowOf(row);

    let status: ScheduleItemStatus;
    if (matched) {
      status = 'done';
    } else if (prepareMin !== null && nowMin < prepareMin) {
      status = 'upcoming';
    } else if (prepareMin !== null && nowMin < execMin) {
      status = 'preparing';
    } else if (nowMin < execMin) {
      status = 'upcoming';
    } else if (nowMin <= windowEnd) {
      status = 'doing';
    } else {
      status = 'missed';
    }

    const vo = ScheduleService.rowToVo(row);
    vo.status = status;
    vo.matchedRecord = matched
      ? {
          id: matched.record.id,
          type: matched.record.type,
          recordTime: ScheduleService.toHm(ScheduleService.recordHm(matched.record)),
          summary: ScheduleService.buildSummary(row.item_type, matched.record, matched.minute),
        }
      : null;
    return vo;
  }

  /**
   * 日程项类型 ↔ 记录匹配 —— **唯一口径**。
   *
   * 实现已外迁到 `schedule-item-type.registry.ts`，本方法只做查表。
   * 新增类型时**不要**在此处加 case，改 registry 即可（否则又是一处漂移点）。
   */
  private static matchRecord(type: ScheduleItemType, record: any): boolean {
    return scheduleItemTypeDef(type)?.match?.(record) ?? false;
  }

  /** 关联记录摘要，形如 `09:10 · 米粉 30g`（正文由类型声明表给出，此处只拼时间前缀） */
  private static buildSummary(type: ScheduleItemType, record: any, minute: number): string {
    const label = scheduleItemTypeDef(type)?.summary?.(record) ?? '';
    return [ScheduleService.minuteToHm(minute), label].filter(Boolean).join(' · ');
  }

  // ─── 数据访问 ──────────────────────────────────────────────

  private async selectItems(babyId: string): Promise<ScheduleRow[]> {
    const [rows] = await this.db.execute<any[]>(
      `SELECT id, baby_id, item_type, title, execute_time, prepare_time,
              prepare_offset_min, enabled, sort_order, note
         FROM schedule_template_item
        WHERE baby_id = ? AND deleted_at IS NULL
        ORDER BY sort_order ASC, execute_time ASC, created_at ASC`,
      [babyId],
    );
    return rows as ScheduleRow[];
  }

  /** 校验 babyId 归属该家庭，防止跨家庭读写 */
  private async assertBabyInFamily(familyId: string, babyId: string) {
    if (!babyId) throw new BadRequestException('缺少 baby_id 参数');
    const [rows] = await this.db.execute<any[]>(
      `SELECT id FROM baby_profile WHERE id = ? AND family_id = ? AND deleted_at IS NULL LIMIT 1`,
      [babyId, familyId],
    );
    if (rows.length === 0) {
      throw new ForbiddenException('该宝宝不属于当前家庭');
    }
  }

  private static rowToVo(row: ScheduleRow): ScheduleItemVo {
    return {
      id: row.id,
      itemType: row.item_type,
      title: row.title || SCHEDULE_ITEM_TYPE_LABELS[row.item_type],
      executeTime: ScheduleService.toHm(row.execute_time),
      prepareTime: row.prepare_time ? ScheduleService.toHm(row.prepare_time) : null,
      prepareOffsetMin: row.prepare_offset_min ?? null,
      enabled: Number(row.enabled) === 1,
      sortOrder: Number(row.sort_order) || 0,
      note: row.note ?? null,
    };
  }

  // ─── 时间工具 ──────────────────────────────────────────────

  /** 任意 TIME / Date / 字符串 → 'HH:mm'；无法解析返回 '' */
  private static toHm(value: unknown): string {
    if (value instanceof Date) {
      return ScheduleService.minuteToHm(value.getHours() * 60 + value.getMinutes());
    }
    const text = String(value ?? '');
    const match = text.match(/(\d{1,2}):(\d{2})/);
    if (!match) return '';
    return `${match[1].padStart(2, '0')}:${match[2]}`;
  }

  private static minuteToHm(minute: number): string {
    const h = Math.floor(minute / 60);
    const m = minute % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  private static toMinutes(hm: string): number {
    const [h, m] = hm.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  /** 记录时间 → 当日分钟数；无法解析返回 null（该记录不参与匹配） */
  private static recordMinute(record: any): number | null {
    const hm = ScheduleService.recordHm(record);
    if (!hm) return null;
    return ScheduleService.toMinutes(hm);
  }

  private static recordHm(record: any): string {
    const raw = record?.time;
    if (raw instanceof Date) {
      return ScheduleService.minuteToHm(raw.getHours() * 60 + raw.getMinutes());
    }
    const text = String(raw ?? '');
    const match = text.match(/[T ](\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}` : '';
  }
}
