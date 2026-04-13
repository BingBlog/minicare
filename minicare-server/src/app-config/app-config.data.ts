/**
 * app-config.data.ts
 * 权威数据源：所有枚举值和业务常量在此定义
 * 后端各 DTO 的 enum 和整数映射常量均从此处导入，保证单点定义
 */

export const CONFIG_VERSION = '2026-04-13.1'; // 修改配置时同步更新

// ============================================================
// 喂养
// ============================================================

export const FEED_TYPE_OPTIONS = [
  { value: 'breast',        label: '母乳',   int: 1 },
  { value: 'formula',       label: '配方奶', int: 2 },
  { value: 'complementary', label: '辅食',   int: 3 },
] as const;

export const BREAST_SIDE_OPTIONS = [
  { value: 'left',  label: '左侧', int: 1 },
  { value: 'right', label: '右侧', int: 2 },
  { value: 'both',  label: '双侧', int: 3 },
] as const;

export const MILK_TYPE_OPTIONS = [
  { value: 'aa',            label: '氨基酸奶粉',        short: '氨基酸' },
  { value: 'eh_no_lactose', label: '深度水解（无乳糖）', short: '深度水解' },
  { value: 'eh_lactose',    label: '深度水解（含乳糖）', short: '深度水解' },
  { value: 'ph',            label: '适度水解奶粉',       short: '适度水解' },
  { value: 'std',           label: '普通奶粉',           short: '普通' },
] as const;

// ============================================================
// 尿布
// ============================================================

export const DIAPER_TYPE_OPTIONS = [
  { value: 'wet',   label: '嘘嘘',       int: 1 },
  { value: 'dirty', label: '臭臭',       int: 2 },
  { value: 'mixed', label: '臭臭＋嘘嘘', int: 3 },
] as const;

export const POOP_TYPE_OPTIONS = [
  { value: 'normal', label: '正常软便' },
  { value: 'loose',  label: '稀便' },
  { value: 'watery', label: '水样便' },
  { value: 'hard',   label: '干硬粒' },
  { value: 'bloody', label: '血丝便' },
] as const;

export const POOP_COLOR_OPTIONS = [
  { value: 'yellow',       label: '黄色' },
  { value: 'brown_yellow', label: '棕黄' },
  { value: 'green',        label: '绿色' },
] as const;

export const BUTT_CONDITION_OPTIONS = [
  { value: 'normal',       label: '正常' },
  { value: 'slightly_red', label: '轻微发红' },
  { value: 'rash',         label: '尿布疹' },
  { value: 'severe_rash',  label: '严重尿布疹' },
  { value: 'fungal',       label: '真菌感染' },
  { value: 'other',        label: '其他' },
] as const;

// ============================================================
// 睡眠
// ============================================================

export const SLEEP_QUALITY_OPTIONS = [
  { value: 'good',   label: '质量好' },
  { value: 'normal', label: '一般' },
  { value: 'poor',   label: '较差' },
] as const;

export const SLEEP_PERIOD_OPTIONS = [
  { value: 'night',         label: '夜觉' },
  { value: 'morning_nap',   label: '上午觉' },
  { value: 'afternoon_nap', label: '下午觉' },
  { value: 'other',         label: '其他' },
] as const;

// ============================================================
// 活动
// ============================================================

export const ACTIVITY_TYPE_OPTIONS = [
  { value: 'gross_motor', label: '大运动练习' },
  { value: 'fine_motor',  label: '精细运动练习' },
  { value: 'edu_play',    label: '亲子早教互动' },
  { value: 'outdoor',     label: '户外活动' },
  { value: 'daily_care',  label: '日常护理' },
  { value: 'other',       label: '其他活动' },
] as const;

export const ACTIVITY_INTENSITY_OPTIONS = [
  { value: 'easy',   label: '轻松' },
  { value: 'medium', label: '适中' },
  { value: 'active', label: '活跃' },
] as const;

