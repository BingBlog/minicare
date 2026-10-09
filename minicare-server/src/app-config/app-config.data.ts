/**
 * app-config.data.ts
 * 权威数据源：所有枚举值和业务常量在此定义
 * 后端各 DTO 的 enum 和整数映射常量均从此处导入，保证单点定义
 */

import {
  SCHEDULE_ITEM_GROUPS,
  SCHEDULE_ITEM_TYPE_META,
} from '../schedule/schedule-item-type.meta';

export const CONFIG_VERSION = '2026-10-09.1'; // 修改配置时同步更新

// ============================================================
// 喂养
// ============================================================

export const FEED_TYPE_OPTIONS = [
  { value: 'breast',        label: '母乳'   },
  { value: 'formula',       label: '配方奶' },
  { value: 'complementary', label: '辅食'   },
] as const;

export const BREAST_SIDE_OPTIONS = [
  { value: 'left',  label: '左侧' },
  { value: 'right', label: '右侧' },
  { value: 'both',  label: '双侧' },
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
  { value: 'wet',   label: '嘘嘘'       },
  { value: 'dirty', label: '臭臭'       },
  { value: 'mixed', label: '臭臭＋嘘嘘' },
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
  { value: 'bath',        label: '洗澡' },
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
  { value: 'happy',   label: '愉悦满足'   },
  { value: 'neutral', label: '平静舒适'   },
  { value: 'fussy',   label: '烦躁不开心' },
  { value: 'crying',  label: '痛苦哭闹'   },
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
  { value: 'male',    label: '男宝' },
  { value: 'female',  label: '女宝' },
  { value: 'unknown', label: '未知' },
] as const;

// ============================================================
// 营养素
// ============================================================

export const SUPPLEMENT_ITEMS = [
  { key: 'vitD3',     label: '维生素D3',  unit: 'IU', hint: '通常 400IU/天',      group: '维生素', aliases: ['D3', '维D', '维生素D', 'VD', '维D3'] },
  { key: 'vitAD',     label: '维生素AD',  unit: 'IU', hint: '维生素A+D 复合制剂', group: '维生素', aliases: ['AD', '维AD', '伊可新', '维生素A和D'] },
  { key: 'iron',      label: '铁剂',      unit: 'mg', hint: '通常 1mg/kg/天',     group: '矿物质', aliases: ['铁', '补铁', '右旋糖酐铁', '蛋白琥珀酸铁', '乳酸亚铁'] },
  { key: 'dha',       label: 'DHA',       unit: 'mg', hint: '通常 100mg/天',      group: '脂肪酸', aliases: ['藻油', '藻油DHA', '鱼油', '脑黄金'] },
  { key: 'probiotic', label: '益生菌',    unit: '次', hint: '每天1次',            group: '其他',   aliases: ['妈咪爱', '宝乐安', '合生元', '培菲康', '乳酸菌', '双歧杆菌'] },
  { key: 'calcium',   label: '钙剂',      unit: 'mg', hint: '按医嘱',             group: '矿物质', aliases: ['钙', '补钙', '乳酸钙', '碳酸钙', '葡萄糖酸钙'] },
  { key: 'zinc',      label: '锌剂',      unit: 'mg', hint: '按医嘱',             group: '矿物质', aliases: ['锌', '补锌', '葡萄糖酸锌', '甘草锌'] },
  { key: 'vitC',      label: '维生素C',   unit: 'mg', hint: '按医嘱',             group: '维生素', aliases: ['VC', '维C', '抗坏血酸'] },
  { key: 'vitB',      label: '维生素B',   unit: 'mg', hint: '按医嘱',             group: '维生素', aliases: ['VB', '维B', '复合维生素B'] },
  { key: 'vitA',      label: '维生素A',   unit: 'IU', hint: '按医嘱',             group: '维生素', aliases: ['VA', '维A', '视黄醇'] },
  { key: 'lactase',   label: '乳糖酶',    unit: '滴', hint: '每次喂奶前添加',     group: '其他',   aliases: ['乳糖酶滴剂'] },
  { key: 'prebiotic', label: '益生元',    unit: 'g',  hint: '按产品说明',         group: '其他',   aliases: ['低聚果糖', 'FOS', 'GOS', '水苏糖'] },
  { key: 'folicAcid', label: '叶酸',      unit: 'μg', hint: '按医嘱',             group: '维生素', aliases: ['维B9', '维生素B9'] },
] as const;

