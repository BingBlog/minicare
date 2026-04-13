# ARCH：统一配置接口设计方案

> 状态：设计中  
> 日期：2026-04-13  
> 背景：前端存在大量枚举值映射、业务常量、选项配置等，维护在多端时存在同步风险，需下沉到后端统一管理并通过接口下发。

---

## 一、现状问题诊断

### 1.1 配置分散、多端同步困难

目前约 **40+ 个配置常量**分散在前端的 `constants.ts`、各 record 页面目录、`RecordContent.tsx` 等多处：

| 问题类型 | 具体表现 | 影响 |
|---|---|---|
| **同源异形** | 同一枚举（如 `PoopType`）在前端有 `POOP_TYPE_LABELS`，后端有 `PoopType` enum，两者独立维护 | 新增一个值需改 2 处 |
| **显示配置硬编码在组件里** | `MILK_TYPE_PILL_COLORS`、`BUTT_ITEMS`（含颜色）写死在 `RecordContent.tsx` 和各 Section 组件中 | 颜色/文案调整需重发版本 |
| **魔法数字散落各处** | 发热阈值 `37.5`、奶量范围 `0-500ml`、头围范围 `250-600mm` 等 | 业务规则变更无法动态下发 |
| **重复定义** | `DIAPER_CARD_LABELS`（RecordContent.tsx）与 `DIAPER_TYPE_LABELS`（constants.ts）语义重叠 | 维护人员困惑，易产生不一致 |

---

## 二、前端配置项全量清单

### 2.1 枚举值映射字典（LABELS）

#### 2.1.1 睡眠相关

| 常量名 | 文件路径 | 内容 |
|---|---|---|
| `SLEEP_PERIOD_LABELS` | `src/lib/constants.ts` | night: 夜觉, morning_nap: 上午觉, afternoon_nap: 下午觉, other: 其他 |
| `SLEEP_QUALITY_LABELS` | `src/lib/constants.ts` | good: 质量好, normal: 一般, poor: 较差 |

#### 2.1.2 尿布相关

| 常量名 | 文件路径 | 内容 |
|---|---|---|
| `DIAPER_TYPE_LABELS` | `src/lib/constants.ts` | wet: 小便, dirty: 大便, mixed: 混合, dry: 干净 |
| `POOP_TYPE_LABELS` | `src/lib/constants.ts` | normal: 正常, normal_soft: 正常软便, normal_form: 正常成形, loose: 稀便, watery: 水样便, hard: 干硬粒, bloody: 血丝便 |

#### 2.1.3 活动相关

| 常量名 | 文件路径 | 内容 |
|---|---|---|
| `ACTIVITY_TYPE_LABELS` | `src/lib/constants.ts` | gross_motor: 大运动练习, fine_motor: 精细运动练习, edu_play: 亲子早教互动, outdoor: 户外活动, daily_care: 日常护理, other: 其他活动 |
| `ACTIVITY_INTENSITY_LABELS` | `src/lib/constants.ts` | easy: 轻松, medium: 适中, active: 活跃 |

#### 2.1.4 情绪/精神相关

| 常量名 | 文件路径 | 内容 |
|---|---|---|
| `MOOD_LABELS` | `src/lib/constants.ts` | happy: 愉悦满足, neutral: 平静舒适, fussy: 烦躁不开心, crying: 痛苦哭闹 |
| `SPIRIT_LABELS` | `src/lib/constants.ts` | active/normal: 状态良好, tired: 烦躁不安, lethargic: 萎靡嗜睡 |

#### 2.1.5 医疗相关

| 常量名 | 文件路径 | 内容 |
|---|---|---|
| `VISIT_TYPE_LABELS` | `src/lib/constants.ts` | checkup: 常规体检, allergy: 过敏专科, sick: 生病就诊, vaccine: 疫苗接种, blood: 血液检查, other: 就诊 |

#### 2.1.6 过敏相关

| 常量名 | 文件路径 | 内容 |
|---|---|---|
| `ALLERGY_TYPE_LABELS` | `src/lib/constants.ts` | milk: 牛奶蛋白, egg: 鸡蛋, wheat: 小麦/麸质, peanut: 花生, tree_nut: 坚果, soy: 大豆, fish: 鱼类, shellfish: 贝类, other: 其他 |
| `ALLERGY_LEVEL_LABELS` | `src/lib/constants.ts` | mild: 轻度, moderate: 中度, severe: 重度, unknown: 未知程度 |

#### 2.1.7 记录类型配置

| 常量名 | 文件路径 | 内容 |
|---|---|---|
| `RECORD_TYPE_CFG` | `src/lib/constants.ts` | 各记录类型的 label / bg / color，共 13 种类型 |
| `ROLE_TEXT` | `src/lib/constants.ts` | 1: 创建者, 2: 成员 |

---

### 2.2 业务常量（数字范围 / 阈值）

