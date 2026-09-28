/**
 * 健康分析 Tab（ECharts 图表，业务逻辑与 Web 完全一致）
 */
import { View, Text } from '@tarojs/components'
import { useMemo } from 'react'
import { EcChart } from '@/components/EcChart'
import type { DailyHealthData } from '@/api/report'
import { formatDateSlash } from '@/lib/utils'

interface HealthTabProps {
  data: DailyHealthData[] | null
  loading: boolean
}

// 情绪 Y 轴映射（L1，与 Web 完全一致）
const MOOD_Y: Record<string, number> = { happy: 3, neutral: 2, fussy: 1, crying: 0 }
const MOOD_LABELS: Record<string, string> = { happy: '开心', neutral: '平静', fussy: '烦躁', crying: '哭闹' }
const SPIRIT_LABELS: Record<string, string> = { active: '精神活跃', normal: '精神正常', tired: '有点累', lethargic: '萎靡' }

function getMoodColor(mood: string): string {
  const c: Record<string, string> = { happy: '#6BCB77', neutral: '#7EC8E3', fussy: '#F5A962', crying: '#F05060' }
  return c[mood] || '#9CA3AF'
}

function getSpiritColor(spirit: string): string {
  const c: Record<string, string> = { active: '#6BCB77', normal: '#7EC8E3', tired: '#F5A962', lethargic: '#F05060' }
  return c[spirit] || '#9CA3AF'
}

const CARD = { background: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, boxShadow: '0 1px 4px rgba(200,100,120,0.06)' }
const INS_CARD = { ...CARD, background: 'linear-gradient(135deg, #FFF0F4, #FFECF2)' }

