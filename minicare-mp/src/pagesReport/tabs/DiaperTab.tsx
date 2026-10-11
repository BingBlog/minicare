/**
 * 尿布分析 Tab（MP 版 - ECharts 图表）
 */
import { View, Text } from '@tarojs/components'
import { useMemo } from 'react'
import EcChart from '@/components/EcChart'
import { WARM_TOOLTIP } from '@/pagesReport/chartTheme'
import type { DailyDiaperData } from '@/api/report'
import { formatDateSlash } from '@/lib/utils'

interface DiaperTabProps {
  data: DailyDiaperData[] | null
  loading: boolean
}

const CARD = {
  background: '#fff', borderRadius: 12, padding: 14, marginBottom: 12,
  boxShadow: '0 1px 4px rgba(200,100,120,0.06)',
}

export function DiaperTab({ data, loading }: DiaperTabProps) {
  const barOption = useMemo(() => {
    if (!data?.length) return {}
    const max = Math.max(5, ...data.map(d => d.dirtyCount))
    return {
      tooltip: {
        ...WARM_TOOLTIP,
        trigger: 'axis' as const,
        formatter: (ps: Array<{ axisValue?: string; value?: unknown }>) => {
          if (!ps?.length) return ''
          return `${ps[0].axisValue ?? ''} · 大便 ${Number(ps[0].value) || 0} 次`
        },
      },
      grid: { left: 12, right: 12, top: 8, bottom: 24, containLabel: true },
      xAxis: { type: 'category' as const, data: data.map(d => formatDateSlash(d.date)), axisLabel: { fontSize: 10, color: '#C0A8AD' }, axisLine: { lineStyle: { color: '#F5F0F2' } } },
      yAxis: { type: 'value' as const, max, axisLabel: { fontSize: 10, color: '#C0A8AD' }, splitLine: { lineStyle: { color: '#F5F0F2' } } },
      series: [{ type: 'bar' as const, data: data.map(d => d.dirtyCount), itemStyle: { color: '#F5A962', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 24 }],
    }
  }, [data])

  const stackKeys = ['wet', 'dirty', 'mixed'] as const
  const stackColors: Record<string, string> = { wet: '#7EC8E3', dirty: '#F5A962', mixed: '#9B8ED8' }
  const stackLabels: Record<string, string> = { wet: '小便', dirty: '大便', mixed: '混合' }

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
      legend: { data: stackKeys.map(k => stackLabels[k]), bottom: 0, textStyle: { fontSize: 10 } },
      grid: { left: 12, right: 12, top: 8, bottom: 36, containLabel: true },
      xAxis: { type: 'category' as const, data: data.map(d => formatDateSlash(d.date)), axisLabel: { fontSize: 10, color: '#C0A8AD' }, axisLine: { lineStyle: { color: '#F5F0F2' } } },
      yAxis: { type: 'value' as const, axisLabel: { fontSize: 10, color: '#C0A8AD', formatter: (v: number) => `${v}次` }, splitLine: { lineStyle: { color: '#F5F0F2' } } },
      series: stackKeys.map(k => ({ name: stackLabels[k], type: 'bar' as const, stack: 'total', data: data.map(d => d[`${k}Count` as keyof DailyDiaperData] as number), itemStyle: { color: stackColors[k] }, barMaxWidth: 28 })),
    }
  }, [data])

  if (loading) {
    return <View style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}><Text style={{ color: '#C0A8AD', fontSize: 13 }}>加载中...</Text></View>
  }

  if (!data || data.length === 0) {
    return (
      <View style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '50px 0' }}>
        <Text style={{ color: '#C0A8AD', fontSize: 13, marginBottom: 8 }}>暂无尿布数据</Text>
        <Text style={{ color: '#D8C8D0', fontSize: 11 }}>开始记录宝宝的尿布情况后，这里将展示分析图表</Text>
      </View>
    )
  }

  const totalWet = data.reduce((s, d) => s + d.wetCount, 0)
  const totalDirty = data.reduce((s, d) => s + d.dirtyCount, 0)
  const totalMixed = data.reduce((s, d) => s + d.mixedCount, 0)
  const avgDirtyPerDay = (totalDirty / data.length).toFixed(1)
  const avgWetPerDay = (totalWet / data.length).toFixed(1)

  return (
    <View>
      <View style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <View style={{ ...CARD, flex: 1 }}>
          <Text style={{ fontSize: 11, color: '#9A8090', marginBottom: 4, display: 'block' }}>日均小便</Text>
          <View style={{ display: 'flex', alignItems: 'baseline' }}>
            <Text style={{ fontSize: 18, fontWeight: 600, color: '#7EC8E3' }}>{avgWetPerDay}</Text>
            <Text style={{ fontSize: 11, color: '#9A8090', marginLeft: 2 }}>次/天</Text>
          </View>
        </View>
        <View style={{ ...CARD, flex: 1 }}>
          <Text style={{ fontSize: 11, color: '#9A8090', marginBottom: 4, display: 'block' }}>日均大便</Text>
          <View style={{ display: 'flex', alignItems: 'baseline' }}>
            <Text style={{ fontSize: 18, fontWeight: 600, color: '#F5A962' }}>{avgDirtyPerDay}</Text>
            <Text style={{ fontSize: 11, color: '#9A8090', marginLeft: 2 }}>次/天</Text>
          </View>
        </View>
      </View>

      <View style={CARD}>
        <Text style={{ fontSize: 13, fontWeight: 500, color: '#4A3035', marginBottom: 8 }}>每日大便次数</Text>
        <EcChart option={barOption} height='260rpx' />
      </View>

      <View style={CARD}>
        <Text style={{ fontSize: 13, fontWeight: 500, color: '#4A3035', marginBottom: 8 }}>每日尿布类型</Text>
        <EcChart option={stackedOption} height='320rpx' />
      </View>

      <View style={{ ...CARD, background: 'linear-gradient(135deg, #FFF8ED, #FFF0E0)' }}>
        <Text style={{ fontSize: 13, fontWeight: 500, color: '#4A3035', marginBottom: 8 }}>数据洞察</Text>
        <View>
          <Text style={{ fontSize: 12, color: '#6B6070', lineHeight: 1.6, display: 'block' }}>
            {'\u2022'} 日均小便 {avgWetPerDay} 次，{parseFloat(avgWetPerDay) >= 6 ? '排尿正常，水分摄入充足' : '排尿较少，建议关注水分摄入'}
          </Text>
          <Text style={{ fontSize: 12, color: '#6B6070', lineHeight: 1.6, display: 'block' }}>
            {'\u2022'} 日均大便 {avgDirtyPerDay} 次，{parseFloat(avgDirtyPerDay) >= 1 && parseFloat(avgDirtyPerDay) <= 4 ? '排便频率正常' : parseFloat(avgDirtyPerDay) < 1 ? '排便较少，注意观察是否有便秘' : '排便频繁，关注宝宝状态'}
          </Text>
          {totalMixed > 0 && (
            <Text style={{ fontSize: 12, color: '#6B6070', lineHeight: 1.6, display: 'block' }}>
              {'\u2022'} 混合型尿布 {totalMixed} 次
            </Text>
          )}
        </View>
      </View>
    </View>
  )
}