// ============================================================
// 情绪 / 精神
// ============================================================

export const MOOD_OPTIONS = [
  { value: 'happy',   label: '愉悦满足',  int: 1 },
  { value: 'neutral', label: '平静舒适',  int: 2 },
  { value: 'fussy',   label: '烦躁不开心', int: 3 },
  { value: 'crying',  label: '痛苦哭闹',  int: 4 },
] as const;

export const SPIRIT_LEVEL_OPTIONS = [
  { value: 'active',    label: '精神活跃' },
  { value: 'normal',    label: '状态良好' },
  { value: 'tired',     label: '烦躁不安' },
  { value: 'lethargic', label: '萎靡嗜睡' },
] as const;

// ============================================================
// 医疗
// ============================================================

export const VISIT_TYPE_OPTIONS = [
  { value: 'checkup', label: '儿保检查' },
  { value: 'allergy', label: '过敏原检测' },
  { value: 'sick',    label: '就诊记录' },
  { value: 'vaccine', label: '疫苗接种' },
  { value: 'blood',   label: '血液检查' },
  { value: 'other',   label: '其他检查' },
] as const;

// ============================================================
// 过敏
// ============================================================

export const ALLERGY_TYPE_OPTIONS = [
  { value: 'milk',      label: '牛奶蛋白' },
  { value: 'egg',       label: '鸡蛋' },
  { value: 'wheat',     label: '小麦/麸质' },
  { value: 'peanut',    label: '花生' },
  { value: 'tree_nut',  label: '坚果' },
  { value: 'soy',       label: '大豆' },
  { value: 'fish',      label: '鱼类' },
  { value: 'shellfish', label: '贝类' },
  { value: 'other',     label: '其他' },
] as const;

export const ALLERGY_LEVEL_OPTIONS = [
  { value: 'mild',     label: '轻度' },
  { value: 'moderate', label: '中度' },
  { value: 'severe',   label: '重度' },
  { value: 'unknown',  label: '未知程度' },
] as const;

// ============================================================
// 宝宝
// ============================================================

export const BABY_GENDER_OPTIONS = [
  { value: 'male',    label: '男宝', int: 1 },
  { value: 'female',  label: '女宝', int: 2 },
  { value: 'unknown', label: '未知', int: 0 },
] as const;

// ============================================================
// 营养素
// ============================================================

export const SUPPLEMENT_ITEMS = [
  { key: 'vitD',      label: '维生素D',  unit: 'IU', hint: '通常 400IU/天',      group: '维生素' },
  { key: 'iron',      label: '铁剂',     unit: 'mg', hint: '通常 1mg/kg/天',     group: '矿物质' },
  { key: 'calcium',   label: '钙剂',     unit: 'mg', hint: '按医嘱',             group: '矿物质' },
  { key: 'dha',       label: 'DHA',      unit: 'mg', hint: '通常 100mg/天',      group: '脂肪酸' },
  { key: 'vitAD',     label: '维生素AD', unit: 'IU', hint: '维生素A+D 复合制剂', group: '维生素' },
  { key: 'zinc',      label: '锌剂',     unit: 'mg', hint: '按医嘱',             group: '矿物质' },
  { key: 'probiotic', label: '益生菌',   unit: '次', hint: '每天1次',            group: '其他' },
  { key: 'vitC',      label: '维生素C',  unit: 'mg', hint: '按医嘱',             group: '维生素' },
] as const;

// ============================================================
// 数值范围
// ============================================================

export const LIMITS = {
  formulaMl:         { min: 0,    max: 500   },
  breastDurationMin: { min: 1,    max: 120   },
  foodAmountG:       { min: 0,    max: 500   },
  scoopCount:        { min: 0,    max: 20    },
  heightMm:          { min: 300,  max: 1500  },
  weightG:           { min: 500,  max: 30000 },
  headMm:            { min: 250,  max: 600   },
  diaperCount:       { min: 0,    max: 20    },
  temperature:       { min: 35.0, max: 42.0  },
  feverThreshold:    37.5,
};