export function HealthTab({ data, loading }: HealthTabProps) {
  const tempOption = useMemo(() => {
    if (!data?.length) return null
    const dates = data.map(d => formatDateSlash(d.date))
    const tempData = data.map((d, i) => ({ temp: d.temperature, i })).filter(d => d.temp !== null)
    if (!tempData.length) return null
    return {
      tooltip: { confine: true, formatter: (p: { value: number[] }) => `${p.value[1].toFixed(1)}°C` },
      grid: { left: 50, right: 16, top: 16, bottom: 30 },
      xAxis: { type: 'category' as const, data: dates, axisLabel: { fontSize: 10, color: '#C0A8AD' }, axisLine: { lineStyle: { color: '#F5F0F2' } } },
      yAxis: { type: 'value' as const, min: 36, max: 39, axisLabel: { fontSize: 10, color: '#C0A8AD', formatter: (v: number) => `${v}°C` }, splitLine: { lineStyle: { color: '#F5F0F2' } } },
      series: [{ type: 'scatter' as const, data: tempData.map(d => [d.i, d.temp as number]), symbolSize: (val: number[]) => { const t = val[1]; const clamped = Math.max(36, Math.min(40.5, t)); return (3.5 + ((clamped - 36) / (40.5 - 36)) * 7.5) * 2 }, itemStyle: { color: (p: { value: number[] }) => p.value[1] > 37.4 ? '#F05060' : '#A8D8A8', opacity: 0.75 } }],
    }
  }, [data])

  const moodOption = useMemo(() => {
    if (!data?.length) return null
    const dates = data.map(d => formatDateSlash(d.date))
    const moodData = data.map((d, i) => ({ mood: d.mood, i })).filter(d => d.mood && MOOD_Y[d.mood] !== undefined)
    if (!moodData.length) return null
    return {
      tooltip: { confine: true, formatter: (p: { value: number[] }) => { const map: Record<number, string> = { 3: '开心', 2: '平静', 1: '烦躁', 0: '哭闹' }; return map[Math.round(p.value[1])] ?? '' } },
      grid: { left: 50, right: 16, top: 16, bottom: 30 },
      xAxis: { type: 'category' as const, data: dates, axisLabel: { fontSize: 10, color: '#C0A8AD' }, axisLine: { lineStyle: { color: '#F5F0F2' } } },
      yAxis: { type: 'value' as const, min: 0, max: 3, interval: 1, axisLabel: { fontSize: 10, color: '#C0A8AD', formatter: (v: number) => ({ 0: '哭闹', 1: '烦躁', 2: '平静', 3: '开心' }[v] ?? '') }, splitLine: { lineStyle: { color: '#F5F0F2' } } },
      series: [{ type: 'scatter' as const, data: moodData.map(d => [d.i, MOOD_Y[d.mood!]]), symbolSize: (val: number[]) => val[1] <= 1 ? 18 : 10, itemStyle: { color: (p: { value: number[] }) => { const m: Record<number, string> = { 3: getMoodColor('happy'), 2: getMoodColor('neutral'), 1: getMoodColor('fussy'), 0: getMoodColor('crying') }; return m[Math.round(p.value[1])] || '#ccc' }, opacity: 0.8 } }],
    }
  }, [data])

  const spiritOption = useMemo(() => {
    if (!data?.length) return null
    const counts: Record<string, number> = {}
    data.forEach(d => { if (d.spirit) counts[d.spirit] = (counts[d.spirit] || 0) + 1 })
    const slices = Object.entries(counts).map(([k, v]) => ({ value: v, name: SPIRIT_LABELS[k] ?? k, itemStyle: { color: getSpiritColor(k) } }))
    if (!slices.length) return null
    return {
      tooltip: { confine: true },
      legend: { bottom: 0, textStyle: { fontSize: 10 } },
      series: [{ type: 'pie' as const, radius: ['50%', '75%'], center: ['50%', '45%'], label: { show: false }, data: slices }],
    }
  }, [data])

  if (loading) {
    return <View style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}><Text style={{ color: '#C0A8AD', fontSize: 13 }}>加载中...</Text></View>
  }

  if (!data || data.length === 0) {
    return (
      <View style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '50px 0' }}>
        <Text style={{ color: '#C0A8AD', fontSize: 13, marginBottom: 8 }}>暂无健康数据</Text>
        <Text style={{ color: '#D8C8D0', fontSize: 11 }}>开始记录宝宝的体温、情绪、精神状态后，这里将展示分析图表</Text>
      </View>
    )
  }

  const temps = data.filter(d => d.temperature !== null).map(d => d.temperature!)
  const maxTemp = temps.length > 0 ? Math.max(...temps) : null

  // 情绪分布统计（数据洞察用）
  const moodCounts: Record<string, number> = {}
  data.forEach(d => { if (d.mood) moodCounts[d.mood] = (moodCounts[d.mood] || 0) + 1 })
  const topMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]

  return (
    <View>
      {/* 体温散点 */}
      {tempOption && (
        <View style={CARD}>
          <Text style={{ fontSize: 13, fontWeight: 500, color: '#4A3035', marginBottom: 10 }}>体温</Text>
          <EcChart option={tempOption} height='300rpx' />
          <View style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <View style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 8, height: 8, borderRadius: '50%', background: '#A8D8A8' }} />
              <Text style={{ fontSize: 11, color: '#9A8090' }}>正常</Text>
            </View>
            <View style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 8, height: 8, borderRadius: '50%', background: '#F05060' }} />
              <Text style={{ fontSize: 11, color: '#9A8090' }}>偏高</Text>
            </View>
          </View>
        </View>
      )}

      {/* 情绪散点 */}
      {moodOption && (
        <View style={CARD}>
          <Text style={{ fontSize: 13, fontWeight: 500, color: '#4A3035', marginBottom: 10 }}>情绪</Text>
          <EcChart option={moodOption} height='300rpx' />
          <Text style={{ fontSize: 11, color: '#C0A8AD', marginTop: 4, display: 'block' }}>
            纵轴越高越开心；圆点越大表示烦躁/哭闹等需关注状态
          </Text>
        </View>
      )}

      {/* 精神状态分布 */}
      {spiritOption && (
        <View style={CARD}>
          <Text style={{ fontSize: 13, fontWeight: 500, color: '#4A3035', marginBottom: 10 }}>精神状态分布</Text>
          <EcChart option={spiritOption} height='320rpx' />
        </View>
      )}

      {/* 数据洞察 */}
      <View style={INS_CARD}>
        <Text style={{ fontSize: 13, fontWeight: 500, color: '#4A3035', marginBottom: 8 }}>数据洞察</Text>
        <View>
          {maxTemp !== null && maxTemp >= 38 && (
            <Text style={{ fontSize: 12, color: '#6B6070', lineHeight: 1.6, display: 'block' }}>
              {'\u2022'} 期间有发热记录（最高 {maxTemp.toFixed(1)}&deg;C），建议关注宝宝状态
            </Text>
          )}
          {maxTemp !== null && maxTemp < 38 && temps.some(t => t >= 37.5 && t < 38) && (
            <Text style={{ fontSize: 12, color: '#6B6070', lineHeight: 1.6, display: 'block' }}>
              {'\u2022'} 部分时段体温偏高（37.5&deg;C 以上），建议继续观察
            </Text>
          )}
          {topMood && (
            <Text style={{ fontSize: 12, color: '#6B6070', lineHeight: 1.6, display: 'block' }}>
              {'\u2022'} 情绪方面：{MOOD_LABELS[topMood[0]] ?? topMood[0]} 出现最多
              {data.length ? `（${data.length}天数据）` : ''}
            </Text>
          )}
        </View>
      </View>
    </View>
  )
}
