/**
 * chartBlockToOption — 图表块 → EChartsOption（PRD-013 US-06 / TECH-028 §3.1）
 *
 * 纯函数：把助手下发的 chart 块数据映射为 EcChart 可渲染的 option；
 * 视觉对齐分析页（WARM_TOOLTIP 暖色 tooltip / 主色系 / 浅网格线）。
 *
 * - 趋势类（line/bar/mixed）：x 轴取各序列日期**并集**（升序），序列缺日断点（null）；
 * - 生长类（growth）：x 轴为月龄数值轴，参考线序列（ref=true）静默灰色细线；
 * - mixed 双序列按 axis 0/1 映射左右双 y 轴。
 */
import type { EChartsOption } from '@/lib/echarts'
import type { ChartBlock } from '@/api/agent'
import { WARM_TOOLTIP } from '@/pagesReport/chartTheme'

/** 非参考线序列配色（主色优先） */
const PALETTE = ['#F87098', '#9B8ED8', '#7EC8E3', '#DDB870', '#6BCB77', '#F5A962']
const REF_COLOR = '#D3C7CB'

/** 类目 x 轴显示："YYYY-MM-DD" → "M/D"；生长图 x 为月龄数字原样 */
function fmtCategory(x: string | number): string {
  const s = String(x)
  const parts = s.split('-')
  if (parts.length === 3) return `${Number(parts[1])}/${Number(parts[2])}`
  return s
}

/** 趋势类 tooltip（richText 换行用 \n）：日期行 + 各序列「名称 数值 单位」 */
function makeAxisFormatter(block: ChartBlock) {
  return (ps: Array<{ axisValue?: string; seriesName?: string; value?: unknown; marker?: string }>) => {
    if (!ps || !ps.length) return ''
    const lines = ps.map((p) => {
      const s = block.series.find((x) => x.name === p.seriesName)
      const unit = s?.unit ? ` ${s.unit}` : ''
      return `${p.marker ?? ''}${p.seriesName ?? ''} ${p.value == null ? '—' : p.value}${unit}`
    })
    return [ps[0].axisValue ?? '', ...lines].join('\n')
  }
}

export function chartBlockToOption(block: ChartBlock): EChartsOption | null {
  if (!block || !Array.isArray(block.series) || block.series.length === 0) return null
  const isGrowth = block.chartType === 'growth'

  // ── x 轴 ──
  // 趋势类：日期并集（多序列各自有缺日时不错位）
  const dates = isGrowth
    ? []
    : Array.from(new Set(block.series.flatMap((s) => s.points.map((p) => String(p[0]))))).sort()
  const xAxis = isGrowth
    ? {
        type: 'value' as const,
        name: '月龄',
        nameTextStyle: { fontSize: 9, color: '#C0A8AD' },
        axisLabel: {
          fontSize: 10,
          color: '#C0A8AD',
          formatter: (v: number) => `${Math.round(v * 10) / 10}月`,
        },
        splitLine: { lineStyle: { color: '#F5F0F2' } },
      }
    : {
        type: 'category' as const,
        data: dates.map(fmtCategory),
        axisLabel: { fontSize: 10, color: '#C0A8AD' },
        axisLine: { lineStyle: { color: '#F5F0F2' } },
      }

  // ── y 轴（mixed 图有 axis=1 序列时为双轴）──
  const mainUnit = block.series.find((s) => !s.ref && s.axis !== 1)?.unit ?? ''
  const rightSeries = block.series.find((s) => !s.ref && s.axis === 1)
  const yBase = {
    type: 'value' as const,
    axisLabel: { fontSize: 10, color: '#C0A8AD' },
    splitLine: { lineStyle: { color: '#F5F0F2' } },
  }
  const yAxis = rightSeries
    ? [
        { ...yBase, name: mainUnit, nameTextStyle: { fontSize: 9, color: '#C0A8AD' } },
        { ...yBase, name: rightSeries.unit, nameTextStyle: { fontSize: 9, color: '#C0A8AD' }, splitLine: { show: false } },
      ]
    : { ...yBase, name: mainUnit, nameTextStyle: { fontSize: 9, color: '#C0A8AD' } }

  // ── series ──
  const series = block.series.map((s, i) => {
    const kind = s.kind ?? (block.chartType === 'bar' ? 'bar' : 'line')
    const isRef = !!s.ref
    const color = isRef ? REF_COLOR : PALETTE[i % PALETTE.length]
    const data = isGrowth
      ? s.points.map((p) => [Number(p[0]), p[1]])
      : dates.map((d) => {
          const hit = s.points.find((p) => String(p[0]) === d)
          return hit ? hit[1] : null
        })
    const common = { name: s.name, yAxisIndex: s.axis === 1 ? 1 : 0 }
    if (isRef) {
      return { ...common, type: 'line' as const, data, symbol: 'none' as const, silent: true, lineStyle: { color, width: 1 } }
    }
    if (kind === 'scatter') {
      return {
        ...common, type: 'scatter' as const, data, symbolSize: 7, z: 10,
        itemStyle: { color, borderColor: '#fff', borderWidth: 1.5 },
      }
    }
    if (kind === 'bar') {
      return { ...common, type: 'bar' as const, data, itemStyle: { color }, barMaxWidth: 16 }
    }
    return {
      ...common, type: 'line' as const, data, smooth: true, symbol: 'circle', symbolSize: 3,
      lineStyle: { color, width: 2 }, itemStyle: { color },
    }
  })

  return {
    tooltip: {
      ...WARM_TOOLTIP,
      trigger: isGrowth ? ('item' as const) : ('axis' as const),
      ...(isGrowth ? {} : { formatter: makeAxisFormatter(block) }),
    },
    legend:
      block.series.length > 1
        ? {
            data: block.series.map((s) => s.name),
            bottom: 0,
            textStyle: { fontSize: 9, color: '#9A8090' },
            itemWidth: 14,
            itemHeight: 7,
            itemGap: 8,
          }
        : undefined,
    grid: { left: 8, right: 8, top: 14, bottom: block.series.length > 1 ? 26 : 6, containLabel: true },
    xAxis,
    yAxis,
    series,
  } as EChartsOption
}
