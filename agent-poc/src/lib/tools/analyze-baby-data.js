/**
 * analyze_baby_data 工具（M4 总结分析与生长曲线）
 *
 * 三种 scope：
 *   trend   单维趋势（up/down/flat/volatile + 异常点）
 *   summary 跨维综合总结（各维度概览 + 异常聚合）
 *   growth  生长曲线（体重/身高百分位，中国 2023 参考）
 */
import { z } from 'zod'
import { queryMetric, METRICS, METRIC_LABELS } from '../query.js'
import { percentileOf } from '../growth.js'
import { getDb } from '../db.js'
// 宝宝档案与月龄统一从 lib/profile.js 取得（2026-09-19 收敛）：
// 此前本文件各存一份 getBabyProfile / ageInMonths，与画像层并行存在两套实现，
// 有结论漂移风险 —— 分位数已用 growth.js 共用，月龄也必须共用同一份。
import { getBabyProfile, ageInMonths } from '../profile.js'

export const ANALYZE_BABY_DATA_TOOL = {
  name: 'analyze_baby_data',
  description:
    '对宝宝健康记录做趋势分析、跨维度综合总结或生长曲线解读。用户要求"总结/趋势/周报/月报/生长/百分位"时调用，结果带数据依据。',
  parameters: z.object({
    scope: z.enum(['trend', 'summary', 'growth']).describe('trend=单维趋势 / summary=跨维总结 / growth=生长曲线'),
    days: z.number().int().min(1).max(90).optional().describe('时间窗天数，默认 7'),
    metrics: z.array(z.enum(METRICS)).optional().describe('summary 时指定维度，默认全部'),
  }),
}

/** 趋势判定：首尾 3 天均值对比 + 极差比（M4 §2.1） */
function judgeTrend(rows) {
  if (rows.length < 4) return { trend: 'flat', reason: '数据点不足' }
  const first3 = rows.slice(0, 3)
  const last3 = rows.slice(-3)
  const avg = (arr, key) => arr.reduce((s, r) => s + (Number(r.total) || Number(r.breast_min + r.formula_ml) || 0), 0) / arr.length
  const firstAvg = avg(first3, 'total')
  const lastAvg = avg(last3, 'total')
  if (firstAvg === 0 && lastAvg === 0) return { trend: 'flat', reason: '无数值数据' }
  const ratio = lastAvg / Math.max(firstAvg, 1)
  if (ratio > 1.3) return { trend: 'up', reason: `末期均值约为初期 ${ratio.toFixed(1)} 倍` }
  if (ratio < 0.7) return { trend: 'down', reason: `末期均值约为初期 ${ratio.toFixed(1)} 倍` }
  return { trend: 'flat', reason: `末期均值约为初期 ${ratio.toFixed(1)} 倍，波动不大` }
}

/** 异常点：单日值与前后 2 天均值偏差 >50%（M4 §2.1） */
function findAnomalies(rows, metric) {
  const out = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const total = Number(r.total) || Number(r.breast_min + (r.formula_ml || 0)) || 0
    const prev = rows.slice(Math.max(0, i - 2), i)
    const next = rows.slice(i + 1, i + 3)
    const ctx = [...prev, ...next]
    if (ctx.length === 0 || total === 0) continue
    const avg = ctx.reduce((s, x) => s + (Number(x.total) || Number(x.breast_min + (x.formula_ml || 0)) || 0), 0) / ctx.length
    if (avg > 0 && Math.abs(total - avg) / avg > 0.5) {
      out.push({ date: r.date, metric, value: total, avg: Math.round(avg), note: `当日数值与前后 2 天均值偏差超过 50%，请确认是否误录` })
    }
  }
  return out
}

// ---------- summary 的逐日/分段明细（周/月总结"先每天/先每周、后汇总"的数据底座） ----------

/** ISO 日期字符串的纯算术（基于 UTC，避免本地时区与 DB 时区错位一天） */
const parseDate = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
const fmtDate = (ms) => {
  const dt = new Date(ms)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}
const addDaysStr = (s, n) => fmtDate(parseDate(s) + n * 86400000)

