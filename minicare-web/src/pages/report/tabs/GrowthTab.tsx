/**
 * 生长分析 Tab
 * 展示体重/身高/头围生长曲线，叠加国家百分位标准
 */
import React, { useState, useRef, useEffect } from 'react'
import dayjs from 'dayjs'
import { GrowthChart } from '@/components/charts'
import type { GrowthRecord } from '@/api/report'
import type { GrowthStandardPoint } from '@/lib/growth-standards'
import {
  getGrowthStandardsByGender,
  getStandardAtAge,
  calculatePercentile,
  getPercentileLabel,
} from '@/lib/growth-standards'
import type { GrowthChartProps } from '@/components/charts/types'

interface GrowthTabProps {
  data: GrowthRecord[] | null
  loading: boolean
  babyGender: 'male' | 'female' | null
  babyBirthDate: string | null
}

type MeasureType = 'weight' | 'height' | 'head'

/** 平均每月天数（与儿保常用「日龄/30.44」一致，避免仅用年月导致同月多点 X 重合） */
const DAYS_PER_MONTH = 365.25 / 12

/** 计算精确月龄（可小数），用于生长曲线横轴定位 */
function calculateAgeMonths(birthDate: string, recordDate: string): number {
  // 兼容 "2025-12-25T16:00:00.000Z" 和 "2025-12-25" 两种格式，统一截取前 10 位
  const birth = dayjs(birthDate.slice(0, 10))
  const record = dayjs(recordDate.slice(0, 10))
  if (!birth.isValid() || !record.isValid()) return 0
  const diffDays = record.diff(birth, 'day')
  return Math.max(0, diffDays / DAYS_PER_MONTH)
}

function formatAgeMonthsForCard(ageMonths: number): string {
  const n = Math.round(ageMonths * 10) / 10
  return Number.isInteger(n) ? `${n}月龄` : `${n.toFixed(1)}月龄`
}

/** 格式化日期显示 */
function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-')
  return `${parseInt(month)}月${parseInt(day)}日`
}

/** GrowthChart 百分位曲线：g / mm，与 GrowthChart 内部换算一致 */
function buildChartPercentiles(
  standardRows: GrowthStandardPoint[],
  measure: MeasureType,
  g: 'male' | 'female'
): GrowthChartProps['percentiles'] {
  const curveFor = (pt: GrowthStandardPoint) => {
    if (measure === 'weight') {
      return {
        p3: pt.weightP3 * 1000,
        p15: pt.weightP15 * 1000,
        p50: pt.weightP50 * 1000,
        p85: pt.weightP85 * 1000,
        p97: pt.weightP97 * 1000,
      }
    }
    if (measure === 'height') {
      return {
        p3: pt.heightP3 * 10,
        p15: pt.heightP15 * 10,
        p50: pt.heightP50 * 10,
        p85: pt.heightP85 * 10,
        p97: pt.heightP97 * 10,
      }
    }
    return {
      p3: pt.headP3 * 10,
      p15: pt.headP15 * 10,
      p50: pt.headP50 * 10,
      p85: pt.headP85 * 10,
      p97: pt.headP97 * 10,
    }
  }
  return standardRows.map((pt) => ({
    ageMonths: pt.month,
    [g]: curveFor(pt),
  }))
}

