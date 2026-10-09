/**
 * 日程项类型的「判定声明表」
 *
 * ⚠️ 新增一个日程项类型，只改三处：
 *   ① `schedule-item-type.ts`（枚举值）
 *   ② `schedule-item-type.meta.ts`（名称 / 分组 / 是否可判定 / 准备提前量）
 *   ③ 本文件（match / summary）
 * 服务端判定（schedule.service）、默认名、进度分母、前端类型选项均自动跟上。
 * **禁止在别处再写一份 switch** —— 那是枚举漂移与"静默不生效"的根源。
 *
 * match 的两条硬约束（PRD-009 US-05）：
 *   ① 必须能唯一定位 `FamilyService.getTodayRecords()` 出口里的一类记录（type + detail 双键）；
 *   ② 该记录必须自带可解析时分 —— `schedule.service.ts` 的 `recordHm()` 只认 `[T ]HH:mm`。
 *      因此 `growth`（出口 time 是纯日期）、观察型（temperature / allergy / symptom）不做日程项。
 *
 * 匹配时刻的口径：
 *   · 绝大多数类型用 `getTodayRecords` 输出的 `time` 列（= 各自的 record_time）；
 *   · `SLEEP` 的 `time` 列即 `start_time` —— 对应「该睡觉了」判定，不匹配 end_time；
 *   · `MEDICATION` 走 medication_record.record_time，删除的用药记录已在出口过滤。
 */
import { ScheduleItemType } from './schedule-item-type';
import { SCHEDULE_ITEM_TYPE_META, ScheduleItemTypeMeta } from './schedule-item-type.meta';

export interface ScheduleItemTypeDef extends ScheduleItemTypeMeta {
  /** 记录匹配口径；null = 不判定（纯提醒项） */
  match: ((record: any) => boolean) | null;
  /** 关联记录摘要（不含时间前缀）；null = 无摘要 */
  summary: ((record: any) => string) | null;
}

// ─── 内部工具 ────────────────────────────────────────────────

const detailOf = (record: any): Record<string, any> => record?.detail ?? {};

/** 喂养类：出口统一 type='feeding'，靠 detail.feed_type 区分子表 */
const feedingMatcher = (feedType: string) => (record: any) =>
  record?.type === 'feeding' && detailOf(record).feed_type === feedType;

/** 活动类：出口统一 type='activity'，靠 detail.activity_type 区分 */
const activityMatcher = (activityType: string) => (record: any) =>
  record?.type === 'activity' && detailOf(record).activity_type === activityType;

const typeMatcher = (type: string) => (record: any) => record?.type === type;

const minutesText = (value: unknown) => (value != null ? `${value} 分钟` : '');

const BREAST_SIDE_LABELS: Record<string, string> = {
  left: '左侧',
  right: '右侧',
  both: '双侧',
};

const DIAPER_TYPE_LABELS: Record<string, string> = {
  wet: '嘘嘘',
  dirty: '臭臭',
  mixed: '臭臭＋嘘嘘',
};

/** 单件补剂 → `维生素D3 400IU` */
function supplementItemText(item: any): string {
  if (!item) return '';
  const name = String(item.label ?? item.key ?? '');
  const dose = item.dose != null ? `${item.dose}${item.unit ?? ''}` : '';
  return [name, dose].filter(Boolean).join(' ');
}

// ─── 匹配口径（Record 强制穷举：新增枚举值不补这里会编译报错）───