| 配置项 | 文件路径 | 值 | 说明 |
|---|---|---|---|
| `formula_ml` 范围 | `src/api/types.ts` | 0 ~ 500 | 配方奶喂养量（毫升） |
| `duration_min` 范围 | `src/api/types.ts` | 0 ~ 120 | 母乳时长（分钟） |
| `amount_g` 范围 | `src/api/types.ts` | 0 ~ 500 | 辅食克数 |
| 勺数范围 | `FormulaSection.tsx` | 0 ~ 20 | 奶粉勺数 |
| `height_mm` 范围 | `src/api/types.ts` | 300 ~ 1500 | 身高（毫米，即 30~150cm） |
| `weight_g` 范围 | `src/api/types.ts` | 500 ~ 30000 | 体重（克，即 0.5~30kg） |
| `head_mm` 范围 | `src/api/types.ts` | 250 ~ 600 | 头围（毫米，即 25~60cm） |
| `diaper_count` 范围 | `src/api/types.ts` | 0 ~ 20 | 今日换尿布次数 |
| `temperature` 范围 | `src/api/types.ts` | 35.0 ~ 42.0 | 体温（℃） |
| 发热阈值 | `RecordContent.tsx` | 37.5 | >= 37.5℃ 判定为发热 |
| `AMOUNT_CHIPS` | `feeding/types.ts` | [60, 90, 120, 150, 180] | 奶量快捷选项（ml） |

---

### 2.3 选项列表（Select Options / Radio Choices）

#### 2.3.1 喂养相关

| 常量名 | 文件路径 | 内容 |
|---|---|---|
| `SIDE_OPTIONS` | `BreastSection.tsx` | left: 左侧, right: 右侧, both: 双侧 |
| `milkTypeOptions` | `feeding/types.ts` | aa: 氨基酸奶粉, eh_no_lactose: 深度水解（无乳糖）, eh_lactose: 深度水解（含乳糖）, ph: 适度水解奶粉, std: 普通奶粉 |
| `suppItems` | `feeding/types.ts` | 营养素列表（vitD/iron/calcium/dha/vitAD/zinc/probiotic/vitC），含 label/unit/hint/group |
| `FRAC_PARTS` | `scoopUtils.ts` | 分数部分枚举：0, 1/4, 1/3, 1/2, 2/3, 3/4 |

#### 2.3.2 尿布相关

| 常量名 | 文件路径 | 内容（含颜色配置） |
|---|---|---|
| `CARD_OPTIONS` | `DiaperTypeSection.tsx` | wet: 嘘嘘, dirty: 臭臭, mixed: 臭臭＋嘘嘘（含颜色） |
| `POOP_ITEMS` | `PoopSection.tsx` | normal/loose/watery/hard/bloody |
| `COLOR_CHIPS` | `PoopSection.tsx` | yellow: 黄色, brown_yellow: 棕黄, green: 绿色 |
| `BUTT_ITEMS` | `ButtConditionSection.tsx` | normal/slightly_red/rash/severe_rash/fungal/other（含颜色配置） |

#### 2.3.3 睡眠相关

| 常量名 | 文件路径 | 内容（含颜色配置） |
|---|---|---|
| `QUALITY_OPTIONS` | `QualitySection.tsx` | good: 良好, normal: 一般, poor: 较差（含图标和颜色） |

#### 2.3.4 活动相关

| 常量名 | 文件路径 | 内容（含颜色配置） |
|---|---|---|
| `ACTIVITY_OPTIONS` | `ActivityTypeSection.tsx` | gross_motor/fine_motor/edu_play/outdoor/daily_care/other（含图标、颜色、副标题） |
| `INTENSITY_OPTIONS` | `IntensitySection.tsx` | easy: 轻松, medium: 适中, active: 活跃（含图标和颜色） |

#### 2.3.5 症状相关

| 常量名 | 文件路径 | 内容（含描述和徽章） |
|---|---|---|
| `SPIRIT_OPTIONS` | `SpiritSection.tsx` | good/fussy/lethargic（含详细描述和徽章样式） |
| `MOOD_OPTIONS` | `MoodSection.tsx` | happy/neutral/fussy/crying（含详细描述和徽章样式） |

#### 2.3.6 医疗相关

| 常量名 | 文件路径 | 内容 |
|---|---|---|
| `VISIT_TYPE_OPTIONS` | `VisitTypeSection.tsx` | checkup: 儿保检查, allergy: 过敏原检测, sick: 就诊记录, vaccine: 疫苗接种, blood: 血液检查, other: 其他检查 |

#### 2.3.7 生长相关

| 常量名 | 文件路径 | 内容 |
|---|---|---|
| `ORG_OPTIONS` | `growth/index.tsx` | ['儿保门诊', '家中自测', '社区卫生', '其他'] |

#### 2.3.8 过敏相关

| 常量名 | 文件路径 | 内容 |
|---|---|---|
| `ALLERGY_LEVEL_OPTIONS` | `src/lib/constants.ts` | mild/moderate/severe/unknown（含激活颜色） |

---

### 2.4 状态映射字典（渲染层）

