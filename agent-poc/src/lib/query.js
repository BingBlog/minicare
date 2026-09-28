/**
 * 宝宝健康数据查询（lib/query.js，M3 数据查询）
 *
 * queryMetric(babyId, metric, days, aggregate)：按时间窗查询各维度记录。
 * 数据源：CynosDB 只读连接（lib/db.js），全部 prepared statement，只读。
 *
 * metric → 表映射（minicare-server 008 schema redessign 后）：
 *   feeding   → feeding_breast_record / feeding_formula_record / feeding_food_record / feeding_supplement_record
 *   sleep     → sleep_record
 *   diaper    → diaper_record
 *   growth    → growth_record
 *   health    → health_record
 *   symptom   → symptom_record
 *   activity  → activity_record
 *   medical   → medical_record（就医/体检）
 *   medication→ medication_record（服药打卡，migration 013）
 *
 * aggregate：list（最近 N 条）/ sum / avg / count / trend（按天分组）。
 * days 服务端 clamp 1-90（M3 §3.2）。
 */
import { getDb } from './db.js'

export const METRICS = ['feeding', 'sleep', 'diaper', 'growth', 'health', 'symptom', 'activity', 'medical', 'medication']
export const METRIC_LABELS = {
  feeding: '喂养',
  sleep: '睡眠',
  diaper: '尿布',
  growth: '生长',
  health: '健康',
  symptom: '表现',
  activity: '活动',
  medical: '就医',
  medication: '服药',
}

const clampDays = (days) => Math.max(1, Math.min(90, Number(days) || 7))

// ---------- 各 metric 的表与列定义 ----------

/** feeding 拆分为 4 子表，逐子表产出结构化行 */
const FEEDING_SUB_TABLES = [
  {
    key: 'breast', label: '母乳',
    table: 'feeding_breast_record',
    select: "breast_side AS side, duration_min AS duration_min, NULL AS ml, NULL AS food_name, NULL AS amount_g",
  },
  {
    key: 'formula', label: '配方奶',
    table: 'feeding_formula_record',
    select: "NULL AS side, duration_min AS duration_min, formula_ml AS ml, NULL AS food_name, NULL AS amount_g",
  },
  {
    key: 'food', label: '辅食',
    table: 'feeding_food_record',
    join: 'feeding_food_item',  // 明细子表（food_name/amount_g），queryList 时 LEFT JOIN
  },
  {
    key: 'supplement', label: '营养素',
    table: 'feeding_supplement_record',
    json: 'supplement_items',   // JSON 列（[{label,key,dose,unit}]），queryList 时解析
  },
]

// 各非 feeding metric：表 + 数值列（用于 sum/avg）+ 时间列
const SIMPLE_METRICS = {
  sleep: { table: 'sleep_record', timeCol: 'start_time', numericCol: 'duration_min', statusWhere: "AND status='ended'" },
  diaper: { table: 'diaper_record', timeCol: 'record_time', numericCol: null, statusWhere: '' },
  growth: { table: 'growth_record', timeCol: 'record_date', numericCol: 'weight_g', statusWhere: '' },
  health: { table: 'health_record', timeCol: 'record_time', numericCol: 'temperature', statusWhere: '', notAdditive: true, aggFn: 'MAX' },
  symptom: { table: 'symptom_record', timeCol: 'record_time', numericCol: null, statusWhere: '' },
  activity: { table: 'activity_record', timeCol: 'record_time', numericCol: 'duration_min', statusWhere: '' },
  medical: { table: 'medical_record', timeCol: 'visit_date', numericCol: null, statusWhere: '' },
  // 服药打卡（013）：表带 deleted_at 软删除列，未软删的才返回
  medication: { table: 'medication_record', timeCol: 'record_time', numericCol: null, statusWhere: 'AND deleted_at IS NULL' },
}

// ---------- medical 列显式化 + 类型化列运行时探测（2026-09-19，migration 020）----------
//
// 背景：此前 medical 走 SELECT *，同一份 agent 代码在 dev（34 列）与生产（18 列）
// 返回不同字段 —— 生产库尚未应用 migration 020，没有 vaccine_*/checkup_*/sick_* 列。
// 一旦 tool 直接引用这些列，线上即 Unknown column 全线失败。
//
// 处置：改显式列 + 启动后按 information_schema 探测一次（结果缓存），
// 生产环境自动退化为基础列，dev/staging 拿到完整字段。
const MEDICAL_SELECT_BASE = [
  'id', 'baby_id', 'visit_date', 'visit_time', 'visit_type',
  'hospital', 'doctor', 'diagnosis', 'result_summary', 'note',
  'follow_up_date', 'follow_up_time', 'medications', 'photo_ids', 'created_at',
].join(', ')

