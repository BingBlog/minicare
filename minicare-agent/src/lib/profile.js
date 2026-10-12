/**
 * 宝宝画像（lib/profile.js，F3 最小可用版）
 *
 * 定位：把「模型查不出来、必须跨表推断」的结论算好注入 systemPrompt，
 * 让助手开口即带真实前提（是否还在母乳、转奶走到哪一步、生长什么水平）。
 *
 * 覆盖 PROFILE-20260919 文档 §5 的实施阶段 1-3（A 基本情况 / B 配方与转奶 /
 * C 喂养方式 / E 生长分位 / I 数据新鲜度），约 5 条 SQL。
 * 排敏（D）、症状（F）、医疗（G）、矛盾检测（J）属 F6，本版不含。
 *
 * 三条硬约束：
 *   1) **单一真相源**：分位数一律复用 lib/growth.js 的 percentileOf()，不另写一套；
 *      月龄计算复用本模块导出的 ageInMonths()（analyze-baby-data 亦从此处引入）。
 *   2) **失败静默降级**：任一组查询失败 → 该组置空，其余组照常注入，画像缺失不影响对话。
 *   3) **"无记录" ≠ "数据陈旧"**：母乳 0 条是有效结论（已停），症状长期无记录是信息缺失
 *      （不可当"无症状"）——渲染时显式区分，这套区分直接决定模型该不该下结论。
 *
 * 缓存：进程内 Map + 5 分钟 TTL（家庭同宝宝的多轮对话共用），避免每轮多 5 次查询
 * 推高已优化到 4.3-6.8s 的时延。
 */
import { getDb } from './db.js'
import { percentileOf } from './growth.js'
import { getSignalConfig } from '../config-loader.js'

const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map() // babyId -> { at, profile }

/** 信号配置（2026-10-11 起新鲜度阈值 / 停母乳阈值 / 转奶参考天数由配置派生，TECH-029） */
const CFG = getSignalConfig()

/** CMPA 配方阶梯（高 → 低）；向上=升级（症状加重），向下=降级（耐受改善） */
export const LADDER_LEVEL = { aa: 4, eh_no_lactose: 3, eh_lactose: 3, ph: 2, std: 1 }
export const LADDER_LABEL = {
  aa: '氨基酸配方',
  eh_no_lactose: '深度水解（无乳糖）',
  eh_lactose: '深度水解（含乳糖）',
  ph: '适度水解',
  std: '普通配方',
}
const ALLERGEN_LABEL = {
  milk: '牛奶',
  egg: '鸡蛋',
  wheat: '小麦',
  soy: '大豆',
  peanut: '花生',
  nut: '坚果',
  fish: '鱼',
  shrimp: '虾',
  crab: '蟹',
  rice: '大米',
  corn: '玉米',
  oat: '燕麦',
  beef: '牛肉',
}
const LEVEL_LABEL = { mild: '轻度', moderate: '中度', severe: '重度' }

/** 数据源中文名（新鲜度渲染用）——唯一出处：perception.js 与干跑脚本均从本文件复用 */
export const FRESHNESS_LABEL = {
  formula: '配方奶',
  food: '辅食',
  supplement: '营养补充',
  medication: '服药',
  growth: '生长测量',
  symptom: '症状',
  medical: '就医记录',
  diary: '日记',
}
/** 超过这些天数视为"陈旧"（月龄尺度不同，阈值分档）——由配置派生（signals.yaml staleXxxDays） */
const STALE_DAYS = CFG.thresholds.staleDays
/**
 * 分位档序列（从低到高）——**必须与 `growth.js::bucket()` 的返回值集合逐字一致**。
 * bucket 只返回区间档（'低于P3' / 'P3-P15' / 'P15-P50' / 'P50-P85' / 'P85-P97' / '高于P97'），
 * 从不返回 'P50' 这类单点标签；拿单点标签做 `indexOf` 会恒为 -1，导致趋势判定永远「平稳」。
 * 改 bucket 的档位命名时，这里必须同步改（verify-profile.mjs 有对应断言）。
 */
export const P_BANDS = ['低于P3', 'P3-P15', 'P15-P50', 'P50-P85', 'P85-P97', '高于P97']
/**
 * 判定"已停母乳"的间隔阈值（天）。
 * 依据：母乳喂养若连续 14 天无任何记录，视为已停（与 STALE_DAYS.symptom 同尺度）。
 * 注意必须用「最近一次母乳距今」判定，**不能**用 30 天累计条数——后者是滞后指标：
 * 09-03 停母乳的宝宝，到 09-19 仍有 5 条落在 30 天窗口内，按条数会误判成"仍在混合喂养"。
 */
const WEANED_DAYS = CFG.thresholds.weanedDays

// ── 日期工具（一律以北京时间 UTC+8 为准）──────────────────────────────

