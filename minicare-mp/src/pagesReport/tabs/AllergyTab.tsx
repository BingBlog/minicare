/**
 * 排敏分析 Tab（2026-10-11 重构为图表分析形态）
 *
 * 背景：原「排敏概览 + 食物清单（Day 圆点标签）」与「排敏进度」页
 * （pages/records/food-observation）内容重复，现改为纯分析视图：
 *   1. 引入进度    —— 累计引入 / 累计已耐受 双线（时间轴）
 *   2. 排敏状态分布 —— 五态环图（图例即计数口径）
 *   3. 食物类别覆盖 —— 按常见辅食分类的堆叠条（已耐受 / 其余状态）
 *   4. 数据洞察    —— 进度、节奏、超期观察、过敏风险（动态生成）
 *
 * 数据为全量观察记录（不随时间范围过滤，报告页已隐藏本 Tab 的范围选择器）。
 */
import { View, Text } from '@tarojs/components'
import { useMemo } from 'react'
import dayjs from 'dayjs'
import { EcChart } from '@/components/EcChart'
import { WARM_TOOLTIP } from '@/pagesReport/chartTheme'
import type { FoodObservation, ObservationStatus } from '@/api'
import { OBSERVATION_STATUS_CFG } from '@/lib/constants'
import { COMMON_FOOD_GROUPS } from '@/pages/records/feeding/types'
import { AskAssistantBar } from '../components/AskAssistantBar'

interface AllergyTabProps {
  data: FoodObservation[] | null
  loading: boolean
  /** 排敏为全量分析、时间窗无意义（深链仍携带但助手忽略，PRD-013 US-02） */
  range: string
}

const CARD = { background: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, boxShadow: '0 1px 4px rgba(200,100,120,0.06)' }
const INS_CARD = { ...CARD, background: 'linear-gradient(135deg, #FFF0F4, #FFECF2)' }

// 环图展示顺序：已耐受 → 观察中 → 疑似 → 过敏 → 停用
const STATUS_ORDER: ObservationStatus[] = ['safe', 'observing', 'suspected', 'allergic', 'paused']

const CHART_TITLE = { fontSize: 13, fontWeight: 500, color: '#4A3035', marginBottom: 10, display: 'block' } as const