// 020 才新增的 16 列，仅在探测到类型化 schema 时拼接
const MEDICAL_SELECT_TYPED_EXTRA = [
  'vaccine_name', 'vaccine_schedule_key', 'vaccine_dose_seq', 'vaccine_site',
  'vaccine_batch', 'vaccine_reactions', 'vaccine_reaction_note',
  'checkup_height_mm', 'checkup_weight_g', 'checkup_head_mm',
  'checkup_milestones', 'checkup_assessment', 'checkup_qa', 'checkup_growth_sync',
  'sick_complaint', 'sick_symptom_flags',
].join(', ')

/** 探测列用 checkup_weight_g（020 新增），不能用 visit_type —— 后者生产库早已存在 */
let typedMedicalFlag = null

export async function hasTypedMedical(db) {
  if (typedMedicalFlag !== null) return typedMedicalFlag
  try {
    const [rows] = await db.query(
      `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='medical_record'
         AND COLUMN_NAME='checkup_weight_g'`,
    )
    typedMedicalFlag = Number(rows?.[0]?.n || 0) > 0
  } catch {
    typedMedicalFlag = false
  }
  return typedMedicalFlag
}

/** medical 的显式列清单（按探测结果决定是否含 020 类型化列） */
async function medicalSelect(db) {
  const typed = await hasTypedMedical(db)
  return typed ? `${MEDICAL_SELECT_BASE}, ${MEDICAL_SELECT_TYPED_EXTRA}` : MEDICAL_SELECT_BASE
}

/**
 * medication 显式列：剔除 recorded_by（user_account UUID）与 deleted_at ——
 * SELECT * 会把内部标识一并塞进模型上下文。故本维度列清单固定。
 */
const MEDICATION_SELECT = ['medication_name', 'dose', 'record_time', 'note'].join(', ')

/**
 * 需要显式列的两个维度：medical（跨环境 schema 差异）/ medication（隐私列剔除）；
 * 其余表无差异，保留 * 以免列清单失维护。
 */
async function selectClause(db, metric) {
  if (metric === 'medical') return medicalSelect(db)
  if (metric === 'medication') return MEDICATION_SELECT
  return '*'
}

// ---------- 查询实现 ----------

/**
 * feeding 4 子表统一产出结构化行（时间过滤由调用方传入 where 片段）
 * - food      子表：LEFT JOIN feeding_food_item，输出 food_name/amount_g/amount_note
 * - supplement 子表：解析 supplement_items JSON，输出补充剂名称列表
 */
async function queryFeedingRows(db, babyId, timeWhere, params, limit) {
  const out = []
  // 子表预取量（2026-09-07 修复）：food 子表 LEFT JOIN food_item 每食材膨胀 1 行，
  // 此前非 food 子表仅预取 ceil(limit/4) 行，当日顿数一多（或辅食项多）配方奶/母乳行就被
  // 截断 → 模型按可见明细心算总量出错（生产日记 460 vs 880 事故根因）。
  // 现改为：非 food 子表预取 limit 行、food 子表预取 limit*3 行，合并排序后再 slice(0, limit)。
  const prefetch = { milk: limit, food: limit * 3 }
  for (const sub of FEEDING_SUB_TABLES) {
    const subLimit = sub.join ? prefetch.food : prefetch.milk
    if (sub.join) {
      const [rows] = await db.query(
        `SELECT f.record_time, i.food_name, i.amount_g, i.amount_note, f.note AS record_note
         FROM ${sub.table} f LEFT JOIN ${sub.join} i ON i.record_id = f.id
         WHERE f.baby_id=? AND ${timeWhere}
         ORDER BY f.record_time DESC, i.id ASC LIMIT ?`,
        [babyId, ...params, subLimit],
      )
      for (const r of rows) {
        out.push({
          type: sub.label,
          record_time: r.record_time,
          food_name: r.food_name || null,
          amount_g: r.amount_g != null ? r.amount_g : null,
          amount_note: r.amount_note || null,
          note: r.record_note || null,
        })
      }
    } else if (sub.json) {
      const [rows] = await db.query(
        `SELECT record_time, ${sub.json}, note FROM ${sub.table}
         WHERE baby_id=? AND ${timeWhere}
         ORDER BY record_time DESC LIMIT ?`,
        [babyId, ...params, subLimit],
      )
      for (const r of rows) {
        let items = []
        try {
          items = Array.isArray(r[sub.json]) ? r[sub.json] : JSON.parse(r[sub.json] || '[]')
        } catch { /* 坏 JSON 忽略 */ }
        out.push({
          type: sub.label,
          record_time: r.record_time,
          supplement_items: (Array.isArray(items) ? items : []).map((x) => ({
            label: x?.label || null,
            key: x?.key || null,
            dose: x?.dose ?? '',
            unit: x?.unit ?? '',
          })),
          note: r.note || null,
        })
      }
    } else {
      const [rows] = await db.query(
        `SELECT record_time, ${sub.select} FROM ${sub.table}
         WHERE baby_id=? AND ${timeWhere}
         ORDER BY record_time DESC LIMIT ?`,
        [babyId, ...params, subLimit],
      )
      for (const r of rows) out.push({ type: sub.label, record_time: r.record_time, ...r })
    }
  }
  return out.sort((a, b) => new Date(b.record_time) - new Date(a.record_time)).slice(0, limit)
}