/** 北京时间当天 YYYY-MM-DD（不能用 toISOString：UTC 在 00:00-08:00 会差一天） */
export function cstToday() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

/** 日期加减（纯日期运算，与本地时区无关） */
export function addDays(dateStr, n) {
  const t = Date.parse(`${dateStr}T00:00:00Z`)
  if (Number.isNaN(t)) return dateStr
  return new Date(t + n * 86400000).toISOString().slice(0, 10)
}

/** 两个日期相差天数（b - a） */
export function dayDiff(a, b) {
  const ta = Date.parse(`${toDateStr(a)}T00:00:00Z`)
  const tb = Date.parse(`${toDateStr(b)}T00:00:00Z`)
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null
  return Math.round((tb - ta) / 86400000)
}

/** 把 DATE / DATETIME / Date 统一收敛为 YYYY-MM-DD（dateStrings 下多为字符串） */
export function toDateStr(value) {
  if (!value) return ''
  const s = String(value)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : ''
}

/**
 * 月龄（整月，默认按当前日期；传 atDate 可按测量日期计算）。
 * 与 analyze-baby-data 共用同一份实现，避免两处算法漂移。
 */
export function ageInMonths(birthDate, atDate = null) {
  const b = new Date(String(birthDate).slice(0, 10) + 'T00:00:00')
  const at = atDate
    ? atDate instanceof Date
      ? atDate
      : new Date(String(atDate).slice(0, 10) + 'T00:00:00')
    : new Date()
  let months = (at.getFullYear() - b.getFullYear()) * 12 + (at.getMonth() - b.getMonth())
  if (at.getDate() < b.getDate()) months -= 1
  return Math.max(0, months)
}

/** 月龄「X 个月 Y 天」精确表述（注入 prompt 用） */
function ageText(birthDate) {
  const today = cstToday()
  const months = ageInMonths(birthDate, today)
  const anchor = new Date(`${toDateStr(birthDate)}T00:00:00`)
  const at = new Date(`${addMonths(birthDate, months)}T00:00:00`)
  const days = Math.max(0, Math.round((new Date(`${today}T00:00:00`) - at) / 86400000))
  if (Number.isNaN(anchor.getTime())) return null
  return `${months} 个月 ${days} 天`
}

function addMonths(dateStr, n) {
  const d = new Date(`${toDateStr(dateStr)}T00:00:00`)
  if (Number.isNaN(d.getTime())) return dateStr
  const y = d.getFullYear()
  const m = d.getMonth() + n
  return `${new Date(y, m, d.getDate()).getFullYear()}-${String(new Date(y, m, d.getDate()).getMonth() + 1).padStart(2, '0')}-${String(new Date(y, m, d.getDate()).getDate()).padStart(2, '0')}`
}

/** JSON 列在 mysql2 下已解析为对象，兜底处理字符串形态 */
function asArray(v) {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v)
      return Array.isArray(p) ? p : []
    } catch {
      return []
    }
  }
  return []
}

const round2 = (n) => Math.round(n * 100) / 100

// ── 各组查询 ───────────────────────────────────────────────────────

async function queryBasic(db, babyId) {
  const [[row]] = await db.query(
    'SELECT name, gender, birth_date, allergy_types, allergy_level, birth_weight_g FROM baby_profile WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [babyId],
  )
  if (!row) return null
  return {
    name: row.name || null,
    gender: row.gender || 'unknown',
    birthDate: toDateStr(row.birth_date),
    ageText: row.birth_date ? ageText(row.birth_date) : null,
    allergyTypes: asArray(row.allergy_types),
    allergyLevel: row.allergy_level || 'unknown',
    birthWeightG: row.birth_weight_g != null ? Number(row.birth_weight_g) : null,
  }
}

/**
 * 配方与转奶进度（用户点名的核心信号）。
 * feeding_formula_mix 记录了每顿奶的奶粉类型 + 勺数，类型枚举本身即 CMPA 配方阶梯。
 */