/** 单维按天行 → daily 合并字段（>0 才写入）。单位：配方奶 ml / 母乳与睡眠 min / 活动 min */
function digestPatch(metric, row) {
  const patch = {}
  const put = (key, raw) => {
    const n = Math.round(Number(raw) || 0)
    if (n > 0) patch[key] = n
  }
  if (metric === 'feeding') {
    put('formula_ml', row.formula_ml)
    put('breast_min', row.breast_min)
    put('food_count', row.food_count)
  } else if (metric === 'sleep') put('sleep_min', row.total)
  else if (metric === 'activity') put('activity_min', row.total)
  else if (metric === 'diaper') put('diaper_count', row.count)
  else if (metric === 'symptom') put('symptom_count', row.count)
  else if (metric === 'growth') put('growth_count', row.count)
  else if (metric === 'health') put('health_count', row.count)
  else if (metric === 'medical') put('medical_count', row.count)
  return patch
}

/** 长窗口（>14 天）按约 7 天一段聚合，供月总结"分周简述"。todayStr 取 DB CURDATE()（与查询同时区） */
function buildWeeks(dayMap, windowDays, todayStr) {
  const rowsAll = [...dayMap.values()]
  if (!rowsAll.length) return []
  const start = addDaysStr(todayStr, -(windowDays - 1))
  const weeks = []
  let from = start
  while (from <= todayStr) {
    const to = addDaysStr(from, 6) > todayStr ? todayStr : addDaysStr(from, 6)
    const rows = rowsAll.filter((r) => r.date >= from && r.date <= to)
    if (rows.length) {
      const sum = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0)
      const daysWith = (pred) => rows.filter(pred).length
      const w = { from, to, record_days: rows.length }
      const add = (k, v) => {
        const n = Math.round(Number(v) || 0)
        if (n > 0) w[k] = n
      }
      add('formula_ml', sum('formula_ml'))
      add('breast_min', sum('breast_min'))
      add('sleep_min', sum('sleep_min'))
      add('activity_min', sum('activity_min'))
      add('food_count', sum('food_count'))
      add('diaper_count', sum('diaper_count'))
      add('symptom_count', sum('symptom_count'))
      add('growth_count', sum('growth_count'))
      add('health_count', sum('health_count'))
      add('feed_days', daysWith((r) => (r.formula_ml || 0) > 0 || (r.breast_min || 0) > 0))
      add('sleep_days', daysWith((r) => (r.sleep_min || 0) > 0))
      add('activity_days', daysWith((r) => (r.activity_min || 0) > 0))
      weeks.push(w)
    }
    from = addDaysStr(to, 1)
  }
  return weeks
}

async function trendAnalysis(babyId, metric, days) {
  if (!metric) return { ok: false, error: 'trend 需要指定 metric（metrics[0] 或 metric）' }
  const res = await queryMetric(babyId, metric, days, 'trend')
  if (!res.hasData) return { ok: true, scope: 'trend', metric, days: res.days, hasData: false, note: '窗口内无记录' }
  const j = judgeTrend(res.rows)
  const anomalies = findAnomalies(res.rows, metric)
  const last = res.rows[res.rows.length - 1]
  return {
    ok: true,
    scope: 'trend',
    metric,
    days: res.days,
    hasData: true,
    trend: j.trend,
    trendReason: j.reason,
    keyNumbers: last ? { lastDate: last.date, lastCount: last.count } : null,
    anomalies,
    rows: res.rows,
  }
}

