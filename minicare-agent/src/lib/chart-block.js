/**
 * chart-block.js — 图表块生成器（TECH-028 §2.3 / PRD-013 US-04 · US-05）
 *
 * 纯函数（无 IO）：从「工具名 + 调用入参 + 工具 output（JSON 字符串）」确定性生成图表块。
 * 由 runtime 在 tool_result 后调用，经 chat.js 以 SSE `block` 事件下发（前端渲染见 ChatChartCard）。
 *
 * 职责边界（PRD-013 横向规则 R3）：**只装数据、不装信号**；数值直接取自工具输出，
 * 不做任何二次计算（保证图与文字口径必然一致）；资格不足（<3 个有效点 / 生长 <1 测量点）静默不出图。
 *
 * 图型枚举（前端契约）：line | bar | mixed | growth
 * 默认口径（TECH-028 D3 / §5）：
 *   analyze scope=trend   → line（模型可改选 bar）
 *   analyze scope=summary → mixed（多序列合成，不拆多图）
 *   analyze scope=growth  → growth（宝宝散点 + P3/P50/P97 参考曲线）
 *   query（aggregate=trend）→ 默认不出图，模型显式声明 chart 才出
 *   任何场景 `chart:'none'` → 关闭出图
 */
import { randomUUID } from 'node:crypto'
import { getStandardAtAge } from './growth.js'

/** metric → 分析页 Tab（US-07 跳转预选；无对应 Tab 的维度不产生 source.tab） */
const METRIC_TO_TAB = {
  feeding: 'feeding',
  sleep: 'sleep',
  diaper: 'diaper',
  growth: 'growth',
  health: 'health',
}

/** 单值有效判定：存在且数值 > 0（各维度 0 值均无展示意义） */
const isValid = (v) => v != null && Number.isFinite(Number(v)) && Number(v) > 0

/** 分钟 → 小时（1 位小数） */
const minToHour = (min) => Math.round((Number(min) / 60) * 10) / 10

/**
 * trend 行 → 单序列（各 metric 的取值优先级不同）。
 * @returns {{ name, unit, points: [string, number][] } | null} 有效点 <3 时返回 null
 */
function extractTrendSeries(metric, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null
  const pick = (field, map) =>
    rows.filter((r) => isValid(r[field])).map((r) => [String(r.date), map(r[field])])

  if (metric === 'feeding') {
    // 三档降级：配方奶量 → 母乳时长 → 喂养次数（纯母乳/纯辅食宝宝也能出图）
    const f = pick('formula_ml', Math.round)
    if (f.length >= 3) return { name: '配方奶量', unit: 'ml', points: f }
    const b = pick('breast_min', Math.round)
    if (b.length >= 3) return { name: '母乳时长', unit: '分钟', points: b }
    const c = pick('count', Number)
    if (c.length >= 3) return { name: '喂养次数', unit: '次', points: c }
    return null
  }
  if (metric === 'sleep') {
    const p = pick('total', minToHour)
    return p.length >= 3 ? { name: '睡眠时长', unit: '小时', points: p } : null
  }
  if (metric === 'diaper') {
    const p = pick('count', Number)
    return p.length >= 3 ? { name: '尿布次数', unit: '次', points: p } : null
  }
  if (metric === 'health') {
    const p = pick('total', (v) => Number(Number(v).toFixed(1)))
    return p.length >= 3 ? { name: '体温', unit: '°C', points: p } : null
  }
  if (metric === 'activity') {
    const p = pick('total', Math.round)
    return p.length >= 3 ? { name: '活动时长', unit: '分钟', points: p } : null
  }
  if (metric === 'symptom') {
    const p = pick('count', Number)
    return p.length >= 3 ? { name: '表现记录', unit: '次', points: p } : null
  }
  return null // growth / medical / medication 不走 trend 图
}

/** trend 场景构建（analyze trend 与 query trend 共用） */
function buildTrend(input, parsed) {
  const metric = String(parsed.metric || '')
  const series = extractTrendSeries(metric, parsed.rows)
  if (!series) return null
  const chartType = input?.chart === 'bar' ? 'bar' : 'line'
  const days = Number(parsed.days) || Number(input?.days) || 7
  return {
    chartType,
    title: `${series.name}趋势`,
    series: [{ ...series, kind: chartType, axis: 0 }],
    caption: `最近 ${days} 天 · 共 ${series.points.length} 天有记录`,
    source: METRIC_TO_TAB[metric] ? { tab: METRIC_TO_TAB[metric], range: String(days) } : undefined,
  }
}

/**
 * summary 场景构建（周报/月报）：
 * 奶量柱 + 睡眠线 双序列 → mixed；仅一个序列达标 → 该序列单图；均不达标 → null。
 */
