/**
 * 饮食分析 Tab（MP 版，与 Web pages/report/tabs/FeedingTab.tsx 对齐）
 *
 * 使用 ECharts (echarts-for-weixin pattern) 替代 View-based 伪图表。
 * 业务逻辑（计算、洞察文案）与 Web 完全一致。
 */
import { View, Text } from '@tarojs/components'
import { useMemo } from 'react'
import EcChart from '@/components/EcChart'
import { WARM_TOOLTIP } from '@/pagesReport/chartTheme'
import type { DailyFeedingData } from '@/api/report'
import { formatDateSlash, nowDate } from '@/lib/utils'

// ── 奶粉类型配置（L1，与 Web milkTypeOptions 一致）─────────────────

const milkTypeOptions = [
  { key: 'aa', label: '氨基酸奶粉', color: '#F87098' },
  { key: 'eh_no_lactose', label: '深度水解（无乳糖）', color: '#7B6EC8' },
  { key: 'eh_lactose', label: '深度水解（含乳糖）', color: '#9B8ED8' },
  { key: 'ph', label: '适度水解奶粉', color: '#DDB870' },
  { key: 'std', label: '普通奶粉', color: '#4CAF82' },
]

const UNLABELED_MILK_KEY = 'unlabeled'

function milkTypeLabel(key: string): string {
  if (key === UNLABELED_MILK_KEY) return '未标注'
  return milkTypeOptions.find(o => o.key === key)?.label ?? key
}

function milkTypeColor(key: string): string {
  return milkTypeOptions.find(o => o.key === key)?.color ?? '#9CA3AF'
}


interface FeedingTabProps {
  data: DailyFeedingData[] | null
  loading: boolean
}

const CARD = {
  background: '#fff', borderRadius: 12, padding: 14, marginBottom: 12,
  boxShadow: '0 1px 4px rgba(200,100,120,0.06)',
}

