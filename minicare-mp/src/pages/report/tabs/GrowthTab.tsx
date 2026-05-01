/**
 * 生长分析 Tab（MP 版，与 Web pages/report/tabs/GrowthTab.tsx 对齐）
 *
 * 展示体重/身高/头围生长曲线，叠加国家百分位标准
 */
import { View, Text } from '@tarojs/components'
import { useState, useMemo } from 'react'
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
import { formatDateCN, formatAgeMonths } from '@/lib/utils'

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

const measureConfig = {
  weight: { label: '体重', unit: 'kg', format: (v: number) => (v / 1000).toFixed(2) },
  height: { label: '身高', unit: 'cm', format: (v: number) => (v / 10).toFixed(1) },
  head: { label: '头围', unit: 'cm', format: (v: number) => (v / 10).toFixed(1) },
}



export function GrowthTab({ data, loading, babyGender, babyBirthDate }: GrowthTabProps) {
  const [activeMeasure, setActiveMeasure] = useState<MeasureType>('weight')

  const chartOption = useMemo(() => {
    if (!data?.length) return {}
    const gender = babyGender || 'male'
    const standards = getGrowthStandardsByGender(gender)
    const effectiveBirthDate = babyBirthDate ?? [...data].sort((a, b) => a.date.localeCompare(b.date))[0].date
    const recordsWithAge = data.map(d => ({
      ...d,
      ageMonths: effectiveBirthDate ? calculateAgeMonths(effectiveBirthDate, d.date) : 0,
    }))
    const filtered = recordsWithAge
      .filter(d => {
        const v = activeMeasure === 'weight' ? d.weightG : activeMeasure === 'height' ? d.heightMm : d.headMm
        return v !== null
      })
      .map(d => ({
        ageMonths: d.ageMonths,
        value: activeMeasure === 'weight' ? d.weightG! : activeMeasure === 'height' ? d.heightMm! : d.headMm!,
      }))

    const maxAge = Math.max(1, ...filtered.map(d => d.ageMonths))
    const pc: Record<string, string> = { P3: '#D0D0D0', P15: '#B0B0B0', P50: '#F87098', P85: '#B0B0B0', P97: '#D0D0D0' }
    const pw: Record<string, number> = { P3: 1, P15: 1, P50: 2, P85: 1, P97: 1 }
    const getP = (pt: GrowthStandardPoint, key: string) => {
      const k = key.toLowerCase()
      if (activeMeasure === 'weight') {
        const m: Record<string, number> = { p3: pt.weightP3, p15: pt.weightP15, p50: pt.weightP50, p85: pt.weightP85, p97: pt.weightP97 }
        return (m[k] ?? 0) * 1000
      }
      if (activeMeasure === 'height') {
        const m: Record<string, number> = { p3: pt.heightP3, p15: pt.heightP15, p50: pt.heightP50, p85: pt.heightP85, p97: pt.heightP97 }
        return (m[k] ?? 0) * 10
      }
      const m: Record<string, number> = { p3: pt.headP3, p15: pt.headP15, p50: pt.headP50, p85: pt.headP85, p97: pt.headP97 }
      return (m[k] ?? 0) * 10
    }
    const ps = ['P3', 'P15', 'P50', 'P85', 'P97'].map(pk => ({
      name: pk, type: 'line' as const,
      data: standards.map(pt => [pt.month, getP(pt, pk)]),
      symbol: 'none' as const,
      lineStyle: { color: pc[pk], width: pw[pk] },
      silent: true as const,
    }))
    return {
      tooltip: { trigger: 'axis' as const, confine: true },
      legend: { data: ['P3', 'P15', 'P50', 'P85', 'P97', '\u5b9d\u5b9d'], bottom: 0, textStyle: { fontSize: 10 }, selected: { P3: false, P15: false, P85: false, P97: false } },
      grid: { left: 50, right: 16, top: 16, bottom: 36 },
      xAxis: { type: 'value' as const, name: '\u6708\u9f84', min: 0, max: Math.max(maxAge * 1.1, 6), nameTextStyle: { fontSize: 10, color: '#C0A8AD' }, axisLabel: { fontSize: 10, color: '#C0A8AD' }, splitLine: { lineStyle: { color: '#F5F0F2' } } },
      yAxis: { type: 'value' as const, axisLabel: { fontSize: 10, color: '#C0A8AD' }, splitLine: { lineStyle: { color: '#F5F0F2' } } },
      series: [...ps, { name: '\u5b9d\u5b9d', type: 'scatter' as const, data: filtered.map(d => [d.ageMonths, d.value]), symbolSize: 8, itemStyle: { color: '#F87098', borderColor: '#fff', borderWidth: 2 }, z: 10 }],
    }
  }, [data, babyGender, babyBirthDate, activeMeasure])

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

  const gender = babyGender || 'male'
  const standards = getGrowthStandardsByGender(gender)

  const effectiveBirthDate = babyBirthDate ?? (data.length > 0 ? [...data].sort((a, b) => a.date.localeCompare(b.date))[0].date : null)

  const recordsWithAge = data.map(d => ({
    ...d,
    ageMonths: effectiveBirthDate ? calculateAgeMonths(effectiveBirthDate, d.date) : 0,
  }))

  const latestValid = [...recordsWithAge].reverse().find(d => {
    if (activeMeasure === 'weight') return d.weightG !== null
    if (activeMeasure === 'height') return d.heightMm !== null
    return d.headMm !== null
  })

  const getPercentile = () => {
    if (!latestValid) return null
    const ageMonths = latestValid.ageMonths
    const value =
      activeMeasure === 'weight' ? latestValid.weightG
      : activeMeasure === 'height' ? latestValid.heightMm
      : latestValid.headMm

    if (value === null) return null
    const std = getStandardAtAge(standards, ageMonths)
    if (!std) return null

    if (activeMeasure === 'weight') return calculatePercentile(value / 1000, std.weightP3, std.weightP97)
    if (activeMeasure === 'height') return calculatePercentile(value / 10, std.heightP3, std.heightP97)
    return calculatePercentile(value / 10, std.headP3, std.headP97)
  }

  const percentile = getPercentile()
  const percentileLabel = percentile !== null ? getPercentileLabel(percentile) : null

  const config = measureConfig[activeMeasure]

  const measureConfigKeys: MeasureType[] = ['weight', 'height', 'head']

  return (
    <View>
      {/* 测量类型切换 */}
      <View style={{ display: 'flex', gap: 6, background: '#F5F0F2', borderRadius: 10, padding: 3, marginBottom: 12 }}>
        {measureConfigKeys.map(m => (
          <View
            key={m}
            onClick={() => setActiveMeasure(m)}
            style={{
              flex: 1,
              padding: '8px 0',
              textAlign: 'center',
              fontSize: 13,
              fontWeight: 500,
              borderRadius: 8,
              background: activeMeasure === m ? '#fff' : 'transparent',
              color: activeMeasure === m ? '#F87098' : '#9A8090',
              boxShadow: activeMeasure === m ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            {measureConfig[m].label}
          </View>
        ))}
      </View>

      {/* 最新数据卡 */}
      {latestValid && (
        <View style={card}>
          <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={{ fontSize: 11, color: '#9A8090', marginBottom: 4, display: 'block' }}>最新{config.label}</Text>
              <View style={{ display: 'flex', alignItems: 'baseline' }}>
                <Text style={{ fontSize: 22, fontWeight: 600, color: '#F87098' }}>
                  {config.format(
                    activeMeasure === 'weight' ? latestValid.weightG!
                    : activeMeasure === 'height' ? latestValid.heightMm!
                    : latestValid.headMm!
                  )}
                </Text>
                <Text style={{ fontSize: 13, color: '#C0A8AD', marginLeft: 4 }}>{config.unit}</Text>
              </View>
              <Text style={{ fontSize: 11, color: '#C0A8AD', marginTop: 2, display: 'block' }}>
                {formatDateCN(latestValid.date)} · {formatAgeMonths(latestValid.ageMonths)}
              </Text>
            </View>
            {percentileLabel && (
              <View style={{ textAlign: 'right' }}>
                <Text style={{ fontSize: 11, color: '#9A8090', marginBottom: 4, display: 'block' }}>生长百分位</Text>
                <Text style={{ fontSize: 18, fontWeight: 600, color: '#9B8ED8' }}>P{percentile}</Text>
                <Text style={{ fontSize: 11, color: '#C0A8AD', display: 'block' }}>{percentileLabel}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* 生长曲线图 */}
      <View style={card}>
        <Text style={{ fontSize: 13, fontWeight: 500, color: '#4A3035', marginBottom: 10 }}>{config.label}生长曲线</Text>
        <EcChart option={chartOption} height='400rpx' />
        <Text style={{ fontSize: 10, color: '#C0A8AD', marginTop: 6, display: 'block', textAlign: 'center' }}>
          曲线基于国家卫健委2023年版《中国7岁以下儿童生长发育参照标准》
        </Text>
      </View>

      {/* 数据洞察 */}
      {percentileLabel && (
        <View style={insCard}>
          <Text style={{ fontSize: 13, fontWeight: 500, color: '#4A3035', marginBottom: 8 }}>数据洞察</Text>
          <View>
            <Text style={{ fontSize: 12, color: '#6B6070', lineHeight: 1.6, display: 'block' }}>
              {'\u2022'} 宝宝{config.label}处于 P{percentile} 百分位，{percentileLabel}
            </Text>
            {percentile !== null && percentile < 15 && (
              <Text style={{ fontSize: 12, color: '#6B6070', lineHeight: 1.6, display: 'block' }}>
                {'\u2022'} {config.label}偏低，建议咨询儿科医生评估生长发育状况
              </Text>
            )}
            {percentile !== null && percentile > 85 && (
              <Text style={{ fontSize: 12, color: '#6B6070', lineHeight: 1.6, display: 'block' }}>
                {'\u2022'} {config.label}偏高，注意饮食均衡，避免过度喂养
              </Text>
            )}
            {percentile !== null && percentile >= 15 && percentile <= 85 && (
              <Text style={{ fontSize: 12, color: '#6B6070', lineHeight: 1.6, display: 'block' }}>
                {'\u2022'} 生长曲线在正常范围内，继续保持良好的喂养习惯
              </Text>
            )}
          </View>
        </View>
      )}
    </View>
  )
}
