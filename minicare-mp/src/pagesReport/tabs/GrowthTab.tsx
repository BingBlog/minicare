/**
 * 生长分析 Tab（2026-10-11 改版）
 *
 * 变更：
 *   - 合并原「体重 / 身高 / 头围」三个子 Tab：不再切换，三张曲线卡片纵向排列，
 *     下滑依次可见；无数据的维度展示占位提示
 *   - 宝宝数据点改用平滑曲线连接（原为独立散点）
 *   - Tooltip 统一暖色样式，内容升级为「日期 · 月龄 / 数值 · 百分位」
 */
import { View, Text } from '@tarojs/components'
import { useMemo } from 'react'
import dayjs from 'dayjs'
import { EcChart } from '@/components/EcChart'
import type { GrowthRecord } from '@/api/report'
import type { GrowthStandardPoint } from '@/lib/growth-standards'
import {
  getGrowthStandardsByGender,
  getStandardAtAge,
  calculatePercentile,
  getPercentileLabel,
} from '@/lib/growth-standards'
import { WARM_TOOLTIP } from '@/pagesReport/chartTheme'

interface GrowthTabProps {
  data: GrowthRecord[] | null
  loading: boolean
  babyGender: 'male' | 'female' | null
  babyBirthDate: string | null
}

type MeasureType = 'weight' | 'height' | 'head'

const DAYS_PER_MONTH = 365.25 / 12

function calculateAgeMonths(birthDate: string, recordDate: string): number {
  const birth = dayjs(birthDate.slice(0, 10))
  const record = dayjs(recordDate.slice(0, 10))
  if (!birth.isValid() || !record.isValid()) return 0
  const diffDays = record.diff(birth, 'day')
  return Math.max(0, diffDays / DAYS_PER_MONTH)
}

const card = {
  background: '#fff', borderRadius: 12, padding: 14, marginBottom: 12,
  boxShadow: '0 1px 4px rgba(200,100,120,0.06)',
}

const insCard = {
  background: 'linear-gradient(135deg, #F0ECFF, #E8FFE8)',
  borderRadius: 12, padding: 14, marginBottom: 12,
}

const MEASURE_ORDER: MeasureType[] = ['weight', 'height', 'head']

const measureConfig: Record<MeasureType, {
  label: string
  unit: string
  format: (v: number) => string
  rawOf: (d: GrowthRecord) => number | null
}> = {
  weight: { label: '体重', unit: 'kg', format: (v) => (v / 1000).toFixed(2), rawOf: (d) => d.weightG },
  height: { label: '身高', unit: 'cm', format: (v) => (v / 10).toFixed(1), rawOf: (d) => d.heightMm },
  head: { label: '头围', unit: 'cm', format: (v) => (v / 10).toFixed(1), rawOf: (d) => d.headMm },
}

interface MeasureView {
  measure: MeasureType
  label: string
  unit: string
  format: (v: number) => string
  hasData: boolean
  latest: { raw: number; date: string; percentile: number | null } | null
  option: Record<string, unknown> | null
}