async function queryFormula(db, babyId) {
  const [rows] = await db.query(
    `SELECT DATE(r.record_time) AS d, m.milk_type, ROUND(SUM(m.scoops), 2) AS scoops
       FROM feeding_formula_record r
       JOIN feeding_formula_mix m ON m.record_id = r.id
      WHERE r.baby_id = ? AND r.record_time >= DATE_SUB(CURDATE(), INTERVAL 60 DAY)
      GROUP BY d, m.milk_type
      ORDER BY d`,
    [babyId],
  )
  if (!rows.length) return null

  const byDay = new Map()
  for (const r of rows) {
    const d = toDateStr(r.d)
    if (!d) continue
    const day = byDay.get(d) || {}
    day[r.milk_type] = (day[r.milk_type] || 0) + Number(r.scoops || 0)
    byDay.set(d, day)
  }
  const days = [...byDay.keys()].sort()
  if (!days.length) return null

  const today = cstToday()
  /**
   * 构成签名 = 各类型的**占比**（整数百分比）。
   * 不能用绝对勺数：每顿奶量天然波动（今天 24 勺、明天 28 勺），
   * 用勺数做签名会把"构成没变"误判成"天天在变"，停滞天数永远归零。
   */
  const signature = (day) => {
    const total = Object.values(day).reduce((a, b) => a + b, 0)
    if (!(total > 0)) return ''
    return Object.entries(day)
      .map(([t, v]) => `${t}:${Math.round((v / total) * 100)}`)
      .sort()
      .join('|')
  }

  // 构成占比（勺数口径）取「近 7 天」；若近 7 天一条记录都没有（家长几天没记），
  // 退回最近 7 个**有记录**的日子 —— 配方类型是最稳定的信号，不该因短期空档整段消失，
  // 但必须在渲染时标注数据截至日期，避免把旧构成当成当前状态。
  const from7 = addDays(today, -6)
  const recent7 = days.filter((d) => d >= from7)
  const basis = recent7.length ? recent7 : days.slice(-7)
  const comp7 = {}
  let total7 = 0
  for (const d of basis) {
    for (const [t, v] of Object.entries(byDay.get(d))) {
      comp7[t] = (comp7[t] || 0) + v
      total7 += v
    }
  }
  const current = total7 > 0
    ? Object.entries(comp7)
        .map(([t, v]) => [t, round2(v / total7)])
        .sort((a, b) => b[1] - a[1])
    : []

  // 构成停滞天数：从今天往前找连续同一构成的最早一天
  const lastSig = signature(byDay.get(days[days.length - 1]))
  let runStart = days[days.length - 1]
  for (let i = days.length - 1; i >= 0; i--) {
    if (signature(byDay.get(days[i])) !== lastSig) break
    runStart = days[i]
  }
  const stalledDays = Math.max(0, dayDiff(runStart, today) ?? 0)
  // 构成从窗口最早一天起就没变过 → 真实天数可能更长，只能说「至少」
  const stalledAtLeast = runStart === days[0]

  const typeCount = current.length
  const dominant = typeCount ? current[0][0] : null
  const status =
    !dominant
      ? null
      : typeCount > 1
        ? stalledDays >= CFG.ref.stageStableDays
          ? 'stalled'
          : 'transitioning'
        : 'stable'

  // 阶梯方向（近 30 天主导类型的阶梯位变化）
  const from30 = addDays(today, -29)
  const recent = days.filter((d) => d >= from30)
  const levelOfDay = (d) => {
    const entries = Object.entries(byDay.get(d)).sort((a, b) => b[1] - a[1])
    return entries.length ? LADDER_LEVEL[entries[0][0]] ?? null : null
  }
  const levelFirst = recent.length ? levelOfDay(recent[0]) : null
  const levelLast = recent.length ? levelOfDay(recent[recent.length - 1]) : null
  const direction =
    levelFirst == null || levelLast == null
      ? null
      : levelLast > levelFirst
        ? 'escalated'
        : levelLast < levelFirst
          ? 'deescalated'
          : 'same'

  // 氨基酸是否已停用（生产真实场景："已停氨基酸 34 天"）
  const aaDays = days.filter((d) => (byDay.get(d).aa || 0) > 0)
  const aaLastAt = aaDays.length ? aaDays[aaDays.length - 1] : null
  const aaStoppedDays =
    aaLastAt && !(comp7.aa > 0) ? Math.max(0, dayDiff(aaLastAt, today) ?? 0) : null

  return {
    current, // [[type, ratio], ...] 按占比降序
    dominant,
    dominantLabel: dominant ? LADDER_LABEL[dominant] || dominant : null,
    ladderLevel: dominant ? LADDER_LEVEL[dominant] ?? null : null,
    status,
    stalledDays,
    stalledAtLeast,
    stableSince: runStart,
    direction,
    lactose:
      dominant === 'eh_lactose' ? '含乳糖' : dominant === 'eh_no_lactose' || dominant === 'aa' ? '无乳糖' : null,
    aaLastAt,
    aaStoppedDays,
    lastRecordAt: days[days.length - 1],
    staleDays: Math.max(0, dayDiff(days[days.length - 1], today) ?? 0),
    basisLabel: recent7.length ? '近 7 天' : `截至 ${basis[basis.length - 1]}`,
  }
}

