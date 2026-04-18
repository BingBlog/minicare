/**
 * 尿布分析 Tab
 * 展示每日大便次数、每日尿布类型（堆积柱状）
 */
import React from 'react'
import { BarChart, StackedBarChart } from '@/components/charts'
import type { DailyDiaperData } from '@/api/report'
import { useAppConfig } from '@/lib/useAppConfig'
import { formatDateSlash } from '@/lib/utils'

const DIAPER_STACK_KEYS = ['wet', 'dirty', 'mixed'] as const

const DIAPER_STACK_COLORS: Record<(typeof DIAPER_STACK_KEYS)[number], string> = {
  wet: '#7EC8E3',
  dirty: '#F5A962',
  mixed: '#9B8ED8',
}

interface DiaperTabProps {
  data: DailyDiaperData[] | null
  loading: boolean
}

export function DiaperTab({ data, loading }: DiaperTabProps) {
  const { getLabel } = useAppConfig()

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
        <div className="text-gray-400 text-sm mb-2">暂无尿布数据</div>
        <div className="text-gray-300 text-xs">开始记录宝宝的尿布情况后，这里将展示分析图表</div>
      </div>
    )
  }

  // 柱状图数据：每日大便次数
  const barChartData = data.map((d) => ({
    label: formatDateSlash(d.date),
    value: d.dirtyCount,
  }))

  // 计算汇总数据
  const totalWet = data.reduce((sum, d) => sum + d.wetCount, 0)
  const totalDirty = data.reduce((sum, d) => sum + d.dirtyCount, 0)
  const totalMixed = data.reduce((sum, d) => sum + d.mixedCount, 0)
  const avgDirtyPerDay = (totalDirty / data.length).toFixed(1)
  const avgWetPerDay = (totalWet / data.length).toFixed(1)

  const diaperStackedData = data.map((d) => ({
    label: formatDateSlash(d.date),
    values: {
      wet: d.wetCount,
      dirty: d.dirtyCount,
      mixed: d.mixedCount,
    },
  }))

  const seriesLabels = Object.fromEntries(
    DIAPER_STACK_KEYS.map((k) => [k, getLabel('diaperType', k)]),
  ) as Record<string, string>

  return (
    <div className="space-y-6">
      {/* 汇总指标卡 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl p-3 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">日均小便</div>
          <div className="text-lg font-semibold text-[#7EC8E3]">{avgWetPerDay}<span className="text-xs font-normal ml-0.5">次/天</span></div>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">日均大便</div>
          <div className="text-lg font-semibold text-[#F5A962]">{avgDirtyPerDay}<span className="text-xs font-normal ml-0.5">次/天</span></div>
        </div>
      </div>

      {/* 大便次数趋势 */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="text-sm font-medium text-gray-700 mb-3">每日大便次数</div>
        <BarChart
          data={barChartData}
          height={180}
          colors={{ primary: '#F5A962' }}
          axis={{
            yFormat: (v) => `${v}`,
            yMax: Math.max(5, ...barChartData.map(d => d.value)),
          }}
        />
      </div>

      {/* 每日尿布类型（堆积柱状，Y 轴为次数） */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="text-sm font-medium text-gray-700 mb-3">每日尿布类型</div>
        <StackedBarChart
          data={diaperStackedData}
          height={200}
          seriesOrder={[...DIAPER_STACK_KEYS]}
          seriesColors={DIAPER_STACK_COLORS}
          seriesLabels={seriesLabels}
          axis={{
            yFormat: (v) => `${Math.round(v)}次`,
          }}
          showLegend
        />
      </div>

      {/* 数据洞察 */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-4">
        <div className="text-sm font-medium text-gray-700 mb-2">数据洞察</div>
        <div className="text-xs text-gray-600 space-y-1">
          <p>• 日均小便 {avgWetPerDay} 次，{parseFloat(avgWetPerDay) >= 6 ? '排尿正常，水分摄入充足' : '排尿较少，建议关注水分摄入'}</p>
          <p>• 日均大便 {avgDirtyPerDay} 次，{parseFloat(avgDirtyPerDay) >= 1 && parseFloat(avgDirtyPerDay) <= 4 ? '排便频率正常' : parseFloat(avgDirtyPerDay) < 1 ? '排便较少，注意观察是否有便秘' : '排便频繁，关注宝宝状态'}</p>
          {totalMixed > 0 && (
            <p>• 混合型尿布 {totalMixed} 次，说明宝宝大小便规律较规律</p>
          )}
        </div>
      </div>
    </div>
  )
}
