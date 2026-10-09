/**
 * 日程项类型枚举
 *
 * DDL: schedule_template_item.item_type VARCHAR(24)
 *   直接存字符串枚举值，新增类型只需扩展枚举，无需数据迁移。
 *
 * ⚠️ 新增一个类型的**唯一改动点**见 `schedule-item-type.registry.ts` 顶部说明
 *    （本文件 + `schedule-item-type.meta.ts` + `schedule-item-type.registry.ts`，共三处且仅此三处）。
 *
 * 判定范围的取舍（2026-10-09 用户拍板）：
 *   · 只做「待办型」—— 到点该做的事。
 *   · **观察型不做日程项**：体温 / 过敏表现 / 表现（symptom）属事件记录而非计划事项。
 *   · **growth 不做**：出口的 time 是纯日期（record_date），无时分，架构上无法判定。
 *   · 容器类 feeding / health 不做：无独立记录与时间语义。
 */
export enum ScheduleItemType {
  // ── 喂食 ──
  FORMULA = 'feeding_formula', // 奶粉
  BREAST = 'feeding_breast', // 母乳
  FOOD = 'feeding_food', // 辅食
  SUPPLEMENT = 'feeding_supplement', // 营养素

  // ── 作息 ──
  SLEEP = 'sleep', // 睡觉（匹配入睡时刻 start_time）
  DIAPER = 'diaper', // 换尿布
  MEDICATION = 'medication', // 用药

  // ── 活动 ──
  OUTDOOR = 'activity_outdoor', // 户外活动
  BATH = 'activity_bath', // 洗澡
  GROSS_MOTOR = 'activity_gross_motor', // 大运动练习
  FINE_MOTOR = 'activity_fine_motor', // 精细运动练习
  EDU_PLAY = 'activity_edu_play', // 亲子早教互动
  DAILY_CARE = 'activity_daily_care', // 日常护理

  // ── 其他 ──
  OTHER = 'other', // 自定义事项（不判定、不计入进度分母）
}