/** 喂养方式（停母乳判定是用户点名的场景：已停母乳就不该再谈母乳喂养） */
async function queryFeeding(db, babyId) {
  const [[row]] = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM feeding_breast_record WHERE baby_id = ? AND record_time >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)) AS breast30,
       (SELECT MAX(record_time) FROM feeding_breast_record WHERE baby_id = ?) AS lastBreastAt,
       (SELECT COUNT(*) FROM feeding_formula_record
         WHERE baby_id = ? AND record_time >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)) AS formula14,
       (SELECT ROUND(AVG(t.ml)) FROM (
          SELECT DATE(record_time) AS d, SUM(formula_ml) AS ml
            FROM feeding_formula_record
           WHERE baby_id = ? AND record_time >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND formula_ml IS NOT NULL
           GROUP BY d) t) AS avgFormulaMl7,
       (SELECT COUNT(DISTINCT i.food_name)
          FROM feeding_food_record f JOIN feeding_food_item i ON i.record_id = f.id
         WHERE f.baby_id = ? AND f.record_time >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)) AS solidKinds30,
       (SELECT COUNT(DISTINCT DATE(record_time)) FROM feeding_supplement_record
         WHERE baby_id = ? AND record_time >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)) AS supplementDays30`,
    [babyId, babyId, babyId, babyId, babyId, babyId],
  )
  if (!row) return null
  const breast30 = Number(row.breast30 || 0)
  const formula14 = Number(row.formula14 || 0)
  const lastBreastAt = toDateStr(row.lastBreastAt)
  const sinceBreast = lastBreastAt ? dayDiff(lastBreastAt, cstToday()) : null
  // 判定规则（R2 修正）：以「最近一次母乳距今」为准，30 天条数仅作展示参考。
  //   - 从无记录 / 已连续 WEANED_DAYS 天无记录 → formula_only（已停母乳，有效结论）
  //   - 近 WEANED_DAYS 天内仍有母乳 + 同时有配方奶 → mixed
  //   - 近 WEANED_DAYS 天内仍有母乳但无配方奶 → breast_only
  //   - 其余（理论上不达）→ unknown，不下结论
  let mode
  if (sinceBreast === null || sinceBreast >= WEANED_DAYS) mode = 'formula_only'
  else if (formula14 > 0) mode = 'mixed'
  else mode = 'breast_only'
  return {
    mode,
    breastCount30: breast30,
    lastBreastAt: lastBreastAt || null,
    sinceBreastDays: sinceBreast,
    formulaRecords14: formula14,
    avgFormulaMl7: row.avgFormulaMl7 != null ? Number(row.avgFormulaMl7) : null,
    solidKinds30: Number(row.solidKinds30 || 0),
    supplementDays30: Number(row.supplementDays30 || 0),
  }
}

/** 生长分位与趋势（复用 growth.js，避免与 analyze_baby_data 出现两套结论） */
async function queryGrowth(db, babyId, basic) {
  if (!basic?.birthDate) return null
  const [rows] = await db.query(
    'SELECT record_date, weight_g, height_mm, head_mm FROM growth_record WHERE baby_id = ? ORDER BY record_date DESC LIMIT 3',
    [babyId],
  )
  if (!rows.length) return null
  const sex = basic.gender === 'female' ? 'female' : 'male'
  const measure = (row) => {
    const at = toDateStr(row.record_date)
    const months = ageInMonths(basic.birthDate, at)
    const out = {
      measuredAt: at,
      months,
      weightKg: null,
      heightCm: null,
      headCm: null,
      weightP: null,
      heightP: null,
      headP: null,
    }
    if (row.weight_g != null) {
      out.weightKg = Number(row.weight_g) / 1000
      out.weightP = percentileOf(months, sex, 'weight', out.weightKg).p
    }
    if (row.height_mm != null) {
      out.heightCm = Number(row.height_mm) / 10
      out.heightP = percentileOf(months, sex, 'height', out.heightCm).p
    }
    if (row.head_mm != null) {
      out.headCm = Number(row.head_mm) / 10
      out.headP = percentileOf(months, sex, 'head', out.headCm).p
    }
    return out
  }
  const latest = measure(rows[0])
  // 上一次**有效同类测量**（各指标列常缺测：头围只填过 8 次，不能要求同一行齐全）
  const prevWith = (key) => {
    for (const r of rows.slice(1)) {
      const m = measure(r)
      if (m[key] != null) return m
    }
    return null
  }
  const prevWeight = prevWith('weightKg')
  const prevHeight = prevWith('heightCm')
  const prevHead = prevWith('headCm')

  /** 增速：只给实测值（g/天、cm/月），不给"是否达标"结论 —— 缺月龄增速参考表，不编造 */
  const velocity = (() => {
    const out = {}
    const v = (cur, prev, curKey, prevKey, toUnit) => {
      if (cur[curKey] == null || !prev || prev[prevKey] == null) return null
      const days = dayDiff(prev.measuredAt, cur.measuredAt)
      if (!days || days <= 0) return null
      const dv = toUnit(cur[curKey] - prev[prevKey])
      return { perDay: round2(dv / days), perMonth: round2((dv / days) * 30.4), days, from: prev.measuredAt }
    }
    out.weightGPerDay = v(latest, prevWeight, 'weightKg', 'weightKg', (x) => x * 1000)
    out.heightCmPerMonth = v(latest, prevHeight, 'heightCm', 'heightCm', (x) => x)
    out.headCmPerMonth = v(latest, prevHead, 'headCm', 'headCm', (x) => x)
    return out.weightGPerDay || out.heightCmPerMonth ? out : null
  })()

  return {
    latest,
    previous: prevWeight,
    prevHeight,
    prevHead,
    velocity,
    staleDays: Math.max(0, dayDiff(latest.measuredAt, cstToday()) ?? 0),
  }
}

/**
 * 组 G 医疗与随访（PRD §4.3.4 组 G）。
 * 生产库停在 migration 019 → 无 vaccine 系 / checkup 系列，故疫苗进度**降级为计数**
 * （PRD §4.6.3 明确允许），并以 `degraded_partial` 标记，避免模型编造剂次。
 */
async function queryMedical(db, babyId) {
  // 先探 schema：degradedPartial 表达的是"本环境类型化字段是否可读"，
  // 与"有没有就医记录"无关 —— 无记录时也必须给出正确标记。
  let typed = false
  try {
    const { hasTypedMedical } = await import('./query.js')
    typed = await hasTypedMedical(db)
  } catch {
    typed = false
  }
  const [rows] = await db.query(
    `SELECT visit_type, visit_date, follow_up_date FROM medical_record
      WHERE baby_id = ? ORDER BY visit_date DESC`,
    [babyId],
  )
  if (!rows.length) {
    return {
      total: 0,
      byType: {},
      lastVisitAt: null,
      lastVisitType: null,
      lastCheckupAt: null,
      followUp: null,
      typed,
      degradedPartial: !typed,
    }
  }
  const byType = {}
  for (const r of rows) {
    const t = r.visit_type || 'other'
    byType[t] = (byType[t] || 0) + 1
  }
  const last = rows[0]
  const checkup = rows.find((r) => r.visit_type === 'checkup')
  const today = cstToday()
  const future = rows
    .map((r) => toDateStr(r.follow_up_date))
    .filter((d) => d && d >= today)
    .sort()[0]
  return {
    total: rows.length,
    byType,
    lastVisitAt: toDateStr(last.visit_date) || null,
    lastVisitType: last.visit_type || null,
    lastCheckupAt: checkup ? toDateStr(checkup.visit_date) || null : null,
    followUp: future || null,
    typed,
    // 020 未应用 → 疫苗只能给针数，剂次/名称/批次不可读
    degradedPartial: !typed,
  }
}

/**
 * 组 E 营养补充依从性（PRD §4.3.4）：解析 supplement_items JSON 算维 D 覆盖率。
 * 参考：婴儿出生后数日即应每日补充维生素 D 400 IU（中国营养学会），故按"天数覆盖"判定。
 */
async function querySupplements(db, babyId) {
  const [rows] = await db.query(
    `SELECT DATE(record_time) AS d, supplement_items FROM feeding_supplement_record
      WHERE baby_id = ? AND record_time >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
    [babyId],
  )
  const D_KEYS = ['vitD', 'vitAD', 'vitd', 'vitad']
  const daySet = new Set()
  let lastVitDAt = null
  const keyNames = new Set()
  for (const r of rows) {
    const d = toDateStr(r.d)
    for (const it of asArray(r.supplement_items)) {
      const k = String(it?.key || '')
      if (it?.label) keyNames.add(String(it.label))
      if (D_KEYS.includes(k)) {
        daySet.add(d)
        if (!lastVitDAt || d > lastVitDAt) lastVitDAt = d
      }
    }
  }
  return {
    windowDays: 30,
    vitDDays: daySet.size,
    vitDRate: round2(daySet.size / 30),
    lastVitDAt,
    vitDStaleDays: lastVitDAt ? Math.max(0, dayDiff(lastVitDAt, cstToday()) ?? 0) : null,
    kinds: [...keyNames].slice(0, 6),
    records30: rows.length,
  }
}