| 常量名 | 文件路径 | 说明 |
|---|---|---|
| `ICON_MAP` | `RecordTypeIcon.tsx` | 记录类型 → SVG 图标组件映射 |
| `MOOD_ICON_MAP` | `RecordContent.tsx` | 心情枚举 → 图标映射 |
| `ACTIVITY_ICON_MAP` | `RecordContent.tsx` | 活动类型 → 图标映射 |
| `MILK_TYPE_SHORT` | `RecordContent.tsx` | 奶粉 key → 短名称（列表展示用） |
| `MILK_TYPE_LABELS` | `RecordContent.tsx` | 奶粉 key → 完整标签 |
| `MILK_TYPE_PILL_COLORS` | `RecordContent.tsx` | 奶粉 key → Pill 颜色配置 |
| `QUALITY_PILL` | `RecordContent.tsx` | sleep quality → 颜色/背景配置 |
| `DIAPER_CARD_LABELS` | `RecordContent.tsx` | 尿布类型 → 展示标签（与 DIAPER_TYPE_LABELS 重叠） |

---

### 2.5 路由与导航配置

| 常量名 | 文件路径 | 内容 |
|---|---|---|
| `RECORD_ROUTES` | `src/lib/constants.ts` | 记录类型 → 表单页面路由映射（13 种） |
| `QUICK_ACTION_A_KEYS` | `src/lib/constants.ts` | A 区大卡片（3 列）：formula, breast, food |
| `QUICK_ACTION_B_KEYS` | `src/lib/constants.ts` | B 区小格子（4 列）：diaper, sleep, temperature, symptom |
| `FAB_GROUPS` | `src/lib/constants.ts` | FAB 弹层分组（日常补录 / 健康档案） |
| `GLOBAL_FAB_GROUPS` | `src/lib/constants.ts` | 全局完整版分组（4 组共 11 项） |
| `ALL_QUICK_ACTION_KEYS` | `src/lib/constants.ts` | 全部可选快捷入口（11 项） |
| `DEFAULT_QUICKACTION_KEYS_BY_AGE` | `src/lib/constants.ts` | 按月龄默认快捷入口（0-5m / 6-11m / 12m+） |
| `FAB_SUBTITLES` | `src/lib/constants.ts` | 各记录类型的副标题描述 |

---

### 2.6 设计系统颜色（C 类，保留前端）

| 常量名 | 文件路径 | 值 |
|---|---|---|
| `BRAND_GRADIENT` | `src/lib/constants.ts` | `linear-gradient(90deg, #F87098, #F9A8C0)` |
| `BRAND_COLOR` | `src/lib/constants.ts` | `#F87098` |
| `BRAND_LIGHT_BG` | `src/lib/constants.ts` | `#FFF0F4` |
| `ROLE_AVATAR_STYLE` | `src/lib/constants.ts` | 角色 → 头像背景渐变/颜色 |
| `ROLE_BADGE_STYLE` | `src/lib/constants.ts` | 角色 → 徽章背景/前景色 |
| `ROLE_ICON_COLOR` | `src/lib/constants.ts` | 角色 → 头像图标 stroke 颜色 |

---

### 2.7 报告时间范围

| 常量名 | 文件路径 | 内容 |
|---|---|---|
| `REPORT_RANGE_OPTIONS` | `src/lib/constants.ts` | 7天 / 14天 / 30天 / 自定义 |

---

## 三、后端现有枚举与映射清单

### 3.1 枚举定义汇总

| 模块 | 文件 | 枚举名 | 值 | 存储方式 |
|---|---|---|---|---|
| 喂养 | `records/feeding/dto/create-feeding.dto.ts` | `FeedType` | BREAST / FORMULA / COMPLEMENTARY | TINYINT：1=breast, 2=formula, 3=complementary |
| 喂养 | 同上 | `BreastSide` | LEFT / RIGHT / BOTH | TINYINT：1=left, 2=right, 3=both |
| 尿布 | `records/diaper/dto/create-diaper.dto.ts` | `DiaperType` | WET / DIRTY / MIXED | TINYINT：1=wet, 2=dirty, 3=mixed |
| 尿布 | 同上 | `PoopType` | NORMAL / LOOSE / WATERY / HARD / BLOODY | VARCHAR(30) 直接存字符串 |
| 尿布 | 同上 | `ButtCondition` | NORMAL / SLIGHTLY_RED / RASH / SEVERE_RASH / FUNGAL / OTHER | VARCHAR(30) 直接存字符串 |
| 睡眠 | `records/sleep/dto/create-sleep.dto.ts` | `SleepQuality` | GOOD / NORMAL / POOR | VARCHAR(10) 直接存字符串 |
| 睡眠 | 同上 | `SleepPeriod` | NIGHT / MORNING_NAP / AFTERNOON_NAP / OTHER | VARCHAR(20) 直接存字符串 |
| 活动 | `records/activity/dto/create-activity.dto.ts` | `ActivityType` | GROSS_MOTOR / FINE_MOTOR / EDU_PLAY / OUTDOOR / DAILY_CARE / OTHER | VARCHAR(20) 直接存字符串 |
| 活动 | 同上 | `ActivityIntensity` | EASY / MEDIUM / ACTIVE | VARCHAR(10) 直接存字符串 |
| 健康 | `records/health/dto/create-health.dto.ts` | `Mood` | HAPPY / NEUTRAL / FUSSY / CRYING | TINYINT：1~4 |
| 健康 | 同上 | `AllergySeverity` | MILD / MODERATE / SEVERE | VARCHAR 直接存字符串 |
| 医疗 | `records/medical/dto/create-medical.dto.ts` | `VisitType` | CHECKUP / ALLERGY / SICK / VACCINE / BLOOD / OTHER | VARCHAR(20) 直接存字符串 |
| 症状 | `records/symptom/dto/create-symptom.dto.ts` | `SpiritLevel` | ACTIVE / NORMAL / TIRED / LETHARGIC | VARCHAR(20) 直接存字符串 |
| 症状 | 同上 | `MoodLevel` | HAPPY / NEUTRAL / FUSSY / CRYING | VARCHAR(20) 直接存字符串 |
| 宝宝 | `baby/dto/create-baby.dto.ts` | `BabyGender` | MALE / FEMALE / UNKNOWN | TINYINT：0=unknown, 1=male, 2=female |
| 家庭 | `common/decorators/min-role.decorator.ts` | `FamilyRole` | OWNER=1 / MEMBER=2 | TINYINT |