/** list：最近 N 条原始记录（含数值字段） */
async function queryList(db, babyId, metric, days, limit = 10) {
  if (metric === 'feeding') {
    return queryFeedingRows(db, babyId, 'record_time >= DATE_SUB(NOW(), INTERVAL ? DAY)', [days], limit)
  }
  const m = SIMPLE_METRICS[metric]
  const cols = await selectClause(db, metric)
  const [rows] = await db.query(
    `SELECT ${cols} FROM ${m.table} WHERE baby_id=? AND ${m.timeCol} >= DATE_SUB(NOW(), INTERVAL ? DAY) ${m.statusWhere}
     ORDER BY ${m.timeCol} DESC LIMIT ?`,
    [babyId, days, limit],
  )
  return rows
}

/**
 * 指定某一天的记录明细（generate_diary 用）。
 * date 形如 YYYY-MM-DD，按业务时区 +08:00 取 [date 00:00:00, date 23:59:59]。
 */
export async function queryMetricOnDate(babyId, metric, date) {
  const db = getDb()
  if (!db) return { ok: false, error: '数据库未连接（DB 配置缺失）', metric, date, hasData: false, count: 0, rows: [] }
  if (!METRICS.includes(metric)) {
    return { ok: false, error: `不支持的 metric: ${metric}`, metric, date, hasData: false, count: 0, rows: [] }
  }
  const t0 = `${date} 00:00:00`
  const t1 = `${date} 23:59:59`
  let rows = []
  if (metric === 'feeding') {
    rows = await queryFeedingRows(db, babyId, 'record_time BETWEEN ? AND ?', [t0, t1], 20)
  } else {
    const m = SIMPLE_METRICS[metric]
    const cols = await selectClause(db, metric)
    const [r] = await db.query(
      `SELECT ${cols} FROM ${m.table} WHERE baby_id=? AND ${m.timeCol} BETWEEN ? AND ? ${m.statusWhere}
       ORDER BY ${m.timeCol} DESC LIMIT 20`,
      [babyId, t0, t1],
    )
    rows = r
  }
  return { ok: true, metric, date, hasData: rows.length > 0, count: rows.length, rows }
}

/**
 * 指定某一天的喂养汇总（generate_diary 用，2026-09-07 新增）。
 * SQL 直接 SUM，返回权威合计，供模型写日记直接引用，避免对（可能截断的）明细心算加总。
 * date 形如 YYYY-MM-DD，窗口 [date 00:00:00, date 23:59:59]（业务时区 +08）。
 */
