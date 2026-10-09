/**
 * 日程默认模板 —— 系统预置的一份可用作息（PRD-009 US-01）
 *
 * 时间点已于 2026-10-09 由用户确认，即为上线默认值；用户保存后可随时调整（US-02）。
 * 落地方式：库中无任何模板项时，`GET template` 返回本表且带 `is_default: true`，
 * **不自动写库** —— 用户点"保存使用"才落库（PRD-009 决策 D3 配套口径）。
 *
 * 同类项间隔自查（须满足 ≥ SCHEDULE_MIN_GAP_MINUTES = 150 分钟）：
 *   4 顿奶：07:00 → 11:30 → 16:30 → 20:00，间隔 270 / 300 / 210 分钟 ✅
 *   3 顿辅食：09:00 → 13:30 → 18:00，间隔 270 / 270 分钟 ✅
 *   2 次外出：10:30 → 15:30，间隔 300 分钟 ✅
 */
import { ScheduleItemType } from './schedule-item-type';

export interface DefaultScheduleItem {
  item_type: ScheduleItemType;
  title: string;
  execute_time: string;
  prepare_time: string | null;
  prepare_offset_min: number | null;
}

/** 通用 9–12 月龄作息（3 顿辅食 + 4 顿奶 + 外出 1–2 次 + 19:00 洗澡） */
const DEFAULT_SCHEDULE_TEMPLATE: DefaultScheduleItem[] = [
  { item_type: ScheduleItemType.FORMULA, title: '第 1 顿奶',        execute_time: '07:00', prepare_time: null,    prepare_offset_min: null },
  { item_type: ScheduleItemType.FOOD,    title: '早餐辅食',         execute_time: '09:00', prepare_time: '07:00', prepare_offset_min: 120 },
  { item_type: ScheduleItemType.OUTDOOR, title: '户外活动',         execute_time: '10:30', prepare_time: null,    prepare_offset_min: null },
  { item_type: ScheduleItemType.FORMULA, title: '第 2 顿奶',        execute_time: '11:30', prepare_time: null,    prepare_offset_min: null },
  { item_type: ScheduleItemType.FOOD,    title: '午餐辅食',         execute_time: '13:30', prepare_time: '11:30', prepare_offset_min: 120 },
  { item_type: ScheduleItemType.OUTDOOR, title: '户外活动',         execute_time: '15:30', prepare_time: null,    prepare_offset_min: null },
  { item_type: ScheduleItemType.FORMULA, title: '第 3 顿奶',        execute_time: '16:30', prepare_time: null,    prepare_offset_min: null },
  { item_type: ScheduleItemType.FOOD,    title: '晚餐辅食',         execute_time: '18:00', prepare_time: '16:00', prepare_offset_min: 120 },
  { item_type: ScheduleItemType.BATH,    title: '洗澡',             execute_time: '19:00', prepare_time: null,    prepare_offset_min: null },
  { item_type: ScheduleItemType.FORMULA, title: '第 4 顿奶（睡前）', execute_time: '20:00', prepare_time: null,    prepare_offset_min: null },
];

/**
 * 取默认作息模板。
 *
 * @param ageMonths 宝宝月龄 —— **当前仅维护一套通用模板，参数为后续分档预留**
 *                  （如 6–8 月龄 2 顿辅食 / 12M+ 减奶增辅食）。
 */
export function getDefaultScheduleTemplate(ageMonths?: number): DefaultScheduleItem[] {
  void ageMonths;
  // 返回浅拷贝，避免调用方就地修改模块级常量
  return DEFAULT_SCHEDULE_TEMPLATE.map((item) => ({ ...item }));
}