### 3.2 整数映射常量（入库/出库转换）

**字符串 → TINYINT（入库）**

| 常量名 | 文件 | 映射 |
|---|---|---|
| `FEED_TYPE_TO_INT` | `create-feeding.dto.ts` | `{breast:1, formula:2, complementary:3}` |
| `BREAST_SIDE_TO_INT` | `create-feeding.dto.ts` | `{left:1, right:2, both:3}` |
| `DIAPER_TYPE_TO_INT` | `create-diaper.dto.ts` | `{wet:1, dirty:2, mixed:3}` |
| `MOOD_TO_INT` | `create-health.dto.ts` | `{happy:1, neutral:2, fussy:3, crying:4}` |
| `GENDER_TO_INT` | `baby.service.ts` | `{unknown:0, male:1, female:2}` |

**TINYINT → 字符串（出库）**

| 常量名 | 文件 | 映射 |
|---|---|---|
| `INT_TO_FEED_TYPE` | `create-feeding.dto.ts` | `{1:'breast', 2:'formula', 3:'complementary'}` |
| `INT_TO_BREAST_SIDE` | `create-feeding.dto.ts` | `{1:'left', 2:'right', 3:'both'}` |
| `INT_TO_DIAPER_TYPE` | `create-diaper.dto.ts` | `{1:'wet', 2:'dirty', 3:'mixed'}` |
| `INT_TO_MOOD` | `create-health.dto.ts` | `{1:'happy', 2:'neutral', 3:'fussy', 4:'crying'}` |
| `GENDER_TO_STR` | `baby.service.ts` | `{0:'unknown', 1:'male', 2:'female'}` |

### 3.3 过敏原配置（后端常量，未下发）

```typescript
// src/baby/dto/create-baby.dto.ts
export const ALLERGY_TYPES = [
  'milk', 'egg', 'wheat', 'peanut', 'tree_nut', 'soy', 'fish', 'shellfish', 'other'
] as const;

export const ALLERGY_LEVELS = ['mild', 'moderate', 'severe', 'unknown'] as const;
```

### 3.4 已有公开接口

| 接口 | 鉴权 | 返回内容 |
|---|---|---|
| `GET /api/baby-foods` | 无需 | `{ items: BabyFood[], categories: [{key, label}] }` |

---

## 四、配置分类决策

### 4.1 A 类：必须下发（与数据校验/存储耦合，两端必须完全一致）

| 配置项 | 当前前端位置 | 当前后端位置 | 风险 |
|---|---|---|---|
| 枚举合法值集合（如 PoopType） | PoopSection.tsx | DTO enum | 前端传非法值后端报 400 |
| 整数映射规则（FeedType: 1=breast...） | api/types.ts 注释 | DTO 常量 | 新增类型时两端需精准对齐 |
| 业务数值范围（formula_ml: 0-500） | api/types.ts JSDoc | DTO @Max(500) | 前端通过校验、被后端拒绝 |
| 所有枚举 value 列表 | constants.ts / 各 Section | DTO enum | 增删枚举值时漏改一处即 bug |

### 4.2 B 类：建议下发（与业务规则关联，变更频率高）

| 配置项 | 当前位置 | 下发价值 |
|---|---|---|
| 所有 XXXX_LABELS（中文标签） | constants.ts | 文案调整无需前端发版 |
| 营养素配置 suppItems（含 hint/group） | feeding/types.ts | 新增营养素品类无需前端发版 |
| 奶粉类型选项 milkTypeOptions | feeding/types.ts | 奶粉类型增减无需前端发版 |
| 按月龄默认快捷入口 DEFAULT_QUICKACTION_KEYS_BY_AGE | constants.ts | 育儿建议调整无需前端发版 |
| 发热阈值 37.5 | RecordContent.tsx 硬编码 | 业务规则变更可动态下发 |
| 过敏原类型列表 ALLERGY_TYPES | constants.ts / baby dto | 新增过敏原类型无需发版 |

### 4.3 C 类：保留前端（纯 UI 渲染配置，与业务逻辑无关）