export async function queryFeedingSummaryOnDate(babyId, date) {
  const db = getDb()
  if (!db) return null
  const t0 = `${date} 00:00:00`
  const t1 = `${date} 23:59:59`
  try {
    const [[formula]] = await db.query(
      `SELECT COUNT(*) AS n, COALESCE(SUM(formula_ml), 0) AS total_ml
       FROM feeding_formula_record WHERE baby_id=? AND record_time BETWEEN ? AND ?`,
      [babyId, t0, t1],
    )
    const [[breast]] = await db.query(
      `SELECT COUNT(*) AS n, COALESCE(SUM(duration_min), 0) AS total_min
       FROM feeding_breast_record WHERE baby_id=? AND record_time BETWEEN ? AND ?`,
      [babyId, t0, t1],
    )
    const [[food]] = await db.query(
      `SELECT COUNT(*) AS n FROM feeding_food_record WHERE baby_id=? AND record_time BETWEEN ? AND ?`,
      [babyId, t0, t1],
    )
    const [[supplement]] = await db.query(
      `SELECT COUNT(*) AS n FROM feeding_supplement_record WHERE baby_id=? AND record_time BETWEEN ? AND ?`,
      [babyId, t0, t1],
    )
    return {
      formula_ml: Math.round(formula.total_ml || 0),
      formula_count: Number(formula.n || 0),
      breast_min: Math.round(breast.total_min || 0),
      breast_count: Number(breast.n || 0),
      food_count: Number(food.n || 0),
      supplement_count: Number(supplement.n || 0),
    }
  } catch (e) {
    console.error('[query] 当日喂养汇总失败:', e.message)
    return null
  }
}