/**
 * 组 C 餐次节奏 `mealRhythm`（PRD §4.3.1 组 C 第 5 项，原文只列名未给算法）。
 * 本实现定的口径：**近 7 天有记录的日子里，平均每天进食几次、其中奶几顿辅食几顿**。
 * 刻意不给"是否达标"结论 —— 餐次随月龄与个体差异大，行业无共识阈值，只描述现状。
 */
async function queryMealRhythm(db, babyId) {
  const [rows] = await db.query(
    `SELECT d, SUM(f) AS formula_meals, SUM(s) AS food_meals FROM (
       SELECT DATE(record_time) AS d, COUNT(*) AS f, 0 AS s
         FROM feeding_formula_record WHERE baby_id = ? AND record_time >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) GROUP BY d
       UNION ALL
       SELECT DATE(record_time) AS d, 0 AS f, COUNT(*) AS s
         FROM feeding_food_record WHERE baby_id = ? AND record_time >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) GROUP BY d
     ) t GROUP BY d ORDER BY d`,
    [babyId, babyId],
  )
  if (!rows.length) return null
  const meals = rows.map((r) => Number(r.formula_meals || 0) + Number(r.food_meals || 0))
  const avg = meals.reduce((a, b) => a + b, 0) / meals.length
  return {
    recordedDays: rows.length,
    avgMealsPerDay: round2(avg),
    avgFormulaMeals: round2(rows.reduce((a, r) => a + Number(r.formula_meals || 0), 0) / rows.length),
    avgFoodMeals: round2(rows.reduce((a, r) => a + Number(r.food_meals || 0), 0) / rows.length),
    minMeals: Math.min(...meals),
    maxMeals: Math.max(...meals),
  }
}