async function summaryAnalysis(babyId, metrics, days) {
  const windowDays = Math.max(1, Math.min(90, Number(days) || 7))
  const dims = metrics && metrics.length ? metrics : METRICS
  const dimensions = []
  const anomalies = []
  const dayMap = new Map() // date → 当日各维合并字段（digestPatch 只写 >0）
  let totalCount = 0

  // 分段锚点用 DB CURDATE()，与查询时间窗同一时区，避免本地/DB 差一天
  let todayStr = null
  const db = getDb()
  if (db) {
    try {
      const [[row]] = await db.query('SELECT CURDATE() AS d')
      todayStr = row?.d || null
    } catch { /* 忽略 */ }
  }
  const today = todayStr || fmtDate(Date.now())

  for (const metric of dims) {
    const res = await queryMetric(babyId, metric, windowDays, 'count')
    totalCount += res.count
    const brief = { hasData: res.count > 0 }
    let metricDays = 0
    if (res.count > 0 && metric !== 'growth' && metric !== 'symptom') {
      const agg = await queryMetric(babyId, metric, windowDays, 'sum')
      brief.summary = agg.summary
    }
    if (res.count > 0) {
      const tr = await queryMetric(babyId, metric, windowDays, 'trend')
      metricDays = tr.rows.filter((r) => Number(r.count) > 0).length
      for (const r of tr.rows) {
        if (!Number(r.count)) continue
        const date = String(r.date)
        const cur = dayMap.get(date) || { date }
        Object.assign(cur, digestPatch(metric, r))
        dayMap.set(date, cur)
      }
      anomalies.push(...findAnomalies(tr.rows, metric))
    }
    dimensions.push({ metric, label: METRIC_LABELS[metric], ...brief, days: metricDays, count: res.count })
  }

  const daily = [...dayMap.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
  return {
    ok: true,
    scope: 'summary',
    days: windowDays,
    dimensions,
    daily, // 逐日明细（仅列出当天有记录且 >0 的字段），周总结按天简述用
    weeks: windowDays > 14 ? buildWeeks(dayMap, windowDays, today) : [], // 约 7 天一段，月总结分周简述用
    anomalies,
    note: `数据来自最近 ${windowDays} 天各类记录共 ${totalCount} 条`,
  }
}

async function growthAnalysis(babyId, days) {
  const res = await queryMetric(babyId, 'growth', days, 'list')
  if (!res.hasData) return { ok: true, scope: 'growth', days: res.days, hasData: false, note: '窗口内无生长测量记录' }
  // getBabyProfile 返回的是画像聚合对象，档案字段在 basic 下（2026-09-19 收敛后）
  const basic = (await getBabyProfile(babyId))?.basic
  if (!basic) return { ok: true, scope: 'growth', days: res.days, hasData: false, note: '缺少宝宝档案（性别/出生日期），无法解读生长曲线' }

  // growth_record 数值：weight_g（克→kg）、height_mm（毫米→cm）
  const sorted = [...res.rows].sort((a, b) => new Date(a.record_date) - new Date(b.record_date))
  const last = sorted[sorted.length - 1]
  const first = sorted[0]
  const sex = basic.gender === 'female' ? 'female' : 'male'
  // 百分位按「测量当天月龄」计算（历史测量不能用当前月龄，否则百分位偏移）
  const months = ageInMonths(basic.birthDate, last.record_date)

  const out = { ok: true, scope: 'growth', days: res.days, hasData: true, months, measuredAt: last.record_date, sex, ref: '中国2023儿科生长参考' }
  if (last.weight_g != null) {
    const wKg = Number(last.weight_g) / 1000
    const firstKg = first.weight_g != null ? Number(first.weight_g) / 1000 : null
    const g = percentileOf(months, sex, 'weight', wKg)
    out.weight = {
      lastKg: wKg,
      measuredAt: last.record_date,
      deltaKg: firstKg != null ? Math.round((wKg - firstKg) * 100) / 100 : null,
      p: g.p,
      percentile: g.percentile,
    }
  } else {
    out.weight = null
  }
  if (last.height_mm != null) {
    const hCm = Number(last.height_mm) / 10
    const firstCm = first.height_mm != null ? Number(first.height_mm) / 10 : null
    const g = percentileOf(months, sex, 'height', hCm)
    out.height = {
      lastCm: hCm,
      measuredAt: last.record_date,
      deltaCm: firstCm != null ? Math.round((hCm - firstCm) * 10) / 10 : null,
      p: g.p,
      percentile: g.percentile,
    }
  } else {
    out.height = null
  }
  if (!out.weight && !out.height) {
    return { ok: true, scope: 'growth', days: res.days, hasData: false, note: '记录不足以解读生长曲线（缺体重/身高数值）' }
  }
  return out
}

export async function executeAnalyzeBabyData(input, ctx) {
  const babyId = ctx?.babyId
  if (!babyId) return JSON.stringify({ ok: false, error: '缺少 babyId 上下文' })
  try {
    if (input.scope === 'trend') return JSON.stringify(await trendAnalysis(babyId, input.metrics?.[0] || input.metric, input.days))
    if (input.scope === 'summary') return JSON.stringify(await summaryAnalysis(babyId, input.metrics, input.days))
    if (input.scope === 'growth') return JSON.stringify(await growthAnalysis(babyId, input.days))
    return JSON.stringify({ ok: false, error: `不支持的 scope: ${input.scope}` })
  } catch (e) {
    console.error('[analyze] ERROR:', e?.stack || e)
    return JSON.stringify({ ok: false, error: (e?.message || String(e)).slice(0, 300) })
  }
}