| 配置项 | 理由 |
|---|---|
| `BRAND_COLOR`、`BRAND_GRADIENT`、`BRAND_LIGHT_BG` | 纯设计系统，不影响数据 |
| `ROLE_AVATAR_STYLE`、`ROLE_BADGE_STYLE`、`ROLE_ICON_COLOR` | 纯视觉渲染 |
| `QUICK_ACTION_A_KEYS`、`FAB_GROUPS`、`RECORD_ROUTES` | 导航布局，后端无感知 |
| `SCOOP_STEP_FRACS`、`FRAC_SYMBOL`、`AMOUNT_CHIPS` | 纯 UI 交互工具 |
| `ICON_MAP`、`MOOD_ICON_MAP`、`ACTIVITY_ICON_MAP` | SVG 图标映射，纯渲染 |
| `MILK_TYPE_PILL_COLORS`、`QUALITY_PILL` | 颜色样式配置 |

---

## 五、方案设计：统一配置接口

### 5.1 接口规范

```
GET /api/config
鉴权：无需（Public）
缓存：Cache-Control: public, max-age=3600
ETag：基于配置版本号生成
```

### 5.2 响应体结构（TypeScript 类型定义）

```typescript
// ---- 通用枚举项 ----
interface EnumOption {
  value: string      // 存储值（存入 DB 的字符串）
  label: string      // 中文显示标签
  int?: number       // TINYINT 映射值（仅 TINYINT 类型枚举有此字段）
}

// ---- 数值范围 ----
interface NumRange {
  min: number
  max: number
}

// ---- 营养素配置项 ----
interface SuppItem {
  key:   string      // 存储 key（如 'vitD'）
  label: string      // 中文名（如 '维生素D'）
  unit:  string      // 单位（如 'IU'）
  hint:  string      // 输入提示（如 '通常 400IU/天'）
  group: string      // 分组（如 '维生素'）
}

// ---- 奶粉类型 ----
interface MilkTypeOption {
  value: string      // 存储 key（如 'aa'）
  label: string      // 完整标签（如 '氨基酸奶粉'）
  short: string      // 短标签，用于列表展示（如 '氨基酸'）
}

// ---- 过敏原 ----
interface AllergyTypeOption {
  value: string      // 存储 key（如 'milk'）
  label: string      // 中文名（如 '牛奶蛋白'）
}

// ---- 按月龄默认快捷入口 ----
interface QuickActionDefaults {
  '0-5':   string[]  // 0~5 个月默认快捷入口 key 列表
  '6-11':  string[]  // 6~11 个月
  '12+':   string[]  // 12 个月及以上
}

// ---- 完整响应体 ----
interface AppConfigResponse {
  version: string    // 配置版本号（用于前端缓存失效判断，如 "2026-04-13.1"）

  enums: {
    // 喂养
    feedType:          EnumOption[]   // breast/formula/complementary
    breastSide:        EnumOption[]   // left/right/both
    milkType:          MilkTypeOption[]

    // 尿布
    diaperType:        EnumOption[]   // wet/dirty/mixed
    poopType:          EnumOption[]   // normal/loose/watery/hard/bloody
    poopColor:         EnumOption[]   // yellow/brown_yellow/green
    buttCondition:     EnumOption[]   // normal/slightly_red/rash/severe_rash/fungal/other

    // 睡眠
    sleepQuality:      EnumOption[]   // good/normal/poor
    sleepPeriod:       EnumOption[]   // night/morning_nap/afternoon_nap/other

    // 活动
    activityType:      EnumOption[]   // gross_motor/fine_motor/edu_play/outdoor/daily_care/other
    activityIntensity: EnumOption[]   // easy/medium/active

    // 情绪/精神
    mood:              EnumOption[]   // happy/neutral/fussy/crying
    spiritLevel:       EnumOption[]   // active/normal/tired/lethargic

    // 医疗
    visitType:         EnumOption[]   // checkup/allergy/sick/vaccine/blood/other

    // 过敏
    allergyType:       AllergyTypeOption[]
    allergyLevel:      EnumOption[]   // mild/moderate/severe/unknown

    // 宝宝
    babyGender:        EnumOption[]   // male/female/unknown
  }

  limits: {
    formulaMl:        NumRange        // { min: 0, max: 500 }
    breastDurationMin: NumRange       // { min: 1, max: 120 }
    foodAmountG:      NumRange        // { min: 0, max: 500 }
    scoopCount:       NumRange        // { min: 0, max: 20 }
    heightMm:         NumRange        // { min: 300, max: 1500 }
    weightG:          NumRange        // { min: 500, max: 30000 }
    headMm:           NumRange        // { min: 250, max: 600 }
    diaperCount:      NumRange        // { min: 0, max: 20 }
    temperature:      NumRange        // { min: 35.0, max: 42.0 }
    feverThreshold:   number          // 37.5
  }

  supplements: SuppItem[]             // 营养素配置列表

  quickActionDefaults: QuickActionDefaults
}
```

### 5.3 示例响应