/** 数据新鲜度（元信号：区分"无记录"与"数据陈旧"） */
async function queryFreshness(db, babyId) {
  const [rows] = await db.query(
    `SELECT 'formula' AS src, MAX(record_time) AS latest FROM feeding_formula_record WHERE baby_id = ?
     UNION ALL SELECT 'food', MAX(record_time) FROM feeding_food_record WHERE baby_id = ?
     UNION ALL SELECT 'supplement', MAX(record_time) FROM feeding_supplement_record WHERE baby_id = ?
     UNION ALL SELECT 'medication', MAX(record_time) FROM medication_record WHERE baby_id = ? AND deleted_at IS NULL
     UNION ALL SELECT 'growth', MAX(record_date) FROM growth_record WHERE baby_id = ?
     UNION ALL SELECT 'symptom', MAX(record_time) FROM symptom_record WHERE baby_id = ?
     UNION ALL SELECT 'medical', MAX(visit_date) FROM medical_record WHERE baby_id = ?
     UNION ALL SELECT 'diary', MAX(diary_date) FROM baby_diary WHERE baby_id = ?`,
    [babyId, babyId, babyId, babyId, babyId, babyId, babyId, babyId],
  )
  const out = {}
  for (const r of rows) {
    const d = toDateStr(r.latest)
    out[r.src] = { lastAt: d || null, staleDays: d ? Math.max(0, dayDiff(d, cstToday()) ?? 0) : null }
  }
  return out
}

/** 逐组查询，单组失败不影响其余（降级原则） */
async function buildProfile(babyId) {
  const db = getDb()
  if (!db) return null
  const safe = async (label, fn) => {
    try {
      return await fn()
    } catch (e) {
      console.warn(`[profile] ${label} 查询失败，该组降级为空:`, e?.message || e)
      return null
    }
  }
  const basic = await safe('basic', () => queryBasic(db, babyId))
  if (!basic) return null // 连档案都取不到，画像无意义
  const [formula, feeding, freshness, medical, supplements, mealRhythm] = await Promise.all([
    safe('formula', () => queryFormula(db, babyId)),
    safe('feeding', () => queryFeeding(db, babyId)),
    safe('freshness', () => queryFreshness(db, babyId)),
    safe('medical', () => queryMedical(db, babyId)),
    safe('supplements', () => querySupplements(db, babyId)),
    safe('mealRhythm', () => queryMealRhythm(db, babyId)),
  ])
  const growth = await safe('growth', () => queryGrowth(db, babyId, basic))
  return { babyId, at: Date.now(), basic, formula, feeding, growth, freshness, medical, supplements, mealRhythm }
}

/**
 * 取宝宝画像（带 5 分钟进程内缓存）。
 * @param {string} babyId
 * @returns {Promise<object|null>} 失败或缺少 babyId 时返回 null（调用方按"无画像"处理）
 */
export async function getBabyProfile(babyId) {
  if (!babyId) return null
  const hit = cache.get(babyId)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.profile
  try {
    const profile = await buildProfile(babyId)
    cache.set(babyId, { at: Date.now(), profile })
    return profile
  } catch (e) {
    console.warn('[profile] 构建失败，降级为空画像:', e?.message || e)
    return null
  }
}

/** 写记录后主动失效缓存（供后续计划类能力调用） */
export function invalidateProfile(babyId) {
  if (babyId) cache.delete(babyId)
  else cache.clear()
}

/** 描述某个数据源的新鲜度：null 表示"无记录"（有效结论）而非"陈旧" */
function freshnessText(src, info) {
  const label = FRESHNESS_LABEL[src] || src
  if (!info || !info.lastAt) return `${label}无记录`
  if (info.staleDays === 0) return `${label}今天`
  if (info.staleDays === 1) return `${label}昨天`
  const stale = STALE_DAYS[src] != null && info.staleDays > STALE_DAYS[src]
  return `${label}${info.staleDays}天前${stale ? '（较旧）' : ''}`
}