/** count：窗口内条数 */
async function queryCount(db, babyId, metric, days) {
  if (metric === 'feeding') {
    let total = 0
    for (const sub of FEEDING_SUB_TABLES) {
      const [[{ n }]] = await db.query(
        `SELECT COUNT(*) AS n FROM ${sub.table} WHERE baby_id=? AND record_time >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
        [babyId, days],
      )
      total += n
    }
    return total
  }
  const m = SIMPLE_METRICS[metric]
  const [[{ n }]] = await db.query(
    `SELECT COUNT(*) AS n FROM ${m.table} WHERE baby_id=? AND ${m.timeCol} >= DATE_SUB(NOW(), INTERVAL ? DAY) ${m.statusWhere}`,
    [babyId, days],
  )
  return n
}

/** sum/avg：数值列聚合（feeding 对母乳时长/奶量/辅食克数分别聚合） */
async function queryAggregate(db, babyId, metric, days, agg) {
  if (metric === 'feeding') {
    const out = {}
    const [[breast]] = await db.query(
      `SELECT ${agg}(duration_min) AS v FROM feeding_breast_record WHERE baby_id=? AND record_time >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [babyId, days],
    )
    const [[formula]] = await db.query(
      `SELECT ${agg}(formula_ml) AS v FROM feeding_formula_record WHERE baby_id=? AND record_time >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [babyId, days],
    )
    out.breast_min = Math.round(breast.v || 0)
    out.formula_ml = Math.round(formula.v || 0)
    return out
  }
  const m = SIMPLE_METRICS[metric]
  if (!m.numericCol) return {}
  // 可加总性：体温是**测量值**不是累计量，SUM 会把一天多条体温相加
  // （实测出过 37.0+36.7+36.8 = 110.5 这种荒谬值）→ 用 MAX（当日最高体温临床更有意义）。
  const fn = agg === 'SUM' && m.notAdditive ? (m.aggFn || 'MAX') : agg
  const [[row]] = await db.query(
    `SELECT ${fn}(${m.numericCol}) AS v FROM ${m.table} WHERE baby_id=? AND ${m.timeCol} >= DATE_SUB(NOW(), INTERVAL ? DAY) ${m.statusWhere}`,
    [babyId, days],
  )
  const value = m.numericCol === 'temperature' ? Number(row.v || 0).toFixed(1) : Math.round(row.v || 0)
  // 数值列在该窗口内全为空（如只有过敏反应、没量体温的 health 记录）→ 明说无值，
  // 不要返回 0（"体温 0.0"会被当成真实测量值，是假阳性的来源）
  if (row.v == null) return { value: null, note: '该窗口内没有可用的数值记录' }
  return { value, ...(fn !== agg ? { agg_fn: fn } : {}) }
}

/** trend：按天分组（feeding 聚合母乳分钟/配方毫升/次数） */
async function queryTrend(db, babyId, metric, days) {
  if (metric === 'feeding') {
    const [breast] = await db.query(
      `SELECT DATE(record_time) AS d, SUM(duration_min) AS total_min, COUNT(*) AS cnt
       FROM feeding_breast_record WHERE baby_id=? AND record_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY DATE(record_time) ORDER BY d`,
      [babyId, days],
    )
    const [formula] = await db.query(
      `SELECT DATE(record_time) AS d, SUM(formula_ml) AS total_ml, COUNT(*) AS cnt
       FROM feeding_formula_record WHERE baby_id=? AND record_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY DATE(record_time) ORDER BY d`,
      [babyId, days],
    )
    const [food] = await db.query(
      `SELECT DATE(record_time) AS d, COUNT(*) AS cnt
       FROM feeding_food_record WHERE baby_id=? AND record_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY DATE(record_time) ORDER BY d`,
      [babyId, days],
    )
    const byDay = new Map()
    for (const r of breast) byDay.set(String(r.d), { date: String(r.d), breast_min: Number(r.total_min || 0), formula_ml: 0, food_count: 0, count: Number(r.cnt) })
    for (const r of formula) {
      const d = String(r.d)
      if (byDay.has(d)) {
        byDay.get(d).formula_ml = Number(r.total_ml || 0)
        byDay.get(d).count += Number(r.cnt)
      } else {
        byDay.set(d, { date: d, breast_min: 0, formula_ml: Number(r.total_ml || 0), food_count: 0, count: Number(r.cnt) })
      }
    }
    for (const r of food) {
      const d = String(r.d)
      if (byDay.has(d)) {
        byDay.get(d).food_count = Number(r.cnt)
        byDay.get(d).count += Number(r.cnt)
      } else {
        byDay.set(d, { date: d, breast_min: 0, formula_ml: 0, food_count: Number(r.cnt), count: Number(r.cnt) })
      }
    }
    return [...byDay.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
  }
  const m = SIMPLE_METRICS[metric]
  // 当日 total：非可加总列（体温）取 MAX 而不是 SUM，否则一天多次测温会被相加
  const tFn = m.notAdditive ? m.aggFn || 'MAX' : 'SUM'
  const [rows] = await db.query(
    `SELECT DATE(${m.timeCol}) AS d, COUNT(*) AS cnt${m.numericCol ? `, ${tFn}(${m.numericCol}) AS total, AVG(${m.numericCol}) AS avg_v` : ''}
     FROM ${m.table} WHERE baby_id=? AND ${m.timeCol} >= DATE_SUB(NOW(), INTERVAL ? DAY) ${m.statusWhere}
     GROUP BY DATE(${m.timeCol}) ORDER BY d`,
    [babyId, days],
  )
  return rows.map((r) => {
    const hasNum = m.numericCol && r.total != null
    const fmt = (v) => (m.numericCol === 'temperature' ? Number(v).toFixed(1) : Number(v))
    return {
      date: String(r.d),
      count: Number(r.cnt),
      // 当日该列全空（如只记了过敏反应、没量体温）→ 不给 total/avg，避免"体温 0.0"
      ...(hasNum ? { total: fmt(r.total), avg: fmt(r.avg_v) } : {}),
    }
  })
}

/**
 * 查询宝宝某维度数据（对外唯一入口）
 * @returns {Promise<{ok:boolean, metric:string, days:number, aggregate:string, hasData:boolean, count:number, rows:Array, summary:Object, note:string}>}
 */
export async function queryMetric(babyId, metric, days = 7, aggregate = 'list') {
  const db = getDb()
  if (!db) {
    return { ok: false, error: '数据库未连接（DB 配置缺失）', metric, days, hasData: false, rows: [], summary: {}, note: '数据库不可用' }
  }
  if (!METRICS.includes(metric)) {
    return { ok: false, error: `不支持的 metric: ${metric}`, metric, days, hasData: false, rows: [], summary: {}, note: '' }
  }
  const d = clampDays(days)
  const count = await queryCount(db, babyId, metric, d)
  let rows = []
  let summary = {}
  if (aggregate === 'list') {
    rows = await queryList(db, babyId, metric, d, 10)
  } else if (aggregate === 'count') {
    rows = []
    summary = { count }
  } else if (aggregate === 'sum') {
    summary = await queryAggregate(db, babyId, metric, d, 'SUM')
  } else if (aggregate === 'avg') {
    summary = await queryAggregate(db, babyId, metric, d, 'AVG')
  } else if (aggregate === 'trend') {
    rows = await queryTrend(db, babyId, metric, d)
    summary = { days: rows.length, total: count }
  } else {
    return { ok: false, error: `不支持的 aggregate: ${aggregate}`, metric, days: d, hasData: false, rows: [], summary: {}, note: '' }
  }
  return {
    ok: true,
    metric,
    days: d,
    aggregate,
    hasData: count > 0,
    count,
    rows,
    summary,
    note: `数据来自最近 ${d} 天的 ${METRIC_LABELS[metric]}记录（共 ${count} 条）`,
  }
}