```json
{
  "version": "2026-04-13.1",
  "enums": {
    "feedType": [
      { "value": "breast",        "label": "母乳",   "int": 1 },
      { "value": "formula",       "label": "配方奶", "int": 2 },
      { "value": "complementary", "label": "辅食",   "int": 3 }
    ],
    "diaperType": [
      { "value": "wet",   "label": "嘘嘘", "int": 1 },
      { "value": "dirty", "label": "臭臭", "int": 2 },
      { "value": "mixed", "label": "臭臭＋嘘嘘", "int": 3 }
    ],
    "sleepPeriod": [
      { "value": "night",         "label": "夜觉" },
      { "value": "morning_nap",   "label": "上午觉" },
      { "value": "afternoon_nap", "label": "下午觉" },
      { "value": "other",         "label": "其他" }
    ]
  },
  "limits": {
    "formulaMl":       { "min": 0,   "max": 500  },
    "temperature":     { "min": 35.0, "max": 42.0 },
    "feverThreshold":  37.5
  },
  "supplements": [
    { "key": "vitD", "label": "维生素D", "unit": "IU", "hint": "通常 400IU/天", "group": "维生素" }
  ],
  "quickActionDefaults": {
    "0-5":  ["formula", "breast", "diaper", "sleep", "temperature", "symptom"],
    "6-11": ["food", "formula", "breast", "diaper", "sleep", "temperature"],
    "12+":  ["food", "formula", "diaper", "sleep", "activity", "growth"]
  }
}
```

---

## 六、后端实现指南

### 6.1 目录结构

```
minicare-server/src/
  app-config/                     ← 新建模块
    app-config.module.ts
    app-config.controller.ts      ← GET /api/config
    app-config.data.ts            ← 所有配置常量定义（权威数据源）
    dto/
      app-config-response.dto.ts  ← 响应体 TS 类型定义
```

> **注意**：`app-config.data.ts` 是所有枚举值的权威数据源，后端 DTO 中现有的 enum 和映射常量（如 `FEED_TYPE_TO_INT`）需重构为从 `app-config.data.ts` 导入，保证单点定义。

### 6.2 Controller 骨架

```typescript
// src/app-config/app-config.controller.ts
import { Controller, Get } from '@nestjs/common'
import { AppConfigData } from './app-config.data'

@Controller('config')
export class AppConfigController {

  @Get()
  // 无需 @UseGuards(JwtGuard)，Public 接口
  getConfig() {
    return AppConfigData.build()
  }
}
```

### 6.3 数据文件骨架（app-config.data.ts）