export function GrowthTab({ data, loading, babyGender, babyBirthDate }: GrowthTabProps) {
  const views = useMemo<MeasureView[] | null>(() => {
    if (!data?.length) return null
    const gender = babyGender || 'male'
    const standards = getGrowthStandardsByGender(gender)
    const effectiveBirthDate = babyBirthDate ?? [...data].sort((a, b) => a.date.localeCompare(b.date))[0].date
    const recordsWithAge = data.map(d => ({
      ...d,
      ageMonths: effectiveBirthDate ? calculateAgeMonths(effectiveBirthDate, d.date) : 0,
    }))
    const stdMaxMonth = standards.length > 0 ? Math.max(...standards.map(s => s.month)) : 36

    return MEASURE_ORDER.map((measure): MeasureView => {
      const cfg = measureConfig[measure]
      const filtered = recordsWithAge
        .map(d => ({ ageMonths: d.ageMonths, raw: cfg.rawOf(d), date: d.date }))
        .filter(d => d.raw !== null)
        .map(d => ({ ageMonths: d.ageMonths, raw: d.raw as number, date: d.date }))
        .sort((a, b) => a.ageMonths - b.ageMonths)

      const base: MeasureView = {
        measure, label: cfg.label, unit: cfg.unit, format: cfg.format,
        hasData: filtered.length > 0, latest: null, option: null,
      }
      if (!filtered.length) return base

      const scaleValue = (v: number) => (measure === 'weight' ? v / 1000 : v / 10)

      const getP = (pt: GrowthStandardPoint, key: string) => {
        const k = key.toLowerCase()
        if (measure === 'weight') {
          const m: Record<string, number> = { p3: pt.weightP3, p15: pt.weightP15, p50: pt.weightP50, p85: pt.weightP85, p97: pt.weightP97 }
          return m[k] ?? 0
        }
        if (measure === 'height') {
          const m: Record<string, number> = { p3: pt.heightP3, p15: pt.heightP15, p50: pt.heightP50, p85: pt.heightP85, p97: pt.heightP97 }
          return m[k] ?? 0
        }
        const m: Record<string, number> = { p3: pt.headP3, p15: pt.headP15, p50: pt.headP50, p85: pt.headP85, p97: pt.headP97 }
        return m[k] ?? 0
      }

      const percentileAt = (ageMonths: number, raw: number): number | null => {
        const std = getStandardAtAge(standards, ageMonths)
        if (!std) return null
        const v = scaleValue(raw)
        if (measure === 'weight') return calculatePercentile(v, std.weightP3, std.weightP97)
        if (measure === 'height') return calculatePercentile(v, std.heightP3, std.heightP97)
        return calculatePercentile(v, std.headP3, std.headP97)
      }

      // X轴范围计算（对齐 Web 端逻辑：局部放大 + 智能范围）
      const dataMinMonth = Math.min(...filtered.map(d => d.ageMonths))
      const dataMaxMonth = Math.max(...filtered.map(d => d.ageMonths))
      const dataSpan = dataMaxMonth - dataMinMonth

      let xMin = 0
      let xMax = Math.min(stdMaxMonth, Math.max(6, Math.ceil(dataMaxMonth) + 1))

      if (filtered.length >= 2 && dataSpan < 1.5) {
        let lo = Math.max(0, dataMinMonth - 0.4)
        let hi = Math.min(stdMaxMonth, dataMaxMonth + 0.4)
        if (hi - lo < 2) {
          const mid = (dataMinMonth + dataMaxMonth) / 2
          lo = Math.max(0, mid - 1)
          hi = Math.min(stdMaxMonth, mid + 1)
        }
        xMin = lo
        xMax = hi
      } else if (filtered.length === 1 || dataSpan === 0) {
        const mid = dataMaxMonth
        xMin = Math.max(0, mid - 0.85)
        xMax = Math.min(stdMaxMonth, mid + 0.85)
      }

      const visibleStandards = standards.filter(s => s.month >= Math.floor(xMin) && s.month <= Math.ceil(xMax))
      const pc: Record<string, string> = { P3: '#D0D0D0', P15: '#B0B0B0', P50: '#F87098', P85: '#B0B0B0', P97: '#D0D0D0' }
      const pw: Record<string, number> = { P3: 1, P15: 1, P50: 2, P85: 1, P97: 1 }
      const ps = ['P3', 'P15', 'P50', 'P85', 'P97'].map(pk => ({
        name: pk, type: 'line' as const,
        data: visibleStandards.map(pt => [pt.month, getP(pt, pk)]),
        symbol: 'none' as const,
        lineStyle: { color: pc[pk], width: pw[pk] },
        silent: true as const,
      }))

      // Y轴范围计算（动态范围 + 8% padding）
      const allYValues: number[] = []
      filtered.forEach(d => allYValues.push(scaleValue(d.raw)))
      visibleStandards.forEach(pt => {
        allYValues.push(getP(pt, 'P3'))
        allYValues.push(getP(pt, 'P97'))
      })
      const positiveY = allYValues.filter(v => v > 0)
      const rawYMin = positiveY.length > 0 ? Math.min(...positiveY) : 2
      const rawYMax = positiveY.length > 0 ? Math.max(...positiveY) : 16
      const yPad = (rawYMax - rawYMin) * 0.08 || rawYMin * 0.08
      const yMin = Math.max(0, Math.floor((rawYMin - yPad) * 10) / 10)
      const yMax = Math.ceil((rawYMax + yPad) * 10) / 10

      const latest = filtered.reduce((a, b) => (a.date >= b.date ? a : b))

      const option = {
        tooltip: {
          ...WARM_TOOLTIP,
          // 点按记录点才触发（item）：点按刻度线 / 空白处不再弹出，避免误触
          trigger: 'item' as const,
          formatter: (p: { seriesName?: string; dataIndex: number }) => {
            if (!p || p.seriesName !== '宝宝') return ''
            const rec = filtered[p.dataIndex]
            if (!rec) return ''
            const pct = percentileAt(rec.ageMonths, rec.raw)
            const line1 = `${dayjs(rec.date).format('M/D')} · ${rec.ageMonths.toFixed(1)} 月龄`
            const line2 = `${cfg.label} ${cfg.format(rec.raw)}${cfg.unit}${pct !== null ? ` · P${pct}` : ''}`
            return `${line1}\n${line2}`
          },
        },
        legend: { data: ['P50', '宝宝', 'P3', 'P15', 'P85', 'P97'], bottom: 0, textStyle: { fontSize: 9 }, itemWidth: 16, itemHeight: 8, itemGap: 8 },
        grid: { left: 50, right: 16, top: 16, bottom: 52 },
        xAxis: {
          type: 'value' as const,
          name: '月龄',
          min: xMin,
          max: xMax,
          nameTextStyle: { fontSize: 10, color: '#C0A8AD' },
          axisLabel: {
            fontSize: 10,
            color: '#C0A8AD',
            formatter: (v: number) => {
              const n = Math.round(v * 10) / 10
              if (Number.isInteger(n)) return `${n}月`
              return `${n.toFixed(1)}月`
            },
          },
          splitLine: { lineStyle: { color: '#F5F0F2' } },
        },
        yAxis: {
          type: 'value' as const,
          name: cfg.unit,
          nameTextStyle: { fontSize: 10, color: '#6B7280' },
          min: yMin,
          max: yMax,
          axisLabel: {
            fontSize: 10,
            color: '#C0A8AD',
            formatter: (v: number) => v.toFixed(1),
          },
          splitLine: { lineStyle: { color: '#F5F0F2' } },
        },
        series: [
          ...ps,
          {
            name: '宝宝',
            type: 'line' as const,
            smooth: true,
            symbol: 'circle',
            symbolSize: 8,
            data: filtered.map(d => [d.ageMonths, scaleValue(d.raw)]),
            lineStyle: { color: '#F87098', width: 2 },
            itemStyle: { color: '#F87098', borderColor: '#fff', borderWidth: 2 },
            z: 10,
          },
        ],
      }

      return {
        ...base,
        latest: { raw: latest.raw, date: latest.date, percentile: percentileAt(latest.ageMonths, latest.raw) },
        option,
      }
    })
  }, [data, babyGender, babyBirthDate])

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
        <Text style={{ color: '#C0A8AD', fontSize: 13, marginBottom: 8 }}>暂无生长数据</Text>
        <Text style={{ color: '#D8C8D0', fontSize: 11 }}>开始记录宝宝的体重、身高、头围后，这里将展示生长曲线</Text>
      </View>
    )
  }

  const insights: string[] = []
  ;(views ?? []).forEach(v => {
    if (!v.latest || v.latest.percentile === null) return
    const p = v.latest.percentile
    const label = getPercentileLabel(p)
    const advice = p < 15 ? '建议咨询儿科医生评估发育状况'
      : p > 85 ? '注意饮食均衡，避免过度喂养'
      : '保持良好喂养习惯'
    insights.push(`${v.label}处于 P${p}（${label}），${advice}`)
  })

  return (
    <View>
      {(views ?? []).map(v => (
        <View key={v.measure} style={card}>
          <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <Text style={{ fontSize: 13, fontWeight: 500, color: '#4A3035' }}>{v.label}生长曲线</Text>
            {v.latest && (
              <Text style={{ fontSize: 11, color: '#F87098' }}>
                最新 {v.format(v.latest.raw)}{v.unit}
                {v.latest.percentile !== null ? ` · P${v.latest.percentile}` : ''}
              </Text>
            )}
          </View>
          {v.option ? (
            <EcChart option={v.option} height='400rpx' />
          ) : (
            <View style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 2px 6px' }}>
              <View style={{ width: 8, height: 8, borderRadius: '50%', background: '#E8E0E4' }} />
              <Text style={{ fontSize: 12, color: '#9A8090' }}>暂无{v.label}记录，可在记录页补充</Text>
            </View>
          )}
        </View>
      ))}

      {insights.length > 0 && (
        <View style={insCard}>
          <Text style={{ fontSize: 13, fontWeight: 500, color: '#4A3035', marginBottom: 8 }}>数据洞察</Text>
          <View>
            {insights.map((t, i) => (
              <Text key={i} style={{ fontSize: 12, color: '#6B6070', lineHeight: 1.6, display: 'block' }}>
                {'\u2022'} {t}
              </Text>
            ))}
          </View>
        </View>
      )}

      <Text style={{ fontSize: 10, color: '#C0A8AD', marginTop: 2, marginBottom: 12, display: 'block', textAlign: 'center' }}>
        曲线基于国家卫健委2023年版《中国7岁以下儿童生长发育参照标准》
      </Text>
    </View>
  )
}
