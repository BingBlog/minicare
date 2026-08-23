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
 *
 * aggregate：list（最近 N 条）/ sum / avg / count / trend（按天分组）。
 * days 服务端 clamp 1-90（M3 §3.2）。
 */
import { getDb } from './db.js'

export const METRICS = ['feeding', 'sleep', 'diaper', 'growth', 'health', 'symptom', 'activity']
export const METRIC_LABELS = {
  feeding: '喂养',
  sleep: '睡眠',
  diaper: '尿布',
  growth: '生长',
  health: '健康',
  symptom: '表现',
  activity: '活动',
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
    select: "NULL AS side, NULL AS duration_min, NULL AS ml, NULL AS food_name, NULL AS amount_g",
  },
  {
    key: 'supplement', label: '营养素',
    table: 'feeding_supplement_record',
    select: "NULL AS side, NULL AS duration_min, NULL AS ml, NULL AS food_name, NULL AS amount_g",
  },
]

// 各非 feeding metric：表 + 数值列（用于 sum/avg）+ 时间列
const SIMPLE_METRICS = {
  sleep: { table: 'sleep_record', timeCol: 'start_time', numericCol: 'duration_min', statusWhere: "AND status='ended'" },
  diaper: { table: 'diaper_record', timeCol: 'record_time', numericCol: null, statusWhere: '' },
  growth: { table: 'growth_record', timeCol: 'record_date', numericCol: 'weight_g', statusWhere: '' },
  health: { table: 'health_record', timeCol: 'record_time', numericCol: 'temperature', statusWhere: '' },
  symptom: { table: 'symptom_record', timeCol: 'record_time', numericCol: null, statusWhere: '' },
  activity: { table: 'activity_record', timeCol: 'record_time', numericCol: 'duration_min', statusWhere: '' },
}

// ---------- 查询实现 ----------

/** list：最近 N 条原始记录（含数值字段） */
async function queryList(db, babyId, metric, days, limit = 10) {
  if (metric === 'feeding') {
    const out = []
    for (const sub of FEEDING_SUB_TABLES) {
      const [rows] = await db.query(
        `SELECT record_time, ${sub.select} FROM ${sub.table}
         WHERE baby_id=? AND record_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
         ORDER BY record_time DESC LIMIT ?`,
        [babyId, days, Math.ceil(limit / 4)],
      )
      for (const r of rows) out.push({ type: sub.label, record_time: r.record_time, ...r })
    }
    return out.sort((a, b) => new Date(b.record_time) - new Date(a.record_time)).slice(0, limit)
  }
  const m = SIMPLE_METRICS[metric]
  const [rows] = await db.query(
    `SELECT * FROM ${m.table} WHERE baby_id=? AND ${m.timeCol} >= DATE_SUB(NOW(), INTERVAL ? DAY) ${m.statusWhere}
     ORDER BY ${m.timeCol} DESC LIMIT ?`,
    [babyId, days, limit],
  )
  return rows
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
  const [[row]] = await db.query(
    `SELECT ${agg}(${m.numericCol}) AS v FROM ${m.table} WHERE baby_id=? AND ${m.timeCol} >= DATE_SUB(NOW(), INTERVAL ? DAY) ${m.statusWhere}`,
    [babyId, days],
  )
  const value = m.numericCol === 'temperature' ? Number(row.v || 0).toFixed(1) : Math.round(row.v || 0)
  return { value }
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
  const [rows] = await db.query(
    `SELECT DATE(${m.timeCol}) AS d, COUNT(*) AS cnt${m.numericCol ? `, SUM(${m.numericCol}) AS total, AVG(${m.numericCol}) AS avg_v` : ''}
     FROM ${m.table} WHERE baby_id=? AND ${m.timeCol} >= DATE_SUB(NOW(), INTERVAL ? DAY) ${m.statusWhere}
     GROUP BY DATE(${m.timeCol}) ORDER BY d`,
    [babyId, days],
  )
  return rows.map((r) => ({
    date: String(r.d),
    count: Number(r.cnt),
    ...(m.numericCol ? { total: m.numericCol === 'temperature' ? Number(r.total || 0).toFixed(1) : Number(r.total || 0), avg: m.numericCol === 'temperature' ? Number(r.avg_v || 0).toFixed(1) : Number(r.avg_v || 0) } : {}),
  }))
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