```typescript
// src/app-config/app-config.data.ts
// 权威数据源：所有枚举值和业务常量在此定义，后端 DTO 中的 enum 引用此处

export const CONFIG_VERSION = '2026-04-13.1'  // 修改配置时同步更新

// ---- 喂养 ----
export const FEED_TYPE_OPTIONS = [
  { value: 'breast',        label: '母乳',   int: 1 },
  { value: 'formula',       label: '配方奶', int: 2 },
  { value: 'complementary', label: '辅食',   int: 3 },
]

export const BREAST_SIDE_OPTIONS = [
  { value: 'left',  label: '左侧', int: 1 },
  { value: 'right', label: '右侧', int: 2 },
  { value: 'both',  label: '双侧', int: 3 },
]

export const MILK_TYPE_OPTIONS = [
  { value: 'aa',            label: '氨基酸奶粉',          short: '氨基酸' },
  { value: 'eh_no_lactose', label: '深度水解（无乳糖）',   short: '深度水解' },
  { value: 'eh_lactose',    label: '深度水解（含乳糖）',   short: '深度水解' },
  { value: 'ph',            label: '适度水解奶粉',          short: '适度水解' },
  { value: 'std',           label: '普通奶粉',              short: '普通' },
]

// ---- 尿布 ----
export const DIAPER_TYPE_OPTIONS = [
  { value: 'wet',   label: '嘘嘘',      int: 1 },
  { value: 'dirty', label: '臭臭',      int: 2 },
  { value: 'mixed', label: '臭臭＋嘘嘘', int: 3 },
]

export const POOP_TYPE_OPTIONS = [
  { value: 'normal',      label: '正常软便' },
  { value: 'loose',       label: '稀便' },
  { value: 'watery',      label: '水样便' },
  { value: 'hard',        label: '干硬粒' },
  { value: 'bloody',      label: '血丝便' },
]

export const POOP_COLOR_OPTIONS = [
  { value: 'yellow',       label: '黄色' },
  { value: 'brown_yellow', label: '棕黄' },
  { value: 'green',        label: '绿色' },
]

export const BUTT_CONDITION_OPTIONS = [
  { value: 'normal',       label: '正常' },
  { value: 'slightly_red', label: '轻微发红' },
  { value: 'rash',         label: '尿布疹' },
  { value: 'severe_rash',  label: '严重尿布疹' },
  { value: 'fungal',       label: '真菌感染' },
  { value: 'other',        label: '其他' },
]

// ---- 睡眠 ----
export const SLEEP_QUALITY_OPTIONS = [
  { value: 'good',   label: '质量好' },
  { value: 'normal', label: '一般' },
  { value: 'poor',   label: '较差' },
]

export const SLEEP_PERIOD_OPTIONS = [
  { value: 'night',         label: '夜觉' },
  { value: 'morning_nap',   label: '上午觉' },
  { value: 'afternoon_nap', label: '下午觉' },
  { value: 'other',         label: '其他' },
]

// ---- 活动 ----
export const ACTIVITY_TYPE_OPTIONS = [
  { value: 'gross_motor', label: '大运动练习' },
  { value: 'fine_motor',  label: '精细运动练习' },
  { value: 'edu_play',    label: '亲子早教互动' },
  { value: 'outdoor',     label: '户外活动' },
  { value: 'daily_care',  label: '日常护理' },
  { value: 'other',       label: '其他活动' },
]

export const ACTIVITY_INTENSITY_OPTIONS = [
  { value: 'easy',   label: '轻松' },
  { value: 'medium', label: '适中' },
  { value: 'active', label: '活跃' },
]

// ---- 情绪/精神 ----
export const MOOD_OPTIONS = [
  { value: 'happy',   label: '愉悦满足', int: 1 },
  { value: 'neutral', label: '平静舒适', int: 2 },
  { value: 'fussy',   label: '烦躁不开心', int: 3 },
  { value: 'crying',  label: '痛苦哭闹', int: 4 },
]

export const SPIRIT_LEVEL_OPTIONS = [
  { value: 'active',    label: '状态良好' },
  { value: 'normal',    label: '状态良好' },
  { value: 'tired',     label: '烦躁不安' },
  { value: 'lethargic', label: '萎靡嗜睡' },
]

// ---- 医疗 ----
export const VISIT_TYPE_OPTIONS = [
  { value: 'checkup', label: '儿保检查' },
  { value: 'allergy', label: '过敏原检测' },
  { value: 'sick',    label: '就诊记录' },
  { value: 'vaccine', label: '疫苗接种' },
  { value: 'blood',   label: '血液检查' },
  { value: 'other',   label: '其他检查' },
]

// ---- 过敏 ----
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
]

export const ALLERGY_LEVEL_OPTIONS = [
  { value: 'mild',     label: '轻度' },
  { value: 'moderate', label: '中度' },
  { value: 'severe',   label: '重度' },
  { value: 'unknown',  label: '未知程度' },
]

// ---- 宝宝 ----
export const BABY_GENDER_OPTIONS = [
  { value: 'male',    label: '男宝', int: 1 },
  { value: 'female',  label: '女宝', int: 2 },
  { value: 'unknown', label: '未知', int: 0 },
]

// ---- 营养素 ----
export const SUPPLEMENT_ITEMS = [
  { key: 'vitD',      label: '维生素D',   unit: 'IU',  hint: '通常 400IU/天',        group: '维生素' },
  { key: 'iron',      label: '铁剂',      unit: 'mg',  hint: '通常 1mg/kg/天',        group: '矿物质' },
  { key: 'calcium',   label: '钙剂',      unit: 'mg',  hint: '按医嘱',                group: '矿物质' },
  { key: 'dha',       label: 'DHA',       unit: 'mg',  hint: '通常 100mg/天',          group: '脂肪酸' },
  { key: 'vitAD',     label: '维生素AD',  unit: 'IU',  hint: '维生素A+D 复合制剂',    group: '维生素' },
  { key: 'zinc',      label: '锌剂',      unit: 'mg',  hint: '按医嘱',                group: '矿物质' },
  { key: 'probiotic', label: '益生菌',    unit: '次',  hint: '每天1次',               group: '其他' },
  { key: 'vitC',      label: '维生素C',   unit: 'mg',  hint: '按医嘱',                group: '维生素' },
]

// ---- 数值范围 ----
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
}

// ---- 按月龄默认快捷入口 ----
export const QUICK_ACTION_DEFAULTS = {
  '0-5':  ['formula', 'breast', 'diaper', 'sleep', 'temperature', 'symptom'],
  '6-11': ['food', 'formula', 'breast', 'diaper', 'sleep', 'temperature'],
  '12+':  ['food', 'formula', 'diaper', 'sleep', 'activity', 'growth'],
}

// ---- build 方法（组装完整响应） ----
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
    }
  }
}
```

### 6.4 注册到 AppModule

```typescript
// src/app.module.ts（在 imports 数组中新增）
import { AppConfigModule } from './app-config/app-config.module'

@Module({
  imports: [
    // ... 其他 module ...
    AppConfigModule,  // ← 新增
  ],
})
export class AppModule {}
```

---

## 七、前端消费层设计

### 7.1 API 文件

```typescript
// minicare-web/src/api/appConfig.ts
import { request } from '@/api/http'

export interface EnumOption {
  value: string
  label: string
  int?: number
}

export interface AppConfig {
  version: string
  enums: Record<string, EnumOption[]>
  limits: Record<string, { min: number; max: number } | number>
  supplements: Array<{ key: string; label: string; unit: string; hint: string; group: string }>
  quickActionDefaults: Record<string, string[]>
}

export async function fetchAppConfig(): Promise<AppConfig> {
  return request<AppConfig>('/api/config', { auth: false })
}
```

### 7.2 useAppConfig Hook（带本地缓存）