function buildSummary(parsed) {
  const daily = Array.isArray(parsed.daily) ? parsed.daily : []
  const milk = daily.filter((r) => isValid(r.formula_ml)).map((r) => [String(r.date), Math.round(r.formula_ml)])
  const sleep = daily.filter((r) => isValid(r.sleep_min)).map((r) => [String(r.date), minToHour(r.sleep_min)])
  const days = Number(parsed.days) || 7
  const caption = `最近 ${days} 天 · 共 ${daily.length} 天有记录`

  if (milk.length >= 3 && sleep.length >= 3) {
    return {
      chartType: 'mixed',
      title: '每日奶量与睡眠',
      series: [
        { name: '每日奶量', unit: 'ml', kind: 'bar', axis: 0, points: milk },
        { name: '每日睡眠', unit: '小时', kind: 'line', axis: 1, points: sleep },
      ],
      caption,
    }
  }
  if (milk.length >= 3) {
    return {
      chartType: 'bar',
      title: '每日奶量',
      series: [{ name: '每日奶量', unit: 'ml', kind: 'bar', axis: 0, points: milk }],
      caption,
    }
  }
  if (sleep.length >= 3) {
    return {
      chartType: 'line',
      title: '每日睡眠',
      series: [{ name: '每日睡眠', unit: '小时', kind: 'line', axis: 0, points: sleep }],
      caption,
    }
  }
  return null
}

/**
 * growth 场景构建：宝宝测量散点 + P3/P50/P97 参考曲线（逐月插值，中国 2023 标准）。
 * 依赖 analyze(growth) 输出新增的 `series`（全量测量点）与 `sex` 字段。
 */
function buildGrowth(parsed) {
  const all = Array.isArray(parsed.series) ? parsed.series : []
  const sex = parsed.sex === 'female' ? 'female' : 'male'
  const useWeight = all.some((p) => p.weightKg != null)

  const points = all
    .map((p) => [Math.round(Number(p.months) * 10) / 10, useWeight ? p.weightKg : p.heightCm])
    .filter(([m, v]) => Number.isFinite(m) && v != null && Number.isFinite(Number(v)))
    .map(([m, v]) => [m, Number(v)])
    .sort((a, b) => a[0] - b[0])
  if (points.length < 1) return null

  const maxMonth = Math.min(36, Math.ceil(Math.max(...points.map((p) => p[0]))) + 1)
  const refSeries = (idx, name) => {
    const pts = []
    for (let m = 0; m <= maxMonth; m += 1) {
      const std = getStandardAtAge(sex, m)
      if (!std) continue
      const arr = useWeight ? std.w : std.h
      if (arr && Number.isFinite(arr[idx])) pts.push([m, arr[idx]])
    }
    return { name, unit: useWeight ? 'kg' : 'cm', kind: 'line', axis: 0, ref: true, points: pts }
  }

  return {
    chartType: 'growth',
    title: useWeight ? '生长曲线 · 体重' : '生长曲线 · 身高',
    series: [
      { name: '宝宝', unit: useWeight ? 'kg' : 'cm', kind: 'scatter', axis: 0, points },
      refSeries(0, 'P3'),
      refSeries(2, 'P50'),
      refSeries(4, 'P97'),
    ],
    caption: `共 ${points.length} 次测量 · 参考：中国2023标准`,
    source: { tab: 'growth', range: 'birth' },
  }
}

/**
 * 主入口：由 runtime 在 tool_result 后调用。
 * @param {{ toolName: string, input?: object, output?: string }} args
 * @returns {object|null} 图表块（含 id/type）或 null（不出图）
 */
export function buildChartBlock({ toolName, input = {}, output }) {
  if (!output || typeof output !== 'string') return null
  let parsed
  try {
    parsed = JSON.parse(output)
  } catch {
    return null
  }
  if (!parsed || parsed.ok === false || !parsed.hasData) return null

  // 显式关闭优先（D3）
  if (input?.chart === 'none') return null

  let built = null
  if (toolName === 'analyze_baby_data') {
    if (parsed.scope === 'trend') built = buildTrend(input, parsed)
    else if (parsed.scope === 'summary') built = buildSummary(parsed)
    else if (parsed.scope === 'growth') built = buildGrowth(parsed)
  } else if (toolName === 'query_baby_data') {
    // query 场景默认不出图：仅模型显式声明且为趋势数据时才出
    if (input?.chart && input.chart !== 'none' && parsed.aggregate === 'trend') {
      built = buildTrend(input, parsed)
    }
  }
  if (!built) return null
  return { id: `blk_${randomUUID().slice(0, 8)}`, type: 'chart', ...built }
}