/**
 * 渲染为可注入 systemPrompt 的中文画像块。
 * 无画像时返回空串（prompt 里就不出现这一段）。
 */
export function renderProfileBlock(profile) {
  if (!profile?.basic) return ''
  const { basic, formula, feeding, growth, freshness, medical, supplements, mealRhythm } = profile
  const lines = []

  // 第一行：身份 + 过敏前提（出生体重属组 A 事实信号，采集了就必须用上）
  const allergen = basic.allergyTypes.map((t) => ALLERGEN_LABEL[t] || t).join('、')
  const level = LEVEL_LABEL[basic.allergyLevel] || null
  const who = [basic.name, basic.ageText, basic.gender === 'male' ? '男' : basic.gender === 'female' ? '女' : null]
    .filter(Boolean)
    .join('，')
  const birthNote = basic.birthWeightG
    ? `，出生体重 ${(basic.birthWeightG / 1000).toFixed(2)} 千克`
    : ''
  const allergyText = allergen
    ? `${level ? level : ''}${allergen}蛋白过敏（过敏原：${allergen}）`
    : `过敏原未填写`
  lines.push(`${who}。${allergyText}${birthNote}。`)

  // 配方与转奶进度
  if (formula?.dominantLabel) {
    const parts = []
    const mix = formula.current
      .slice(0, 3)
      .map(([t, r]) => `${LADDER_LABEL[t] || t} ${Math.round(r * 100)}%`)
      .join(' + ')
    parts.push(formula.current.length > 1 ? `当前配方为混合配比（${mix}）` : `当前为纯${formula.dominantLabel}配方`)
    if (formula.lactose) parts.push(`乳糖类型：${formula.lactose}`)
    if (formula.aaStoppedDays != null) parts.push(`已停用氨基酸配方 ${formula.aaStoppedDays} 天`)
    const statusText =
      formula.status === 'stable'
        ? `构成稳定${formula.stalledAtLeast ? '至少' : ''} ${formula.stalledDays} 天`
        : formula.status === 'stalled'
          ? `混合配比已停滞${formula.stalledAtLeast ? '至少' : ''} ${formula.stalledDays} 天未推进`
          : `正在调整中（当前配比维持${formula.stalledAtLeast ? '至少' : ''} ${formula.stalledDays} 天）`
    parts.push(statusText)
    if (formula.direction === 'deescalated') parts.push('近一个月整体在往低阶梯方向降级')
    if (formula.direction === 'escalated') parts.push('近一个月出现过往高阶梯方向调整')
    // 记录已空档多日时必须标注截至日期：否则「构成稳定 N 天」会被误读成当下状态
    const staleNote =
      formula.staleDays > 3
        ? `（配方记录截至 ${formula.lastRecordAt}，已 ${formula.staleDays} 天未更新，勿当作当前状态）`
        : ''
    lines.push(`配方：${parts.join('；')}${staleNote}。`)
  }

  // 喂养方式
  if (feeding) {
    const parts = []
    if (feeding.mode === 'formula_only') {
      // 30 天窗口内可能残留停母乳前的旧记录，必须显式点明是历史数据：
      // 否则模型看到"近 30 天有 N 次母乳"又会把人当混合喂养，回到 F3 要修的老毛病。
      const tail =
        feeding.breastCount30 > 0
          ? `，30 天窗口内尚有 ${feeding.breastCount30} 条旧记录，属历史数据，不代表仍在母乳`
          : ''
      parts.push(
        feeding.lastBreastAt
          ? `已停止母乳（最后一次母乳记录在 ${feeding.sinceBreastDays} 天前${tail}）`
          : '未进行母乳喂养（从无母乳记录）',
      )
    } else if (feeding.mode === 'mixed') {
      parts.push(`母乳与配方奶混合喂养（最近一次母乳在 ${feeding.sinceBreastDays ?? 0} 天前）`)
    } else if (feeding.mode === 'breast_only') {
      parts.push(
        `以母乳喂养为主（最近一次母乳在 ${feeding.sinceBreastDays ?? 0} 天前，近 14 天无配方奶记录）`,
      )
    } else {
      parts.push('喂养方式暂不确定')
    }
    if (feeding.avgFormulaMl7) parts.push(`近 7 天配方奶日均约 ${feeding.avgFormulaMl7} 毫升`)
    if (feeding.solidKinds30) parts.push(`近 30 天辅食涉及 ${feeding.solidKinds30} 种食材`)
    if (mealRhythm?.recordedDays) {
      parts.push(
        `近 7 天有记录 ${mealRhythm.recordedDays} 天、平均每天进食 ${mealRhythm.avgMealsPerDay} 次（奶 ${mealRhythm.avgFormulaMeals} 顿 + 辅食 ${mealRhythm.avgFoodMeals} 顿）`,
      )
    }
    lines.push(`喂养：${parts.join('；')}。`)
  }

  // 生长分位与趋势（含头围 —— 组 E 明确列了 headP，此前 SQL 未取列）
  if (growth?.latest) {
    const l = growth.latest
    const parts = []
    if (l.weightKg) parts.push(`体重 ${l.weightKg} 千克${l.weightP ? `（${l.weightP}）` : ''}`)
    if (l.heightCm) parts.push(`身长 ${l.heightCm} 厘米${l.heightP ? `（${l.heightP}）` : ''}`)
    if (l.headCm) parts.push(`头围 ${l.headCm} 厘米${l.headP ? `（${l.headP}）` : ''}`)
    const trend = (() => {
      const p = growth.previous
      if (!p?.weightP || !l.weightP) return ''
      // growth.js::bucket 只返回**区间档**（如 'P85-P97' / '高于P97'），
      // 用单点标签 ['P3','P15',…] 做 indexOf 会恒为 -1 → 两边都得 -1 → d=0 →
      // **趋势永远输出「平稳」**（2026-09-22 修：改用档位序列；档位认不出时不给结论，
      // 绝不因为"算不出来"就说平稳 —— 那等于给家长报假结论）。
      const rank = (s) => P_BANDS.indexOf(s)
      const rl = rank(l.weightP)
      const rp = rank(p.weightP)
      if (rl < 0 || rp < 0) return ''
      return rl > rp ? '，趋势上升' : rl < rp ? '，趋势下降' : '，趋势平稳'
    })()
    // 增速只给实测速度，不给"是否达标"（缺月龄增速参考表，不编造结论）
    const v = growth.velocity?.weightGPerDay
    const vh = growth.velocity?.heightCmPerMonth
    const vText = []
    if (v) vText.push(`日均增重约 ${v.perDay} 克`)
    if (vh) vText.push(`月均增长约 ${vh.perMonth} 厘米`)
    if (parts.length) {
      lines.push(
        `生长：${parts.join('、')}${trend}（测量于 ${l.measuredAt}，${l.months} 月龄）${vText.length ? `；与上次测量相比${vText.join('、')}` : ''}。`,
      )
    }
  }

  // 营养补充依从性（组 E）：维 D 是中国婴幼儿唯一普遍推荐每日补充的项
  if (supplements) {
    const bits = [`近 30 天维生素 D 类补充覆盖 ${supplements.vitDDays}/30 天`]
    if (supplements.vitDStaleDays != null && supplements.vitDStaleDays > 3) {
      bits.push(`最近一次在 ${supplements.vitDStaleDays} 天前`)
    }
    if (supplements.kinds.length) bits.push(`补充种类：${supplements.kinds.join('、')}`)
    lines.push(`营养补充：${bits.join('；')}（参考：婴儿应每日补充维生素 D）。`)
  }

  // 医疗与随访（组 G）
  if (medical?.total) {
    const TYPE_LABEL = { vaccine: '疫苗', checkup: '儿保', sick: '就诊', other: '其他' }
    const byType = Object.entries(medical.byType)
      .map(([k, n]) => `${TYPE_LABEL[k] || k} ${n}`)
      .join('、')
    // 020 未上生产时只有计数值可读 —— 必须显式标注，避免模型追问剂次/名称
    const degraded = medical.degradedPartial ? '（仅计数可读，接种剂次与名称暂不可用）' : ''
    lines.push(`医疗：${byType}${degraded}；最近一次 ${medical.lastVisitAt}${TYPE_LABEL[medical.lastVisitType] ? `（${TYPE_LABEL[medical.lastVisitType]}）` : ''}。`)
    if (medical.followUp) lines.push(`复查计划：已登记 ${medical.followUp} 的复查。`)
  }

  // 数据新鲜度（元信号）
  if (freshness) {
    const order = ['formula', 'food', 'supplement', 'medication', 'growth', 'symptom', 'medical', 'diary']
    const texts = order.map((s) => freshnessText(s, freshness[s]))
    lines.push(`数据新鲜度：${texts.join(' / ')}。`)
  }

  // 行为约束：这一段决定画像是否真的改变回答，而不是变成一段"资料"
  lines.push(
    [
      '【画像使用要求】',
      '- 以上是服务端算好的结论，直接作为前提使用，不要向家长复述"你的记录显示…"这类统计口径话术；',
      '- 喂养方式以本画像为准：标注"已停止母乳"时，回答与日记中都**不要**出现"母乳喂养/混合喂养/亲喂"等默认表述（含"30 天窗口内旧记录"不得当作仍在母乳）；',
      '- 所有辅食与喂养建议默认带牛奶蛋白过敏前提；',
      '- 标注"较旧"或"无记录"的信号不要当作阴性结论（如症状久无记录 ≠ 无症状），也不要提醒家长补记录。',
    ].join('\n'),
  )

  return lines.join('\n')
}