// ============================================================
// 按月龄默认快捷入口
// ============================================================

export const QUICK_ACTION_DEFAULTS = {
  '0-5':  ['formula', 'breast', 'diaper', 'sleep', 'temperature', 'symptom'],
  '6-11': ['food', 'formula', 'breast', 'diaper', 'sleep', 'temperature'],
  '12+':  ['food', 'formula', 'diaper', 'sleep', 'activity', 'growth'],
};

// ============================================================
// 整数映射辅助工具（供 DTO / Service 层使用）
// ============================================================

/** 从 options 数组生成 value -> int 映射表 */
function buildValueToInt<T extends { value: string; int: number }>(
  options: readonly T[],
): Record<string, number> {
  return Object.fromEntries(options.map((o) => [o.value, o.int]));
}

/** 从 options 数组生成 int -> value 映射表 */
function buildIntToValue<T extends { value: string; int: number }>(
  options: readonly T[],
): Record<number, string> {
  return Object.fromEntries(options.map((o) => [o.int, o.value]));
}

/** feed_type <-> TINYINT */
export const FEED_TYPE_TO_INT  = buildValueToInt(FEED_TYPE_OPTIONS);
export const INT_TO_FEED_TYPE  = buildIntToValue(FEED_TYPE_OPTIONS);

/** breast_side <-> TINYINT */
export const BREAST_SIDE_TO_INT = buildValueToInt(BREAST_SIDE_OPTIONS);
export const INT_TO_BREAST_SIDE = buildIntToValue(BREAST_SIDE_OPTIONS);

/** diaper_type <-> TINYINT */
export const DIAPER_TYPE_TO_INT = buildValueToInt(DIAPER_TYPE_OPTIONS);
export const INT_TO_DIAPER_TYPE = buildIntToValue(DIAPER_TYPE_OPTIONS);

/** mood <-> TINYINT */
export const MOOD_TO_INT  = buildValueToInt(MOOD_OPTIONS);
export const INT_TO_MOOD  = buildIntToValue(MOOD_OPTIONS);

/** baby gender <-> TINYINT */
export const GENDER_TO_INT = buildValueToInt(BABY_GENDER_OPTIONS);
export const GENDER_TO_STR = buildIntToValue(BABY_GENDER_OPTIONS);

// ============================================================
// build 方法（组装完整响应体）
// ============================================================

export const AppConfigData = {
  build() {
    return {
      version: CONFIG_VERSION,
      enums: {
        feedType:          FEED_TYPE_OPTIONS,
        breastSide:        BREAST_SIDE_OPTIONS,
        milkType:          MILK_TYPE_OPTIONS,
        diaperType:        DIAPER_TYPE_OPTIONS,
        poopType:          POOP_TYPE_OPTIONS,
        poopColor:         POOP_COLOR_OPTIONS,
        buttCondition:     BUTT_CONDITION_OPTIONS,
        sleepQuality:      SLEEP_QUALITY_OPTIONS,
        sleepPeriod:       SLEEP_PERIOD_OPTIONS,
        activityType:      ACTIVITY_TYPE_OPTIONS,
        activityIntensity: ACTIVITY_INTENSITY_OPTIONS,
        mood:              MOOD_OPTIONS,
        spiritLevel:       SPIRIT_LEVEL_OPTIONS,
        visitType:         VISIT_TYPE_OPTIONS,
        allergyType:       ALLERGY_TYPE_OPTIONS,
        allergyLevel:      ALLERGY_LEVEL_OPTIONS,
        babyGender:        BABY_GENDER_OPTIONS,
      },
      limits:              LIMITS,
      supplements:         SUPPLEMENT_ITEMS,
      quickActionDefaults: QUICK_ACTION_DEFAULTS,
    };
  },
};
