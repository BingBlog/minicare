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
  const dims = metrics && metrics.length ? metrics : METRICS
  const dimensions = []
  const anomalies = []
  let totalCount = 0
  for (const metric of dims) {
    const res = await queryMetric(babyId, metric, days, 'count')
    totalCount += res.count
    let brief = { hasData: res.count > 0 }
    if (res.count > 0 && metric !== 'growth' && metric !== 'symptom') {
      const agg = await queryMetric(babyId, metric, days, 'sum')
      brief.summary = agg.summary
    }
    dimensions.push({ metric, label: METRIC_LABELS[metric], ...brief, count: res.count })
    // 异常：趋势维度 >4 天时检查
    if (res.count > 0) {
      const tr = await queryMetric(babyId, metric, days, 'trend')
      anomalies.push(...findAnomalies(tr.rows, metric))
    }
  }
  return {
    ok: true,
    scope: 'summary',
    days,
    dimensions,
    anomalies,
    note: `数据来自最近 ${days} 天各类记录共 ${totalCount} 条`,
  }
}

/** 从 baby_profile 取性别与出生日期 */
async function getBabyProfile(babyId) {
  const db = getDb()
  if (!db) return null
  try {
    const [[row]] = await db.query(
      'SELECT gender, birth_date FROM baby_profile WHERE id=? AND deleted_at IS NULL',
      [babyId],
    )
    return row || null
  } catch {
    return null
  }
}

/** 月龄（默认按当前日期；传 atDate 可按测量日期计算） */
function ageInMonths(birthDate, atDate = null) {
  const b = new Date(birthDate)
  const at = atDate
    ? (atDate instanceof Date ? atDate : new Date(String(atDate).slice(0, 10) + 'T00:00:00'))
    : new Date()
  let months = (at.getFullYear() - b.getFullYear()) * 12 + (at.getMonth() - b.getMonth())
  if (at.getDate() < b.getDate()) months -= 1
  return Math.max(0, months)
}

async function growthAnalysis(babyId, days) {
  const res = await queryMetric(babyId, 'growth', days, 'list')
  if (!res.hasData) return { ok: true, scope: 'growth', days: res.days, hasData: false, note: '窗口内无生长测量记录' }
  const profile = await getBabyProfile(babyId)
  if (!profile) return { ok: true, scope: 'growth', days: res.days, hasData: false, note: '缺少宝宝档案（性别/出生日期），无法解读生长曲线' }

  // growth_record 数值：weight_g（克→kg）、height_mm（毫米→cm）
  const sorted = [...res.rows].sort((a, b) => new Date(a.record_date) - new Date(b.record_date))
  const last = sorted[sorted.length - 1]
  const first = sorted[0]
  const sex = profile.gender === 'female' ? 'female' : 'male'
  // 百分位按「测量当天月龄」计算（历史测量不能用当前月龄，否则百分位偏移）
  const months = ageInMonths(profile.birth_date, last.record_date)

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