const MATCHERS: Record<ScheduleItemType, ((record: any) => boolean) | null> = {
  [ScheduleItemType.FORMULA]: feedingMatcher('formula'),
  [ScheduleItemType.BREAST]: feedingMatcher('breast'),
  // 读取侧把营养素出口为 feed_type='supplement'；另有历史数据落在 food 子表并用 complementary_food='营养素' 标记
  [ScheduleItemType.FOOD]: (record) =>
    feedingMatcher('complementary')(record) && detailOf(record).complementary_food !== '营养素',
  [ScheduleItemType.SUPPLEMENT]: feedingMatcher('supplement'),

  [ScheduleItemType.SLEEP]: typeMatcher('sleep'),
  [ScheduleItemType.DIAPER]: typeMatcher('diaper'),
  [ScheduleItemType.MEDICATION]: typeMatcher('medication'),

  [ScheduleItemType.OUTDOOR]: activityMatcher('outdoor'),
  [ScheduleItemType.BATH]: activityMatcher('bath'),
  [ScheduleItemType.GROSS_MOTOR]: activityMatcher('gross_motor'),
  [ScheduleItemType.FINE_MOTOR]: activityMatcher('fine_motor'),
  [ScheduleItemType.EDU_PLAY]: activityMatcher('edu_play'),
  // ⚠️ 历史遗留 activity_type='play' / 'tummy_time' 不认领 —— 语义无法一对一映射，
  //    宁可判定不到，也不要把「玩耍」记成「亲子早教互动」。
  [ScheduleItemType.DAILY_CARE]: activityMatcher('daily_care'),

  [ScheduleItemType.OTHER]: null,
};

// ─── 摘要文案 ────────────────────────────────────────────────

const SUMMARIES: Record<ScheduleItemType, ((record: any) => string) | null> = {
  [ScheduleItemType.FORMULA]: (record) => {
    const ml = detailOf(record).formula_ml;
    return ml != null ? `${ml}ml` : '';
  },
  [ScheduleItemType.BREAST]: (record) => {
    const detail = detailOf(record);
    return [BREAST_SIDE_LABELS[detail.breast_side] ?? '', minutesText(detail.duration_min)]
      .filter(Boolean)
      .join(' ');
  },
  [ScheduleItemType.FOOD]: (record) => {
    const detail = detailOf(record);
    const food = detail.complementary_food ? String(detail.complementary_food) : '';
    const amount = detail.amount_g != null ? `${detail.amount_g}g` : '';
    return [food, amount].filter(Boolean).join(' ');
  },
  [ScheduleItemType.SUPPLEMENT]: (record) => {
    const items = detailOf(record).supplement_items;
    if (!Array.isArray(items)) return '';
    return items.map(supplementItemText).filter(Boolean).join('、');
  },

  [ScheduleItemType.SLEEP]: (record) => minutesText(detailOf(record).duration_min),
  [ScheduleItemType.DIAPER]: (record) => {
    const diaperType = detailOf(record).diaper_type;
    return DIAPER_TYPE_LABELS[diaperType] ?? (diaperType ? String(diaperType) : '');
  },
  [ScheduleItemType.MEDICATION]: (record) => {
    const detail = detailOf(record);
    return [detail.medication_name ?? '', detail.dose ?? ''].filter(Boolean).join(' ');
  },

  [ScheduleItemType.OUTDOOR]: (record) => minutesText(detailOf(record).duration_min),
  [ScheduleItemType.BATH]: (record) => minutesText(detailOf(record).duration_min),
  [ScheduleItemType.GROSS_MOTOR]: (record) => minutesText(detailOf(record).duration_min),
  [ScheduleItemType.FINE_MOTOR]: (record) => minutesText(detailOf(record).duration_min),
  [ScheduleItemType.EDU_PLAY]: (record) => minutesText(detailOf(record).duration_min),
  [ScheduleItemType.DAILY_CARE]: (record) => minutesText(detailOf(record).duration_min),

  [ScheduleItemType.OTHER]: null,
};

// ─── 装配与查询 ──────────────────────────────────────────────

/** 类型 → 完整声明（顺序与 meta 一致；数据部分全部来自 meta，此处不重复维护） */
export const SCHEDULE_ITEM_TYPE_DEFS: ScheduleItemTypeDef[] = SCHEDULE_ITEM_TYPE_META.map((meta) => ({
  ...meta,
  match: MATCHERS[meta.type] ?? null,
  summary: SUMMARIES[meta.type] ?? null,
}));

const DEF_BY_TYPE = new Map<ScheduleItemType, ScheduleItemTypeDef>(
  SCHEDULE_ITEM_TYPE_DEFS.map((def) => [def.type, def]),
);

export function scheduleItemTypeDef(type: ScheduleItemType): ScheduleItemTypeDef | undefined {
  return DEF_BY_TYPE.get(type);
}