// ============================================================
// 日程项类型（PRD-009）
// ============================================================

/**
 * 日程项类型的可下发子集。
 *
 * ⚠️ 数据源是 `src/schedule/schedule-item-type.meta.ts`（纯数据，无函数，可安全下发），
 *    此处**不再手写第二份**。判定函数（match / summary）留在服务端 registry，不下发。
 * 小程序「作息计划 → 添加一项日程 → 类型」直接消费本字段，因此新增类型只需改服务端 meta。
 */
export const SCHEDULE_ITEM_TYPES = {
  groups: SCHEDULE_ITEM_GROUPS,
  items: SCHEDULE_ITEM_TYPE_META,
};

// ============================================================
// 语音 NLU 配置
// ============================================================

export const VOICE_NLU_CONFIG = {
  recordTypes: [
    {
      type: 'formula',
      label: '配方奶',
      fields: [{ name: 'formula_ml', label: '奶量(ml)', required: true }],
      triggers: ['喝奶', '吃奶', '喂奶', '冲奶', '奶量', 'ml奶', '毫升奶'],
      examples: [
        { input: '旺仔喝奶170ml', output: { recordType: 'formula', fields: { formula_ml: 170 }, confidence: 'high' } },
        { input: '喝了120毫升奶', output: { recordType: 'formula', fields: { formula_ml: 120 }, confidence: 'high' } },
        { input: '喂奶150', output: { recordType: 'formula', fields: { formula_ml: 150 }, confidence: 'high' } },
      ],
    },
    {
      type: 'breast',
      label: '母乳',
      fields: [
        { name: 'breast_side', label: '侧', required: false, enum: ['left', 'right', 'both'] },
        { name: 'duration_min', label: '时长(分钟)', required: false },
      ],
      triggers: ['母乳', '亲喂', '左边喂', '右边喂', '喂母乳'],
      examples: [
        { input: '左边喂了15分钟', output: { recordType: 'breast', fields: { breast_side: 'left', duration_min: 15 }, confidence: 'high' } },
        { input: '母乳喂了20分钟', output: { recordType: 'breast', fields: { duration_min: 20 }, confidence: 'high' } },
      ],
    },
    {
      type: 'food',
      label: '辅食',
      fields: [{ name: 'complementary_food', label: '食物名称', required: true }],
      triggers: ['吃辅食', '加辅食', '吃米糊', '吃果泥'],
      examples: [
        { input: '吃了半碗米糊', output: { recordType: 'food', fields: { complementary_food: '米糊' }, confidence: 'high' } },
        { input: '吃了点苹果泥', output: { recordType: 'food', fields: { complementary_food: '苹果泥' }, confidence: 'high' } },
      ],
    },
    {
      type: 'diaper',
      label: '尿布',
      fields: [{ name: 'diaper_type', label: '类型', required: true, enum: ['wet', 'dirty', 'mixed', 'dry'] }],
      triggers: ['换尿布', '尿了', '拉了', '拉屎', '大便', '小便', '尿布湿了'],
      synonymMap: {
        wet: ['尿了', '小便', '湿了', '尿布湿了'],
        dirty: ['拉了', '大便', '臭臭', '粑粑', '拉屎'],
        mixed: ['又尿又拉', '混合'],
        dry: ['干的', '没尿'],
      },
      examples: [
        { input: '拉了', output: { recordType: 'diaper', fields: { diaper_type: 'dirty' }, confidence: 'high' } },
        { input: '尿了', output: { recordType: 'diaper', fields: { diaper_type: 'wet' }, confidence: 'high' } },
      ],
    },
    {
      type: 'sleep',
      label: '睡眠(补录)',
      fields: [{ name: 'duration_min', label: '时长(分钟)', required: true }],
      triggers: ['睡了X小时', '午睡了X分钟', '小睡了X分钟'],
      examples: [
        { input: '宝宝睡了两个小时', output: { recordType: 'sleep', fields: { duration_min: 120 }, confidence: 'high' } },
        { input: '睡了一个半小时', output: { recordType: 'sleep', fields: { duration_min: 90 }, confidence: 'high' } },
      ],
    },
    {
      type: 'sleep_start',
      label: '开始睡觉',
      fields: [],
      triggers: ['刚睡了', '睡了', '入睡了', '睡觉了', '睡着了', '哄睡了'],
      examples: [
        { input: '刚睡了', output: { recordType: 'sleep_start', fields: {}, confidence: 'high' } },
        { input: '睡着了', output: { recordType: 'sleep_start', fields: {}, confidence: 'high' } },
      ],
    },
    {
      type: 'sleep_end',
      label: '醒来',
      fields: [],
      triggers: ['刚醒了', '醒了', '起来了', '睡醒了'],
      examples: [
        { input: '刚醒了', output: { recordType: 'sleep_end', fields: {}, confidence: 'high' } },
        { input: '醒了', output: { recordType: 'sleep_end', fields: {}, confidence: 'high' } },
      ],
    },
    {
      type: 'temperature',
      label: '体温',
      fields: [{ name: 'temperature', label: '体温', required: true }],
      triggers: ['体温', '发烧', '量体温', '烧到'],
      examples: [
        { input: '体温38度5', output: { recordType: 'temperature', fields: { temperature: 38.5 }, confidence: 'high' } },
        { input: '发烧了39度', output: { recordType: 'temperature', fields: { temperature: 39 }, confidence: 'high' } },
      ],
    },
    {
      type: 'symptom',
      label: '表现',
      fields: [
        { name: 'mood', label: '情绪', required: false, enum: ['happy', 'calm', 'fussy', 'crying'] },
        { name: 'spirit', label: '精神', required: false, enum: ['active', 'normal', 'tired', 'low'] },
      ],
      triggers: ['开心', '哭闹', '烦躁', '精神好', '没精神', '闹腾'],
      synonymMap: {
        mood: { happy: ['开心'], calm: ['平静', '安静'], fussy: ['烦躁', '闹', '哼唧', '闹腾'], crying: ['哭', '大哭', '哭闹'] },
        spirit: { active: ['精神好', '活跃'], normal: ['正常'], tired: ['困', '累'], low: ['没精神', '蔫', '嗜睡', '蔫蔫的'] },
      },
      examples: [
        { input: '宝宝今天很开心', output: { recordType: 'symptom', fields: { mood: 'happy' }, confidence: 'high' } },
        { input: '宝宝没精神', output: { recordType: 'symptom', fields: { spirit: 'low' }, confidence: 'high' } },
      ],
    },
    {
      type: 'supplement',
      label: '营养素/补充剂',
      fields: [
        { name: 'supplement_key', label: '营养素代码', required: true },
        { name: 'supplement_name', label: '营养素名称', required: true },
        { name: 'dose', label: '剂量', required: false },
      ],
      triggers: ['补充了', '吃了(营养素)', '喝了(营养素)'],
      examples: [
        { input: '补充了D3', output: { recordType: 'supplement', fields: { supplement_key: 'vitD3', supplement_name: '维生素D3' }, confidence: 'high' } },
        { input: '吃了妈咪爱', output: { recordType: 'supplement', fields: { supplement_key: 'probiotic', supplement_name: '益生菌' }, confidence: 'high' } },
        { input: '喝了铁', output: { recordType: 'supplement', fields: { supplement_key: 'iron', supplement_name: '铁剂' }, confidence: 'high' } },
        { input: '补充了AD', output: { recordType: 'supplement', fields: { supplement_key: 'vitAD', supplement_name: '维生素AD' }, confidence: 'high' } },
      ],
    },
  ],
} as const;

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
      scheduleItemTypes:   SCHEDULE_ITEM_TYPES,
      voiceNlu:            VOICE_NLU_CONFIG,
      quickActionDefaults: QUICK_ACTION_DEFAULTS,
    };
  },
};
