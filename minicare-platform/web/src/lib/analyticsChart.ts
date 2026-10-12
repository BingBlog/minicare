/**
 * 用户分析域的 ECharts option 构建器（TECH-033 §6.4）。
 *
 * 三条统一约定，全部为了「读数不出错」而不是好看：
 *
 * 1. **颜色用字面量，不用 CSS 变量** —— ECharts 走 Canvas 渲染，`var(--accent)` 解析不了，
 *    会静默退化成黑色。下面的 `C` 与 `styles.css` 的 `:root` 令牌逐值对齐；
 * 2. **不用 `dataset`** —— `lib/echarts.ts` 没有注册 `DatasetComponent`（按需引入的代价），
 *    直接用 `series.data`；
 * 3. **保留空窗** —— 日序列里"某天完全没人用"必须是 0 点而不是断线；折线的 `connectNulls`
 *    一律关闭，缺失就是缺失，不做插值。
 */
import type { EChartsOption } from './echarts'
import type { DayPoint, FeatureItem, FeatureView, WeekPoint } from './analytics'
import { DASH } from './analytics'

/** 与 `styles.css` 的 `:root` 令牌逐值对齐（Canvas 里不能用 CSS 变量） */
const C = {
  accent: '#2f6fb0',
  accentSoft: '#8fb8dc',
  accentFaint: '#cfe1f1',
  warn: '#8a540b',
  warnSoft: '#c99b53',
  ok: '#3f6e15',
  text: '#2f2c2a',
  text2: '#6b6560',
  text3: '#98928c',
  line: '#e5e3dd',
  surface: '#ffffff',
} as const

const FONT = 11

/** 坐标轴/网格的公共样式 */
const AXIS = {
  axisLine: { lineStyle: { color: C.line } },
  axisTick: { show: false },
  axisLabel: { color: C.text3, fontSize: FONT },
} as const

const TOOLTIP = {
  trigger: 'axis' as const,
  backgroundColor: C.surface,
  borderColor: C.line,
  borderWidth: 1,
  textStyle: { color: C.text, fontSize: 12 },
  axisPointer: { type: 'line' as const, lineStyle: { color: C.accentFaint } },
}

const GRID = { left: 8, right: 14, top: 24, bottom: 4, containLabel: true } as const

/** 轴标签：`2026-10-12` → `10-12`（横轴太挤，年份无信息量） */
const shortDay = (d: string) => (d.length >= 10 ? d.slice(5) : d)

/**
 * 日活跃趋势：DAU（面积折线）+ 活跃家庭（同轴第二条线）+ 7 日移动平均（虚线）。
 *
 * 三条设计取舍：
 *   · **保留 0 点**：日序列里"某天完全没人用"必须是 0 而不是断点；`connectNulls` 一律关闭，
 *     缺失就是缺失，不做插值 —— 空窗本身就是要传达的信息；
 *   · **活跃家庭与活跃用户共用一根 y 轴**：两者都是"当日去重实体数"，量级相近（本库 1~2 vs 3~7），
 *     同轴才能直接读出差距；差距来自口径（家庭维度只能走 `record_timeline`），页面另行说明；
 *   · **只给用户口径画均线**：均线是用来判断"单日是不是真掉了"的辅助线，两条都画会变成 4 条线，
 *     4 条线的图没人读。家庭曲线保持素线。
 */
export function dailyLineOption(series: DayPoint[], families?: DayPoint[]): EChartsOption {
  const dates = series.map((p) => shortDay(p.date))
  const dense = series.length <= 45

  return {
    grid: GRID,
    tooltip: { ...TOOLTIP },
    legend: {
      show: true,
      top: 0,
      right: 0,
      itemWidth: 14,
      itemHeight: 8,
      textStyle: { color: C.text2, fontSize: FONT },
    },
    xAxis: { type: 'category', boundaryGap: false, data: dates, ...AXIS },
    yAxis: {
      type: 'value',
      minInterval: 1, // 人数没有小数刻度
      splitLine: { lineStyle: { color: C.line, type: 'dashed' } },
      ...AXIS,
    },
    series: [
      {
        name: '活跃用户',
        type: 'line',
        smooth: false,
        symbol: 'circle',
        symbolSize: 5,
        showSymbol: dense,
        connectNulls: false,
        lineStyle: { width: 2, color: C.accent },
        itemStyle: { color: C.accent },
        areaStyle: { color: C.accentFaint, opacity: 0.55 },
        data: series.map((p) => p.n),
      },
      // 家庭序列缺失时**不补空线** —— 画一条全 0 的线会被读成"没有家庭在用"
      ...(families && families.length
        ? [
            {
              name: '活跃家庭',
              type: 'line',
              smooth: false,
              symbol: 'circle',
              symbolSize: 4,
              showSymbol: dense,
              connectNulls: false,
              lineStyle: { width: 1.8, color: C.ok },
              itemStyle: { color: C.ok },
              data: families.map((p) => p.n),
            },
          ]
        : []),
      {
        name: '7 日均线',
        type: 'line',
        smooth: true,
        symbol: 'none',
        connectNulls: false,
        lineStyle: { width: 1.5, color: C.warnSoft, type: 'dashed' },
        itemStyle: { color: C.warnSoft },
        data: series.map((p) => p.ma7 ?? null),
      },
    ],
  }
}