```typescript
// minicare-web/src/lib/useAppConfig.ts
import { useState, useEffect } from 'react'
import { fetchAppConfig, type AppConfig } from '@/api/appConfig'

const CACHE_KEY = 'minicare_app_config'

function loadCached(): AppConfig | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AppConfig
  } catch {
    return null
  }
}

function saveCache(config: AppConfig) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(config))
}

export function useAppConfig() {
  const [config, setConfig] = useState<AppConfig | null>(loadCached)
  const [loading, setLoading] = useState(!config)

  useEffect(() => {
    fetchAppConfig().then(fresh => {
      // 版本变化或无缓存时更新
      if (!config || config.version !== fresh.version) {
        saveCache(fresh)
        setConfig(fresh)
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  // 工具方法：按 key 取枚举 label
  const getLabel = (enumKey: string, value: string): string => {
    const options = config?.enums[enumKey] ?? []
    return options.find(o => o.value === value)?.label ?? value
  }

  return { config, loading, getLabel }
}
```

### 7.3 在组件中使用

```tsx
// 替代原来的 SLEEP_PERIOD_LABELS[period]
import { useAppConfig } from '@/lib/useAppConfig'

function SleepRecord({ period }: { period: string }) {
  const { getLabel } = useAppConfig()
  return <span>{getLabel('sleepPeriod', period)}</span>
}
```

### 7.4 前端 constants.ts 清理计划

配置接口上线后，以下常量可逐步从 `src/lib/constants.ts` 移除：

| 待移除常量 | 替代方案 |
|---|---|
| `SLEEP_PERIOD_LABELS` | `getLabel('sleepPeriod', value)` |
| `SLEEP_QUALITY_LABELS` | `getLabel('sleepQuality', value)` |
| `DIAPER_TYPE_LABELS` | `getLabel('diaperType', value)` |
| `POOP_TYPE_LABELS` | `getLabel('poopType', value)` |
| `ACTIVITY_TYPE_LABELS` | `getLabel('activityType', value)` |
| `ACTIVITY_INTENSITY_LABELS` | `getLabel('activityIntensity', value)` |
| `MOOD_LABELS` | `getLabel('mood', value)` |
| `SPIRIT_LABELS` | `getLabel('spiritLevel', value)` |
| `VISIT_TYPE_LABELS` | `getLabel('visitType', value)` |
| `ALLERGY_TYPE_LABELS` | `getLabel('allergyType', value)` |
| `ALLERGY_LEVEL_LABELS` | `getLabel('allergyLevel', value)` |
| `DEFAULT_QUICKACTION_KEYS_BY_AGE` | `config.quickActionDefaults[ageGroup]` |

---

## 八、实施路线图

### Phase 1：后端建立权威数据源（P0）

1. 新建 `src/app-config/` 模块，编写 `app-config.data.ts`，将所有枚举值集中定义
2. 将现有各 DTO 中的 `enum` 和 `XX_TO_INT` / `INT_TO_XX` 常量改为从 `app-config.data.ts` 导入（消除重复定义）
3. 实现 `GET /api/config` 接口，无需鉴权
4. 注册到 `AppModule`

**验收标准**：`curl https://<host>/api/config` 返回完整配置 JSON，后端任意枚举值只需修改 `app-config.data.ts` 一处

### Phase 2：前端接入配置接口（P1）

1. 新增 `src/api/appConfig.ts`，实现 `fetchAppConfig()`
2. 实现 `useAppConfig` Hook，带 localStorage 缓存 + 版本校验
3. 在 `App.tsx` 初始化时预加载配置（非阻塞）
4. 逐步将 `XXXX_LABELS` 的使用替换为 `getLabel()` 调用
5. 将 `suppItems`、`milkTypeOptions` 替换为从 `config.supplements`、`config.enums.milkType` 读取

**验收标准**：后端修改某枚举 label，前端刷新页面后显示更新，无需前端发版

### Phase 3：清理前端冗余配置（P2，按需）

1. 删除 `constants.ts` 中所有已被接口替代的 `XXXX_LABELS` 常量
2. 删除 `feeding/types.ts` 中 `suppItems`、`milkTypeOptions`（已由接口下发）
3. 将 `RecordContent.tsx` 中的发热阈值硬编码替换为 `config.limits.feverThreshold`

**验收标准**：`constants.ts` 中不再存在任何 `XXXX_LABELS` 类型的枚举标签字典

---

## 九、风险与注意事项

| 风险 | 说明 | 缓解措施 |
|---|---|---|
| 配置接口请求失败 | 网络异常导致 config 未加载 | 前端保留 localStorage 缓存作为兜底；极端情况下前端写一份 fallback 默认值 |
| 配置版本不一致 | 前端缓存旧版，后端已更新 | 每次启动都发请求对比 version 字段，版本变化即刷新缓存 |
| Phase 2 过渡期两套数据源并存 | 旧代码读 constants.ts，新代码读接口 | 按模块逐步迁移，不要求一次全量替换 |
| 后端 DTO enum 与 data.ts 不一致 | 重构时遗漏某个 DTO | 添加单测验证 DTO enum values ⊆ data.ts options |