export function FeedingTab({ data, loading }: FeedingTabProps) {
  const milkSeries = useMemo(() => {
    if (!data?.length) return null
    const totals: Record<string, number> = {}
    for (const d of data) {
      const m = d.formulaMlByMilkType
      if (!m) continue
      for (const [k, v] of Object.entries(m)) {
        totals[k] = (totals[k] ?? 0) + v
      }
    }
    const keys = Object.keys(totals).filter(k => totals[k] > 0)
    keys.sort((a, b) => totals[b] - totals[a])
    return {
      order: keys,
      colors: Object.fromEntries(keys.map(k => [k, milkTypeColor(k)])),
      labels: Object.fromEntries(keys.map(k => [k, milkTypeLabel(k)])),
    }
  }, [data])

  const lineOption = useMemo(() => {
    if (!data?.length) return {}
    return {
      tooltip: {
        ...WARM_TOOLTIP,
        trigger: 'axis' as const,
        formatter: (ps: Array<{ axisValue?: string; value?: unknown }>) => {
          if (!ps?.length) return ''
          return `${ps[0].axisValue ?? ''} · 配方奶 ${Number(ps[0].value) || 0}ml`
        },
      },
      grid: { left: 12, right: 12, top: 8, bottom: 24, containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: data.map(d => formatDateSlash(d.date)),
        axisLabel: { fontSize: 10, color: '#C0A8AD' },
        axisLine: { lineStyle: { color: '#F5F0F2' } },
      },
      yAxis: {
        type: 'value' as const,
        axisLabel: { fontSize: 10, color: '#C0A8AD', formatter: (v: number) => `${Math.round(v)}ml` },
        splitLine: { lineStyle: { color: '#F5F0F2' } },
      },
      series: [{
        type: 'line' as const,
        data: data.map(d => d.formulaMl),
        smooth: true, symbol: 'circle', symbolSize: 4,
        lineStyle: { color: '#F87098', width: 2 },
        itemStyle: { color: '#F87098' },
        areaStyle: {
          color: {
            type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: 'rgba(248,112,152,0.18)' }, { offset: 1, color: 'rgba(248,112,152,0.01)' }],
          },
        },
      }],
    }
  }, [data])

  const feedTypeOrder = ['母乳', '配方奶', '辅食', '营养素']
  const feedTypeColors: Record<string, string> = { '母乳': '#9B8ED8', '配方奶': '#F87098', '辅食': '#6BCB77', '营养素': '#F4A261' }

  const stackedOption = useMemo(() => {
    if (!data?.length) return {}
    return {
      tooltip: {
        ...WARM_TOOLTIP,
        trigger: 'axis' as const,
        formatter: (ps: Array<{ axisValue?: string; seriesName?: string; value?: unknown }>) => {
          if (!ps?.length) return ''
          const total = ps.reduce((s, p) => s + (Number(p.value) || 0), 0)
          const lines = ps.map(p => `${p.seriesName} ${Number(p.value) || 0} 次`)
          return [`${ps[0].axisValue ?? ''} · 共 ${total} 次`, ...lines].join('\n')
        },
      },
      legend: { data: feedTypeOrder, bottom: 0, textStyle: { fontSize: 10 } },
      grid: { left: 12, right: 12, top: 8, bottom: 36, containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: data.map(d => formatDateSlash(d.date)),
        axisLabel: { fontSize: 10, color: '#C0A8AD' },
        axisLine: { lineStyle: { color: '#F5F0F2' } },
      },
      yAxis: {
        type: 'value' as const,
        axisLabel: { fontSize: 10, color: '#C0A8AD', formatter: (v: number) => `${Math.round(v)}次` },
        splitLine: { lineStyle: { color: '#F5F0F2' } },
      },
      series: feedTypeOrder.map(name => ({
        name, type: 'bar' as const, stack: 'total',
        data: data.map(d => ({
          value: name === '母乳' ? d.breastCount : name === '配方奶' ? Math.round(d.formulaMl / 90) : name === '辅食' ? d.complementaryCount : (d.supplementCount ?? 0),
        })),
        itemStyle: { color: feedTypeColors[name] || '#ccc' },
        barMaxWidth: 28,
      })),
    }
  }, [data])

  const milkStackedOption = useMemo(() => {
    if (!milkSeries || !data?.length) return null
    return {
      tooltip: {
        ...WARM_TOOLTIP,
        trigger: 'axis' as const,
        formatter: (ps: Array<{ axisValue?: string; seriesName?: string; value?: unknown }>) => {
          if (!ps?.length) return ''
          const total = ps.reduce((s, p) => s + (Number(p.value) || 0), 0)
          const lines = ps.map(p => `${p.seriesName} ${Number(p.value) || 0}ml`)
          return [`${ps[0].axisValue ?? ''} · 配方奶 ${total}ml`, ...lines].join('\n')
        },
      },
      legend: { data: milkSeries.order.map(k => milkSeries.labels[k]), bottom: 0, textStyle: { fontSize: 10 } },
      grid: { left: 12, right: 12, top: 8, bottom: 36, containLabel: true },
      xAxis: { type: 'category' as const, data: data.map(d => formatDateSlash(d.date)), axisLabel: { fontSize: 10, color: '#C0A8AD' }, axisLine: { lineStyle: { color: '#F5F0F2' } } },
      yAxis: { type: 'value' as const, axisLabel: { fontSize: 10, color: '#C0A8AD', formatter: (v: number) => `${Math.round(v)}ml` }, splitLine: { lineStyle: { color: '#F5F0F2' } } },
      series: milkSeries.order.map(k => ({ name: milkSeries.labels[k], type: 'bar' as const, stack: 'total', data: data.map(d => d.formulaMlByMilkType?.[k] ?? 0), itemStyle: { color: milkSeries.colors[k] || '#ccc' }, barMaxWidth: 28 })),
    }
  }, [data, milkSeries])

  if (loading) {
    return (
      <View style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
        <Text style={{ color: '#C0A8AD', fontSize: 13 }}>加载中...</Text>
      </View>
    )
  }

  if (!data || data.length === 0) {
    return (
      <View style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '50px 0' }}>
        <Text style={{ color: '#C0A8AD', fontSize: 13, marginBottom: 8 }}>暂无饮食数据</Text>
        <Text style={{ color: '#D8C8D0', fontSize: 11 }}>开始记录宝宝的饮食后，这里将展示分析图表</Text>
      </View>
    )
  }

  const todayYmd = nowDate()
  const hist = data.filter(d => d.date !== todayYmd)
  const histDays = hist.length

  const hasBreast = data.some(d => d.breastCount > 0)
  const hasFormula = data.some(d => d.formulaMl > 0)
  const hasComplementary = data.some(d => d.complementaryCount > 0)
  const hasSupplement = data.some(d => (d.supplementCount ?? 0) > 0)
  const feedTypeVariety = [hasBreast, hasFormula, hasComplementary, hasSupplement].filter(Boolean).length
  const showFeedTypeDistribution = feedTypeVariety >= 2
  const showMilkTypeStacked = milkSeries && milkSeries.order.length >= 2

  const totalFormulaHist = hist.reduce((s, d) => s + d.formulaMl, 0)
  const totalBreastHist = hist.reduce((s, d) => s + d.breastCount, 0)
  const totalFormulaFeedsHist = hist.reduce((s, d) => s + (d.formulaCount ?? 0), 0)
  const totalFeedingSessionsHist = totalBreastHist + totalFormulaFeedsHist
  const totalComplementaryHist = hist.reduce((s, d) => s + d.complementaryCount, 0)

  const avgFormula = histDays > 0 ? Math.round(totalFormulaHist / histDays) : null
  const avgFeedingSessions = histDays > 0 ? Math.round(totalFeedingSessionsHist / histDays) : null
  const avgComplementary = histDays > 0 ? Math.round(totalComplementaryHist / histDays) : null

  return (
    <View>
      {/* 汇总指标卡 */}
      <View style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <View style={{ ...CARD, flex: 1 }}>
          <Text style={{ fontSize: 11, color: '#9A8090', marginBottom: 4, display: 'block' }}>日均奶量</Text>
          {avgFormula != null ? (
            <View style={{ display: 'flex', alignItems: 'baseline' }}>
              <Text style={{ fontSize: 18, fontWeight: 600, color: '#F87098' }}>{avgFormula}</Text>
              <Text style={{ fontSize: 11, color: '#9A8090', marginLeft: 2 }}>ml</Text>
            </View>
          ) : <Text style={{ fontSize: 15, color: '#C0A8AD' }}>—</Text>}
        </View>
        <View style={{ ...CARD, flex: 1 }}>
          <Text style={{ fontSize: 11, color: '#9A8090', marginBottom: 4, display: 'block' }}>日均喂奶次数</Text>
          {avgFeedingSessions != null ? (
            <View style={{ display: 'flex', alignItems: 'baseline' }}>
              <Text style={{ fontSize: 18, fontWeight: 600, color: '#9B8ED8' }}>{avgFeedingSessions}</Text>
              <Text style={{ fontSize: 11, color: '#9A8090', marginLeft: 2 }}>次</Text>
            </View>
          ) : <Text style={{ fontSize: 15, color: '#C0A8AD' }}>—</Text>}
        </View>
        <View style={{ ...CARD, flex: 1 }}>
          <Text style={{ fontSize: 11, color: '#9A8090', marginBottom: 4, display: 'block' }}>日均辅食次数</Text>
          {histDays === 0 ? (
            <Text style={{ fontSize: 15, color: '#C0A8AD' }}>—</Text>
          ) : avgComplementary === 0 ? (
            <Text style={{ fontSize: 11, color: '#C0A8AD', lineHeight: 1.4 }}>还未添加辅食</Text>
          ) : (
            <View style={{ display: 'flex', alignItems: 'baseline' }}>
              <Text style={{ fontSize: 18, fontWeight: 600, color: '#6BCB77' }}>{avgComplementary}</Text>
              <Text style={{ fontSize: 11, color: '#9A8090', marginLeft: 2 }}>次</Text>
            </View>
          )}
        </View>
      </View>

      <Text style={{ fontSize: 10, color: '#C0A8AD', display: 'block', textAlign: 'center', marginBottom: 12 }}>
        日均不含当日，减少当天记录波动影响
      </Text>

      {/* 配方奶量趋势 */}
      <View style={CARD}>
        <Text style={{ fontSize: 13, fontWeight: 500, color: '#4A3035', marginBottom: 8 }}>配方奶量趋势</Text>
        <EcChart option={lineOption} height='260rpx' />
      </View>

      {/* 每日喂养类型分布 */}
      {showFeedTypeDistribution && (
        <View style={CARD}>
          <Text style={{ fontSize: 13, fontWeight: 500, color: '#4A3035', marginBottom: 8 }}>每日喂养类型分布</Text>
          <EcChart option={stackedOption} height='320rpx' />
        </View>
      )}

      {/* 每日配方奶（按奶粉类型） */}
      {showMilkTypeStacked && milkStackedOption && (
        <View style={CARD}>
          <Text style={{ fontSize: 13, fontWeight: 500, color: '#4A3035', marginBottom: 8 }}>每日配方奶（按奶粉类型）</Text>
          <EcChart option={milkStackedOption} height='320rpx' />
        </View>
      )}

      {/* 数据洞察 */}
      <View style={{ ...CARD, background: 'linear-gradient(135deg, #FFF0F4, #F5EEFF)' }}>
        <Text style={{ fontSize: 13, fontWeight: 500, color: '#4A3035', marginBottom: 8 }}>数据洞察</Text>
        <View>
          {avgFormula != null && avgFormula > 0 && (
            <Text style={{ fontSize: 12, color: '#6B6070', lineHeight: 1.6, display: 'block' }}>
              {'\u2022'} 宝宝日均配方奶量 {avgFormula}ml，
              {avgFormula < 500 ? '建议关注是否摄入充足' : avgFormula > 1000 ? '奶量较高，注意观察是否有过度喂养' : '处于正常范围'}
            </Text>
          )}
          {avgFeedingSessions != null && avgFeedingSessions > 0 && (
            <Text style={{ fontSize: 12, color: '#6B6070', lineHeight: 1.6, display: 'block' }}>
              {'\u2022'} 日均喂奶约 {avgFeedingSessions} 次
              {totalBreastHist > 0 ? '，母乳有助于为宝宝提供营养与免疫保护' : ''}
            </Text>
          )}
          {avgComplementary != null && avgComplementary > 0 && (
            <Text style={{ fontSize: 12, color: '#6B6070', lineHeight: 1.6, display: 'block' }}>
              {'\u2022'} 日均辅食约 {avgComplementary} 次，建议逐步增加辅食种类和质地
            </Text>
          )}
        </View>
      </View>
    </View>
  )
}