export function AllergyTab({ data, loading, range }: AllergyTabProps) {
  // ── 1. 引入进度：累计引入 / 累计已耐受 ──
  const progressOption = useMemo(() => {
    if (!data?.length) return null
    const sortedIntro = [...data].sort((a, b) => a.first_intro_at.localeCompare(b.first_intro_at))
    const introPoints: [number, number][] = sortedIntro.map((o, i) => [dayjs(o.first_intro_at).startOf('day').valueOf(), i + 1])

    // 已耐受的完成日 ≈ 首次引入 + 观察天数
    const safeSorted = data
      .filter(o => o.status === 'safe')
      .map(o => dayjs(o.first_intro_at).add(o.observation_days, 'day').startOf('day').valueOf())
      .sort((a, b) => a - b)
    const safePoints: [number, number][] = safeSorted.map((t, i) => [t, i + 1])

    // 延展到今日，曲线保持完整
    const today = dayjs().startOf('day').valueOf()
    introPoints.push([today, sortedIntro.length])
    if (safePoints.length) safePoints.push([today, safePoints.length])

    const series: Record<string, unknown>[] = [{
      name: '累计引入',
      type: 'line',
      data: introPoints,
      symbol: 'circle', symbolSize: 3,
      lineStyle: { color: '#F87098', width: 2 },
      itemStyle: { color: '#F87098' },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{ offset: 0, color: 'rgba(248,112,152,0.16)' }, { offset: 1, color: 'rgba(248,112,152,0.01)' }],
        },
      },
    }]
    const legendData = ['累计引入']
    if (safePoints.length) {
      series.push({
        name: '累计已耐受',
        type: 'line',
        data: safePoints,
        symbol: 'circle', symbolSize: 3,
        lineStyle: { color: '#2A9E70', width: 2 },
        itemStyle: { color: '#2A9E70' },
      })
      legendData.push('累计已耐受')
    }

    return {
      tooltip: {
        ...WARM_TOOLTIP,
        trigger: 'axis' as const,
        formatter: (ps: Record<string, unknown>[]) => {
          if (!ps?.length) return ''
          const first = ps[0] as { value: [number, number] }
          const d = dayjs(first.value[0]).format('M/D')
          const parts = ps.map((p) => {
            const item = p as { seriesName: string; value: [number, number] }
            return `${item.seriesName} ${item.value[1]} 种`
          })
          return `${d} · ${parts.join(' · ')}`
        },
      },
      legend: { data: legendData, bottom: 0, textStyle: { fontSize: 10 } },
      grid: { left: 34, right: 16, top: 16, bottom: 40 },
      xAxis: {
        type: 'time' as const,
        axisLabel: { fontSize: 10, color: '#C0A8AD', formatter: (v: number) => dayjs(v).format('M/D') },
        axisLine: { lineStyle: { color: '#F5F0F2' } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value' as const, minInterval: 1,
        axisLabel: { fontSize: 10, color: '#C0A8AD' },
        splitLine: { lineStyle: { color: '#F5F0F2' } },
      },
      series,
    }
  }, [data])

  // ── 2. 排敏状态分布（五态环图）──
  const statusOption = useMemo(() => {
    if (!data?.length) return null
    const counts: Record<string, number> = {}
    data.forEach(o => { counts[o.status] = (counts[o.status] || 0) + 1 })
    const slices = STATUS_ORDER
      .filter(k => (counts[k] ?? 0) > 0)
      .map(k => ({
        value: counts[k],
        name: OBSERVATION_STATUS_CFG[k]?.label ?? k,
        itemStyle: { color: OBSERVATION_STATUS_CFG[k]?.color ?? '#9CA3AF' },
      }))
    if (!slices.length) return null
    return {
      tooltip: { ...WARM_TOOLTIP, formatter: (p: { name: string; value: number; percent: number }) => `${p.name}：${p.value} 种（${Math.round(p.percent)}%）` },
      legend: { bottom: 0, itemWidth: 8, itemHeight: 8, itemGap: 8, textStyle: { fontSize: 10 } },
      series: [{ type: 'pie' as const, radius: ['52%', '74%'], center: ['50%', '44%'], label: { show: false }, data: slices }],
    }
  }, [data])

  // ── 3. 食物类别覆盖（按常见辅食分类堆叠）──
  const coverage = useMemo(() => {
    if (!data?.length) return null
    const groupKeyOf = (name: string) => COMMON_FOOD_GROUPS.find(g => g.items.includes(name))?.key ?? 'other'
    const agg: Record<string, { safe: number; rest: number }> = {}
    COMMON_FOOD_GROUPS.forEach(g => { agg[g.key] = { safe: 0, rest: 0 } })
    agg.other = { safe: 0, rest: 0 }
    data.forEach(o => {
      const bucket = agg[groupKeyOf(o.food_name)] ?? agg.other
      if (o.status === 'safe') bucket.safe += 1
      else bucket.rest += 1
    })
    // 五个常见类别恒显示（0 也是「未覆盖」信息）；「其他」仅在有自定义食物时显示
    const rows = COMMON_FOOD_GROUPS.map(g => ({ label: g.label, ...agg[g.key] }))
    if (agg.other.safe + agg.other.rest > 0) rows.push({ label: '其他', ...agg.other })
    return rows
  }, [data])

  const coverageOption = useMemo(() => {
    if (!coverage?.length) return null
    return {
      tooltip: { ...WARM_TOOLTIP, formatter: (p: { name: string; seriesName: string; value: number }) => `${p.name}：${p.seriesName} ${p.value} 种` },
      legend: { bottom: 0, itemWidth: 8, itemHeight: 8, itemGap: 12, textStyle: { fontSize: 10 } },
      grid: { left: 8, right: 26, top: 8, bottom: 36, containLabel: true },
      xAxis: {
        type: 'value' as const, minInterval: 1,
        axisLabel: { fontSize: 10, color: '#C0A8AD' },
        splitLine: { lineStyle: { color: '#F5F0F2' } },
      },
      yAxis: {
        type: 'category' as const, data: coverage.map(r => r.label), inverse: true,
        axisLabel: { fontSize: 10, color: '#C0A8AD' },
        axisLine: { lineStyle: { color: '#F5F0F2' } },
        axisTick: { show: false },
      },
      series: [
        {
          name: '已耐受', type: 'bar' as const, stack: 'g', barMaxWidth: 14,
          data: coverage.map(r => r.safe),
          itemStyle: { color: '#2A9E70' },
          label: {
            show: true, position: 'right' as const, fontSize: 10, color: '#9A8090',
            formatter: (p: { dataIndex: number }) => {
              const r = coverage[p.dataIndex]
              return r.rest === 0 && r.safe > 0 ? String(r.safe) : ''
            },
          },
        },
        {
          name: '其余状态', type: 'bar' as const, stack: 'g', barMaxWidth: 14,
          data: coverage.map(r => r.rest),
          itemStyle: { color: '#F0B8C8' },
          label: {
            show: true, position: 'right' as const, fontSize: 10, color: '#9A8090',
            formatter: (p: { dataIndex: number }) => {
              const r = coverage[p.dataIndex]
              return r.rest > 0 ? String(r.safe + r.rest) : ''
            },
          },
        },
      ],
    }
  }, [coverage])

  // ── 4. 数据洞察（动态生成）──
  const insights = useMemo(() => {
    if (!data?.length) return []
    const items: string[] = []
    const safeCount = data.filter(o => o.status === 'safe').length
    const observingCount = data.filter(o => o.status === 'observing').length
    const allergicCount = data.filter(o => o.status === 'allergic').length
    const suspectedCount = data.filter(o => o.status === 'suspected').length

    items.push(`已引入 ${data.length} 种食物，其中 ${safeCount} 种已耐受${observingCount > 0 ? `，${observingCount} 项观察中` : ''}`)

    const recentCount = data.filter(o => dayjs().diff(dayjs(o.first_intro_at), 'day') <= 30).length
    if (recentCount > 0) items.push(`近 30 天新增 ${recentCount} 种新食物`)
    else if (observingCount === 0) items.push('近 30 天未新增食物，可按计划引入下一种新食物')

    const overdue = data.filter(o => o.status === 'observing' && dayjs().diff(dayjs(o.first_intro_at), 'day') >= o.observation_days)
    if (overdue.length > 0) {
      const names = overdue.slice(0, 2).map(o => o.food_name).join('、')
      items.push(`${overdue.length} 项观察已超过计划天数（${names}${overdue.length > 2 ? ' 等' : ''}），建议尽快完成判定`)
    }

    if (allergicCount + suspectedCount > 0) {
      const parts: string[] = []
      if (allergicCount > 0) parts.push(`确认过敏 ${allergicCount} 种`)
      if (suspectedCount > 0) parts.push(`疑似 ${suspectedCount} 种`)
      items.push(`${parts.join('、')}，相关食物请回避并遵医嘱`)
    }
    return items
  }, [data])

  if (loading) {
    return <View style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}><Text style={{ color: '#C0A8AD', fontSize: 13 }}>加载中...</Text></View>
  }

  if (!data || data.length === 0) {
    return (
      <View style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '50px 0' }}>
        <Text style={{ color: '#C0A8AD', fontSize: 13, marginBottom: 8 }}>暂无排敏数据</Text>
        <Text style={{ color: '#D8C8D0', fontSize: 11 }}>开始记录宝宝的辅食后，这里将展示排敏分析图表</Text>
      </View>
    )
  }

  return (
    <View>
      {/* 1. 引入进度 */}
      {progressOption && (
        <View style={CARD}>
          <Text style={CHART_TITLE}>引入进度</Text>
          <EcChart option={progressOption} height='320rpx' />
          <Text style={{ fontSize: 11, color: '#C0A8AD', marginTop: 6, display: 'block' }}>
            累计引入 / 累计已耐受（完成日按观察期结束估算），点按可查看数值
          </Text>
        </View>
      )}

      {/* 2. 排敏状态分布 */}
      {statusOption && (
        <View style={CARD}>
          <Text style={CHART_TITLE}>排敏状态分布（共 {data.length} 种）</Text>
          <EcChart option={statusOption} height='340rpx' />
        </View>
      )}

      {/* 3. 食物类别覆盖 */}
      {coverageOption && (
        <View style={CARD}>
          <Text style={CHART_TITLE}>食物类别覆盖</Text>
          <EcChart option={coverageOption} height='360rpx' />
          <Text style={{ fontSize: 11, color: '#C0A8AD', marginTop: 6, display: 'block' }}>
            按常见辅食分类统计；「其他」为自定义食物
          </Text>
        </View>
      )}

      {/* 4. 数据洞察 */}
      {insights.length > 0 && (
        <View style={INS_CARD}>
          <Text style={CHART_TITLE}>数据洞察</Text>
          <View>
            {insights.map((text, i) => (
              <Text key={i} style={{ fontSize: 12, color: '#6B6070', lineHeight: 1.6, display: 'block' }}>
                {'\u2022'} {text}
              </Text>
            ))}
          </View>
          <AskAssistantBar tab='allergy' range={range} />
        </View>
      )}
    </View>
  )
}