/** 周序列柱状（新增用户 / 新增记录）。x 轴 = 周次。 */
export function weeklyBarOption(points: WeekPoint[], color: string = C.accent): EChartsOption {
  return {
    grid: GRID,
    tooltip: { ...TOOLTIP, axisPointer: { type: 'shadow' } },
    xAxis: { type: 'category', data: points.map((p) => p.start.slice(5)), ...AXIS },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: C.line, type: 'dashed' } },
      ...AXIS,
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 26,
        itemStyle: { color, borderRadius: [3, 3, 0, 0] },
        data: points.map((p) => p.n),
      },
    ],
  }
}

/** 视角 → 取值与 formatting */
export function featureValue(item: FeatureItem, view: FeatureView): number | null {
  if (view === 'count') return item.records
  if (view === 'penetration') return item.penetration
  return item.per_user
}

export function featureValueText(item: FeatureItem, view: FeatureView): string {
  const v = featureValue(item, view)
  if (v === null || v === undefined) return DASH
  if (view === 'count') return String(v)
  if (view === 'penetration') return `${(v * 100).toFixed(1)}%`
  return v.toFixed(1)
}

/**
 * 功能排行横条。
 *
 * ⚠️ 两个刻意的处理：
 *   · **横向柱状 + 文字标签常驻**。条长按最大值归一化，但数值**永远以文字给出** ——
 *     功能分布是典型的"长尾"（喂养 200+ 条 vs 活动记录 0 条），只靠条长会让尾巴看起来是 0；
 *   · `count_only` 功能（无用户维度）在渗透率视角下**不参与**，因此这里过滤掉，
 *     由页面用文字标注"该功能不计入人数口径"，而不是画一根 0 长的条。
 */
export function featureBarOption(items: FeatureItem[], view: FeatureView): EChartsOption {
  const usable = items.filter((it) => featureValue(it, view) !== null)
  // 倒序：ECharts 的 category 轴自下而上，反着喂才是"最大在最上面"
  const rows = [...usable].reverse()

  return {
    grid: { left: 8, right: 56, top: 6, bottom: 4, containLabel: true },
    tooltip: { ...TOOLTIP, axisPointer: { type: 'shadow' } },
    xAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: C.line, type: 'dashed' } },
      ...AXIS,
      axisLabel: {
        color: C.text3,
        fontSize: FONT,
        formatter: (v: number) => (view === 'penetration' ? `${Math.round(v * 100)}%` : String(v)),
      },
    },
    yAxis: {
      type: 'category',
      data: rows.map((it) => it.label),
      ...AXIS,
      axisLabel: { color: C.text2, fontSize: FONT },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 16,
        itemStyle: { color: C.accentSoft, borderRadius: [0, 3, 3, 0] },
        label: {
          show: true,
          position: 'right',
          color: C.text2,
          fontSize: FONT,
          formatter: (p: { dataIndex: number }) => featureValueText(rows[p.dataIndex], view),
        },
        data: rows.map((it) => featureValue(it, view)),
      },
    ],
  }
}

/** 单功能日趋势（功能分析页行展开） */
export function trendLineOption(series: { date: string; n: number; users: number }[], label: string): EChartsOption {
  return {
    grid: GRID,
    tooltip: { ...TOOLTIP },
    legend: {
      show: true,
      top: 0,
      right: 0,
      itemWidth: 14,
      itemHeight: 8,
      textStyle: { color: C.text2, fontSize: FONT },
    },
    xAxis: { type: 'category', boundaryGap: false, data: series.map((p) => shortDay(p.date)), ...AXIS },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: C.line, type: 'dashed' } },
      ...AXIS,
    },
    series: [
      {
        name: `${label} · 条数`,
        type: 'line',
        smooth: false,
        symbol: 'circle',
        symbolSize: 5,
        showSymbol: series.length <= 45,
        connectNulls: false,
        lineStyle: { width: 2, color: C.accent },
        itemStyle: { color: C.accent },
        areaStyle: { color: C.accentFaint, opacity: 0.5 },
        data: series.map((p) => p.n),
      },
      {
        name: '使用人数',
        type: 'line',
        smooth: false,
        symbol: 'none',
        connectNulls: false,
        lineStyle: { width: 1.5, color: C.warnSoft, type: 'dashed' },
        itemStyle: { color: C.warnSoft },
        data: series.map((p) => p.users),
      },
    ],
  }
}

/** 单用户近 N 天记录分布（用户抽屉） */
export function userSparkOption(series: { date: string; n: number }[]): EChartsOption {
  return {
    grid: { left: 6, right: 10, top: 10, bottom: 2, containLabel: true },
    tooltip: { ...TOOLTIP },
    xAxis: { type: 'category', boundaryGap: false, data: series.map((p) => shortDay(p.date)), ...AXIS },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: C.line, type: 'dashed' } }, ...AXIS },
    series: [
      {
        type: 'line',
        smooth: false,
        symbol: 'none',
        connectNulls: false,
        lineStyle: { width: 2, color: C.accent },
        itemStyle: { color: C.accent },
        areaStyle: { color: C.accentFaint, opacity: 0.5 },
        data: series.map((p) => p.n),
      },
    ],
  }
}

export const CHART_COLORS = C
export { C as PALETTE }
