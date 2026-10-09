/**
 * 日程项类型的「纯数据」声明
 *
 * ⚠️ 本文件**不得引入任何函数或 Nest 依赖** —— 它是被 `app-config.data.ts` 直接引用的
 *    可序列化数据源，也是「单一声明源」里唯一需要下发到小程序的部分。
 *    （判定函数在 `schedule-item-type.registry.ts`；依赖方向：constants → registry → meta，
 *      反向引 constants 会造成循环依赖。）
 *
 * 新增一个日程项类型，只改三处：
 *   ① `schedule-item-type.ts`（枚举值）
 *   ② 本文件（名称 / 分组 / 是否可判定 / 准备提前量）
 *   ③ `schedule-item-type.registry.ts`（match / summary）
 * 服务端判定、默认名、进度分母、前端类型选项**全部由本表派生**，禁止在别处再枚举一次。
 */
import { ScheduleItemType } from './schedule-item-type';

export type ScheduleItemGroup = 'feeding' | 'routine' | 'activity' | 'other';

export interface ScheduleItemTypeMeta {
  type: ScheduleItemType;
  /** 默认名（用户未自定义 title 时使用） */
  label: string;
  group: ScheduleItemGroup;
  /** 是否参与自动判定与进度分母；false = 纯提醒，不计入完成度 */
  judgable: boolean;
  /** 默认准备提前量（分钟）；null = 默认不带准备节点 */
  defaultPrepareOffsetMin: number | null;
}

/** 辅食准备节点的默认提前量（分钟）—— 仅用于 UI 联动推导，判定不依赖 */
export const SCHEDULE_DEFAULT_PREPARE_OFFSET_MIN = 120;

/** 分组展示顺序与中文名（前端"添加日程 → 类型"按此分组渲染，一屏放不下 14 项） */
export const SCHEDULE_ITEM_GROUPS: { key: ScheduleItemGroup; label: string }[] = [
  { key: 'feeding', label: '喂食' },
  { key: 'routine', label: '作息' },
  { key: 'activity', label: '活动' },
  { key: 'other', label: '其他' },
];

/** 全部可选日程项类型（顺序即前端展示顺序） */
export const SCHEDULE_ITEM_TYPE_META: ScheduleItemTypeMeta[] = [
  // 喂食
  { type: ScheduleItemType.FORMULA, label: '奶粉', group: 'feeding', judgable: true, defaultPrepareOffsetMin: null },
  { type: ScheduleItemType.BREAST, label: '母乳', group: 'feeding', judgable: true, defaultPrepareOffsetMin: null },
  { type: ScheduleItemType.FOOD, label: '辅食', group: 'feeding', judgable: true, defaultPrepareOffsetMin: SCHEDULE_DEFAULT_PREPARE_OFFSET_MIN },
  { type: ScheduleItemType.SUPPLEMENT, label: '营养素', group: 'feeding', judgable: true, defaultPrepareOffsetMin: null },

  // 作息
  { type: ScheduleItemType.SLEEP, label: '睡觉', group: 'routine', judgable: true, defaultPrepareOffsetMin: null },
  { type: ScheduleItemType.DIAPER, label: '换尿布', group: 'routine', judgable: true, defaultPrepareOffsetMin: null },
  { type: ScheduleItemType.MEDICATION, label: '用药', group: 'routine', judgable: true, defaultPrepareOffsetMin: null },

  // 活动
  { type: ScheduleItemType.OUTDOOR, label: '户外活动', group: 'activity', judgable: true, defaultPrepareOffsetMin: null },
  { type: ScheduleItemType.BATH, label: '洗澡', group: 'activity', judgable: true, defaultPrepareOffsetMin: null },
  { type: ScheduleItemType.GROSS_MOTOR, label: '大运动练习', group: 'activity', judgable: true, defaultPrepareOffsetMin: null },
  { type: ScheduleItemType.FINE_MOTOR, label: '精细运动练习', group: 'activity', judgable: true, defaultPrepareOffsetMin: null },
  { type: ScheduleItemType.EDU_PLAY, label: '亲子早教互动', group: 'activity', judgable: true, defaultPrepareOffsetMin: null },
  { type: ScheduleItemType.DAILY_CARE, label: '日常护理', group: 'activity', judgable: true, defaultPrepareOffsetMin: null },

  // 其他
  { type: ScheduleItemType.OTHER, label: '自定义事项', group: 'other', judgable: false, defaultPrepareOffsetMin: null },
];
