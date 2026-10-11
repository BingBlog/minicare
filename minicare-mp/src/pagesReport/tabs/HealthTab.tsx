/**
 * 健康分析 Tab（ECharts 图表）
 *
 * 2026-10-11 调整（真机验收后优化项）：
 *   - 体温图改为「体温异常点」聚焦：仅显示 ≥37.5°C 的异常记录
 *     （37.5–38°C 橙=偏高；≥38°C 红=发热），默认时间范围 = 半年（types.ts）
 *   - 区间内无异常时展示「体温平稳」空态（不再隐藏卡片）
 *   - 情绪 / 精神状态图表保持不变
 */
import { View, Text } from '@tarojs/components'
import { useMemo } from 'react'
import dayjs from 'dayjs'
import { EcChart } from '@/components/EcChart'
import { WARM_TOOLTIP } from '@/pagesReport/chartTheme'
import type { DailyHealthData } from '@/api/report'
import { formatDateSlash } from '@/lib/utils'
import { AskAssistantBar } from '../components/AskAssistantBar'

interface HealthTabProps {
  data: DailyHealthData[] | null
  loading: boolean
  /** 当前时间窗（「问助手」深链携带，PRD-013 US-01/02） */
  range: string
}

// ── 体温异常阈值（L1）──
const ABNORMAL_MIN = 37.5  // 偏高起点
const FEVER_MIN = 38       // 发热起点
const COLOR_ABNORMAL = '#F5A962'
const COLOR_FEVER = '#F05060'

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

export function HealthTab({ data, loading, range }: HealthTabProps) {
  // 体温异常点：仅 ≥37.5°C 的记录，时间轴散点
  const tempOption = useMemo(() => {
    if (!data?.length) return null
    const abnormal = data
      .filter(d => d.temperature !== null && d.temperature >= ABNORMAL_MIN)
      .map(d => [dayjs(d.date).valueOf(), d.temperature as number] as [number, number])
    if (!abnormal.length) return null
    const maxT = Math.max(...abnormal.map(p => p[1]))
    return {
      tooltip: {
        ...WARM_TOOLTIP,
        formatter: (p: { value: [number, number] }) => `${dayjs(p.value[0]).format('M/D')} ${p.value[1].toFixed(1)}°C`,
      },
      grid: { left: 46, right: 18, top: 16, bottom: 28 },
      xAxis: {
        type: 'time' as const,
        axisLabel: { fontSize: 10, color: '#C0A8AD', formatter: (v: number) => dayjs(v).format('M/D') },
        axisLine: { lineStyle: { color: '#F5F0F2' } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value' as const,
        min: 37,
        max: Math.max(39, Math.round((maxT + 0.5) * 10) / 10),
        axisLabel: { fontSize: 10, color: '#C0A8AD', formatter: (v: number) => `${v}°C` },
        splitLine: { lineStyle: { color: '#F5F0F2' } },
      },
      series: [{
        type: 'scatter' as const,
        data: abnormal,
        symbolSize: (val: [number, number]) => {
          const t = Math.max(37, Math.min(40.5, val[1]))
          return (4 + ((t - 37) / (40.5 - 37)) * 6) * 2
        },
        itemStyle: {
          color: (p: { value: [number, number] }) => p.value[1] >= FEVER_MIN ? COLOR_FEVER : COLOR_ABNORMAL,
          opacity: 0.85,
        },
      }],
    }
  }, [data])

  const moodOption = useMemo(() => {
    if (!data?.length) return null
    const dates = data.map(d => formatDateSlash(d.date))
    const moodData = data.map((d, i) => ({ mood: d.mood, i })).filter(d => d.mood && MOOD_Y[d.mood] !== undefined)
    if (!moodData.length) return null
    return {
      tooltip: {
        ...WARM_TOOLTIP,
        formatter: (p: { value: number[] }) => {
          const map: Record<number, string> = { 3: '开心', 2: '平静', 1: '烦躁', 0: '哭闹' }
          const d = dates[Math.round(p.value[0])]
          return `${d ? `${d} · ` : ''}${map[Math.round(p.value[1])] ?? ''}`
        },
      },
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
      tooltip: {
        ...WARM_TOOLTIP,
        formatter: (p: { name: string; value: number; percent: number }) => `${p.name}：${p.value} 次（${Math.round(p.percent)}%）`,
      },
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
  const abnormalTemps = temps.filter(t => t >= ABNORMAL_MIN)
  const maxAbnormal = abnormalTemps.length > 0 ? Math.max(...abnormalTemps) : null

  // 情绪分布统计（数据洞察用）
  const moodCounts: Record<string, number> = {}
  data.forEach(d => { if (d.mood) moodCounts[d.mood] = (moodCounts[d.mood] || 0) + 1 })
  const topMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]

  return (
    <View>
      {/* 体温异常点 */}
      <View style={CARD}>
        <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: 500, color: '#4A3035' }}>体温异常点</Text>
          {abnormalTemps.length > 0 && (
            <Text style={{ fontSize: 11, color: COLOR_FEVER }}>{abnormalTemps.length} 次异常</Text>
          )}
        </View>
        {tempOption ? (
          <View>
            <EcChart option={tempOption} height='300rpx' />
            <View style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <View style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: '50%', background: COLOR_ABNORMAL }} />
                <Text style={{ fontSize: 11, color: '#9A8090' }}>偏高 37.5–38°C</Text>
              </View>
              <View style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: '50%', background: COLOR_FEVER }} />
                <Text style={{ fontSize: 11, color: '#9A8090' }}>发热 ≥38°C</Text>
              </View>
            </View>
            <Text style={{ fontSize: 11, color: '#C0A8AD', marginTop: 6, display: 'block' }}>
              仅显示 ≥37.5°C 的异常记录，点按可查看数值
            </Text>
          </View>
        ) : (
          <View style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 2px 6px' }}>
            <View style={{ width: 8, height: 8, borderRadius: '50%', background: '#6BCB77' }} />
            <Text style={{ fontSize: 12, color: '#9A8090' }}>
              {temps.length > 0 ? '所选时段未记录到异常体温，宝宝体温平稳' : '所选时段暂无体温记录，可在记录页补充体温'}
            </Text>
          </View>
        )}
      </View>

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
          {maxAbnormal !== null && (
            <Text style={{ fontSize: 12, color: '#6B6070', lineHeight: 1.6, display: 'block' }}>
              {'\u2022'} {maxAbnormal >= FEVER_MIN
                ? `期间有发热记录（最高 ${maxAbnormal.toFixed(1)}°C，共 ${abnormalTemps.length} 次异常），建议关注宝宝状态`
                : `期间有体温偏高记录（最高 ${maxAbnormal.toFixed(1)}°C，共 ${abnormalTemps.length} 次），建议继续观察`}
            </Text>
          )}
          {maxAbnormal === null && temps.length > 0 && (
            <Text style={{ fontSize: 12, color: '#6B6070', lineHeight: 1.6, display: 'block' }}>
              {'\u2022'} 所选时段体温平稳，未记录到 ≥37.5°C 的异常体温
            </Text>
          )}
          {topMood && (
            <Text style={{ fontSize: 12, color: '#6B6070', lineHeight: 1.6, display: 'block' }}>
              {'\u2022'} 情绪方面：{MOOD_LABELS[topMood[0]] ?? topMood[0]} 出现最多
              {data.length ? `（${data.length}天数据）` : ''}
            </Text>
          )}
        </View>
        <AskAssistantBar tab='health' range={range} />
      </View>
    </View>
  )
}
