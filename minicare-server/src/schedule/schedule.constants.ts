/**
 * 日程模块常量与枚举 —— **判定窗口的唯一权威定义处**
 *
 * 依据：PRD-009 §1.4.1（判定窗口详解）/ 实施派工 §5.2（常量「单一定义处」清单）
 *
 * ⚠️ 三条铁律：
 *   ① 判定窗口的数字**只允许在本文件出现**。服务端其它任何地方（含校验、派生、提示文案）
 *      必须 import 本文件的常量，禁止再写字面量 60 / 90 / 150 / 120。
 *   ② `SCHEDULE_MIN_GAP_MINUTES` 由前两个常量**推导**，不独立定义 ——
 *      改窗口参数时"同类项最小间隔"必须跟着变，否则判定会变歧义。
 *   ③ 小程序端若需同值（如准备时间联动推导用的 120 分钟），优先走 `/api/config` 下发；
 *      退而其次硬编码时必须注明指向本文件。
 *
 * 📌 关于日程项类型（2026-10-09 起）：
 *   类型清单、默认名、是否可判定、默认准备提前量**均不在本文件维护**，而是从
 *   `schedule-item-type.meta.ts`（纯数据）+ `schedule-item-type.registry.ts`（判定函数）派生。
 *   本文件只保留**与类型无关**的窗口类常量，以及给既有调用方用的派生函数（签名不变）。
 */
import { ScheduleItemType } from './schedule-item-type';
import { SCHEDULE_ITEM_TYPE_META } from './schedule-item-type.meta';
import { scheduleItemTypeDef } from './schedule-item-type.registry';

/** 判定窗口向前容差（分钟）—— 防止把上一顿的记录误判给这一顿 */
export const SCHEDULE_EARLY_MINUTES = 60;

/** 判定窗口向后宽限（分钟）—— 容忍家长晚喂 / 晚记 */
export const SCHEDULE_LATE_MINUTES = 90;

/** 判定窗口总长（分钟）= 60 + 90 = 150 */
export const SCHEDULE_WINDOW_MINUTES = SCHEDULE_EARLY_MINUTES + SCHEDULE_LATE_MINUTES;

/** 同类项执行时间的最小间隔（分钟）—— 由窗口总长推导，保证窗口不重叠 */
export const SCHEDULE_MIN_GAP_MINUTES = SCHEDULE_WINDOW_MINUTES;

/** 名称长度上限（与 DDL VARCHAR(50) 对齐） */
export const SCHEDULE_TITLE_MAX_LENGTH = 50;

/** 备注长度上限（与 DDL VARCHAR(200) 对齐） */
export const SCHEDULE_NOTE_MAX_LENGTH = 200;

/**
 * 辅食准备节点的默认提前量（分钟）—— 权威定义已下沉到 meta（供 app-config 下发），
 * 此处仅按原路径再导出，避免既有引用失效。
 */
export { SCHEDULE_DEFAULT_PREPARE_OFFSET_MIN } from './schedule-item-type.meta';

/** 日程项类型的中文默认名（title 为空时使用）—— 由类型声明表派生，勿在此处手写 */
export const SCHEDULE_ITEM_TYPE_LABELS: Record<ScheduleItemType, string> = Object.fromEntries(
  SCHEDULE_ITEM_TYPE_META.map((meta) => [meta.type, meta.label]),
) as Record<ScheduleItemType, string>;

/**
 * 是否可以自动判定完成。
 * `other` 无对应记录类型 → 不判定、不进进度分母（PRD-009 §1.4 术语表「进度分母」）。
 */
export function isJudgableItemType(type: ScheduleItemType): boolean {
  return scheduleItemTypeDef(type)?.judgable ?? false;
}

/** 是否带准备节点的默认项（当前仅辅食需要提前备餐） */
export function defaultPrepareOffsetMin(type: ScheduleItemType): number | null {
  return scheduleItemTypeDef(type)?.defaultPrepareOffsetMin ?? null;
}