export function GrowthTab({ data, loading, babyGender, babyBirthDate }: GrowthTabProps) {
  const [activeMeasure, setActiveMeasure] = useState<MeasureType>('weight')

  // 感知图表容器宽度，传给 GrowthChart 防止超出屏幕
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const [chartContainerWidth, setChartContainerWidth] = useState<number>(0)
  useEffect(() => {
    const el = chartContainerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width) setChartContainerWidth(Math.floor(width))
    })
    observer.observe(el)
    // 立即读取一次初始宽度
    setChartContainerWidth(Math.floor(el.getBoundingClientRect().width))
    return () => observer.disconnect()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400 text-sm">加载中...</div>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="text-gray-400 text-sm mb-2">暂无生长数据</div>
        <div className="text-gray-300 text-xs">开始记录宝宝的体重、身高、头围后，这里将展示生长曲线</div>
      </div>
    )
  }

  const gender = babyGender || 'male'
  const standards = getGrowthStandardsByGender(gender)

  // 计算基准日期：优先用 babyBirthDate，没有则用数据中最早的记录日期（保证 X 轴可以正常展开）
  const effectiveBirthDate = babyBirthDate ?? (data.length > 0 ? [...data].sort((a, b) => a.date.localeCompare(b.date))[0].date : null)

  // 计算每条记录的月龄
  const recordsWithAge = data.map((d) => ({
    ...d,
    ageMonths: effectiveBirthDate ? calculateAgeMonths(effectiveBirthDate, d.date) : 0,
  }))

  // 获取最新一条有效记录
  const latestValid = [...recordsWithAge].reverse().find((d) => {
    if (activeMeasure === 'weight') return d.weightG !== null
    if (activeMeasure === 'height') return d.heightMm !== null
    return d.headMm !== null
  })

  // 计算百分位
  const getPercentile = () => {
    if (!latestValid) return null
    const ageMonths = latestValid.ageMonths
    const value =
      activeMeasure === 'weight'
        ? latestValid.weightG
        : activeMeasure === 'height'
          ? latestValid.heightMm
          : latestValid.headMm

    if (value === null) return null

    const std = getStandardAtAge(standards, ageMonths)
    if (!std) return null

    if (activeMeasure === 'weight') {
      return calculatePercentile(value / 1000, std.weightP3, std.weightP97)
    }
    if (activeMeasure === 'height') {
      return calculatePercentile(value / 10, std.heightP3, std.heightP97)
    }
    return calculatePercentile(value / 10, std.headP3, std.headP97)
  }

  const percentile = getPercentile()
  const percentileLabel = percentile !== null ? getPercentileLabel(percentile) : null

  // 转换为图表数据格式
  const chartData = recordsWithAge
    .filter((d) => {
      const value =
        activeMeasure === 'weight'
          ? d.weightG
          : activeMeasure === 'height'
            ? d.heightMm
            : d.headMm
      return value !== null
    })
    .map((d) => ({
      ageMonths: d.ageMonths,
      date: d.date,
      value:
        activeMeasure === 'weight'
          ? d.weightG!
          : activeMeasure === 'height'
            ? d.heightMm!
            : d.headMm!,
      unit: (activeMeasure === 'weight' ? 'g' : 'mm') as 'g' | 'mm',
    }))

  // 测量类型配置
  const measureConfig = {
    weight: { label: '体重', unit: 'kg', format: (v: number) => (v / 1000).toFixed(2) },
    height: { label: '身高', unit: 'cm', format: (v: number) => (v / 10).toFixed(1) },
    head: { label: '头围', unit: 'cm', format: (v: number) => (v / 10).toFixed(1) },
  }

  const config = measureConfig[activeMeasure]

  const chartPercentiles = buildChartPercentiles(standards, activeMeasure, gender)

  return (
    <div className="space-y-4">
      {/* 测量类型切换 */}
      <div className="flex gap-2 bg-gray-100 rounded-lg p-1">
        {(['weight', 'height', 'head'] as MeasureType[]).map((m) => (
          <button
            key={m}
            onClick={() => setActiveMeasure(m)}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              activeMeasure === m
                ? 'bg-white text-[#F87098] shadow-sm'
                : 'text-gray-500'
            }`}
          >
            {measureConfig[m].label}
          </button>
        ))}
      </div>

      {/* 最新数据卡 */}
      {latestValid && (
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-500 mb-1">最新{config.label}</div>
              <div className="text-2xl font-semibold text-[#F87098]">
                {config.format(
                  activeMeasure === 'weight'
                    ? latestValid.weightG!
                    : activeMeasure === 'height'
                      ? latestValid.heightMm!
                      : latestValid.headMm!
                )}
                <span className="text-sm font-normal text-gray-400 ml-1">{config.unit}</span>
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {formatDate(latestValid.date)} · {formatAgeMonthsForCard(latestValid.ageMonths)}
              </div>
            </div>
            {percentileLabel && (
              <div className="text-right">
                <div className="text-xs text-gray-500 mb-1">生长百分位</div>
                <div className="text-lg font-semibold text-[#9B8ED8]">P{percentile}</div>
                <div className="text-xs text-gray-400">{percentileLabel}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 生长曲线图 */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="text-sm font-medium text-gray-700 mb-3">{config.label}生长曲线</div>
        <div ref={chartContainerRef}>
          <GrowthChart
            data={chartData}
            percentiles={chartPercentiles}
            gender={gender}
            measureType={activeMeasure}
            height={260}
            containerWidth={chartContainerWidth || undefined}
          />
        </div>
        <div className="text-xs text-gray-400 mt-2 text-center">
          曲线基于国家卫健委2023年版《中国7岁以下儿童生长发育参照标准》
        </div>
      </div>

      {/* 数据洞察 */}
      {percentileLabel && (
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-4">
          <div className="text-sm font-medium text-gray-700 mb-2">数据洞察</div>
          <div className="text-xs text-gray-600 space-y-1">
            <p>• 宝宝{config.label}处于 P{percentile} 百分位，{percentileLabel}</p>
            {percentile !== null && percentile < 15 && (
              <p>• {config.label}偏低，建议咨询儿科医生评估生长发育状况</p>
            )}
            {percentile !== null && percentile > 85 && (
              <p>• {config.label}偏高，注意饮食均衡，避免过度喂养</p>
            )}
            {percentile !== null && percentile >= 15 && percentile <= 85 && (
              <p>• 生长曲线在正常范围内，继续保持良好的喂养习惯</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
