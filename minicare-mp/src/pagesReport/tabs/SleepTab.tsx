/**
 * 睡眠分析 Tab（MP 版 - ECharts 图表）
 */
import { View, Text } from '@tarojs/components'
import { useMemo } from 'react'
import EcChart from '@/components/EcChart'
import { WARM_TOOLTIP } from '@/pagesReport/chartTheme'
import type { DailySleepData } from '@/api/report'
import { formatDateSlash, formatDurationMinutes } from '@/lib/utils'

interface SleepTabProps {
  data: DailySleepData[] | null
  loading: boolean
}

const CARD = {
  background: '#fff', borderRadius: 12, padding: 14, marginBottom: 12,
  boxShadow: '0 1px 4px rgba(200,100,120,0.06)',
}

function minToHours(min: number): number {
  return Math.round((min / 60) * 10) / 10
}

export function SleepTab({ data, loading }: SleepTabProps) {
  const lineOption = useMemo(() => {
    if (!data?.length) return {}
    const dates = data.map(d => formatDateSlash(d.date))
    const totalValues = data.map(d => minToHours(Number(d.totalMin) || 0))
    const nightValues = data.map(d => minToHours(Number(d.nightSleepMin) || 0))
    return {
      tooltip: {
        ...WARM_TOOLTIP,
        trigger: 'axis' as const,
        formatter: (ps: Array<{ axisValue?: string; dataIndex: number }>) => {
          if (!ps?.length) return ''
          const day = data[ps[0].dataIndex]
          if (!day) return ''
          return [
            `${ps[0].axisValue ?? ''} · 每日睡眠 ${formatDurationMinutes(Number(day.totalMin) || 0)}`,
            `夜间睡眠 ${formatDurationMinutes(Number(day.nightSleepMin) || 0)}`,
          ].join('\n')
        },
      },
      legend: { data: ['每日睡眠', '夜间睡眠'], bottom: 0, textStyle: { fontSize: 10 } },
      grid: { left: 12, right: 12, top: 8, bottom: 36, containLabel: true },
      xAxis: { type: 'category' as const, data: dates, axisLabel: { fontSize: 10, color: '#C0A8AD' }, axisLine: { lineStyle: { color: '#F5F0F2' } } },
      yAxis: { type: 'value' as const, axisLabel: { fontSize: 10, color: '#C0A8AD', formatter: (v: number) => `${v}h` }, splitLine: { lineStyle: { color: '#F5F0F2' } } },
      series: [
        { name: '每日睡眠', type: 'line' as const, data: totalValues, smooth: true, symbol: 'circle', symbolSize: 3, lineStyle: { color: '#9B8ED8', width: 2 }, itemStyle: { color: '#9B8ED8' }, areaStyle: { color: { type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(155,142,216,0.15)' }, { offset: 1, color: 'rgba(155,142,216,0)' }] } } },
        { name: '夜间睡眠', type: 'line' as const, data: nightValues, smooth: true, symbol: 'circle', symbolSize: 3, lineStyle: { color: '#7EC8E3', width: 2 }, itemStyle: { color: '#7EC8E3' } },
      ],
    }
  }, [data])

  if (loading) {
    return <View style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}><Text style={{ color: '#C0A8AD', fontSize: 13 }}>加载中...</Text></View>
  }

  if (!data || data.length === 0) {
    return (
      <View style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '50px 0' }}>
        <Text style={{ color: '#C0A8AD', fontSize: 13, marginBottom: 8 }}>暂无睡眠数据</Text>
        <Text style={{ color: '#D8C8D0', fontSize: 11 }}>开始记录宝宝的睡眠后，这里将展示分析图表</Text>
      </View>
    )
  }

  const totalSleep = data.reduce((s, d) => s + (Number(d.totalMin) || 0), 0)
  const avgSleep = data.length > 0 ? Math.round(totalSleep / data.length) : 0
  const totalNightSleep = data.reduce((s, d) => s + (Number(d.nightSleepMin) || 0), 0)
  const nightPercent = totalSleep > 0 ? Math.round((totalNightSleep / totalSleep) * 100) : 0
  const totalSessions = data.reduce((s, d) => s + (Number(d.sessionCount) || 0), 0)
  const avgSessionsNum = data.length > 0 ? totalSessions / data.length : 0
  const avgSessions = Number.isFinite(avgSessionsNum) ? avgSessionsNum.toFixed(1) : '0.0'
  const avgPerSessionMin = avgSessionsNum > 0 ? Math.round(avgSleep / avgSessionsNum) : 0

  return (
    <View>
      <View style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <View style={{ ...CARD, flex: 1 }}>
          <Text style={{ fontSize: 11, color: '#9A8090', marginBottom: 4, display: 'block' }}>日均睡眠</Text>
          <Text style={{ fontSize: 18, fontWeight: 600, color: '#9B8ED8' }}>{formatDurationMinutes(avgSleep)}</Text>
        </View>
        <View style={{ ...CARD, flex: 1 }}>
          <Text style={{ fontSize: 11, color: '#9A8090', marginBottom: 4, display: 'block' }}>日均睡眠次数</Text>
          <View style={{ display: 'flex', alignItems: 'baseline' }}>
            <Text style={{ fontSize: 18, fontWeight: 600, color: '#7EC8E3' }}>{avgSessions}</Text>
            <Text style={{ fontSize: 11, color: '#9A8090', marginLeft: 2 }}>次</Text>
          </View>
        </View>
      </View>

      <View style={CARD}>
        <View style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: 500, color: '#4A3035' }}>每日睡眠与夜间睡眠</Text>
          <Text style={{ fontSize: 10, color: '#C0A8AD' }}>夜间 {nightPercent}%</Text>
        </View>
        <EcChart option={lineOption} height='320rpx' />
      </View>

      <View style={{ ...CARD, background: 'linear-gradient(135deg, #F0ECFF, #EAEDFF)' }}>
        <Text style={{ fontSize: 13, fontWeight: 500, color: '#4A3035', marginBottom: 8 }}>数据洞察</Text>
        <View>
          <Text style={{ fontSize: 12, color: '#6B6070', lineHeight: 1.6, display: 'block' }}>
            {'\u2022'} 日均睡眠 {formatDurationMinutes(avgSleep)}，
            {avgSleep >= 12 * 60 ? '睡眠时间充足' : avgSleep >= 10 * 60 ? '睡眠时间适中' : '睡眠时间偏少，建议调整作息'}
          </Text>
          <Text style={{ fontSize: 12, color: '#6B6070', lineHeight: 1.6, display: 'block' }}>
            {'\u2022'} 夜间睡眠占比 {nightPercent}%，
            {nightPercent >= 60 ? '夜间睡眠比例良好' : '夜间睡眠较少，建议培养夜间睡眠习惯'}
          </Text>
          <Text style={{ fontSize: 12, color: '#6B6070', lineHeight: 1.6, display: 'block' }}>
            {'\u2022'} 日均睡眠 {avgSessions} 次，每次平均 {formatDurationMinutes(avgPerSessionMin)}
          </Text>
        </View>
      </View>
    </View>
  )
}
