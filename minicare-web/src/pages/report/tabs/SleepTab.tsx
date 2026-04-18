/**
 * 睡眠分析 Tab
 * 展示每日睡眠时长趋势、夜间睡眠占比
 */
import React from 'react'
import { LineChart } from '@/components/charts'
import type { DailySleepData } from '@/api/report'
import { formatDateSlash, formatDurationMinutes } from '@/lib/utils'

interface SleepTabProps {
  data: DailySleepData[] | null
  loading: boolean
}

/** 分钟转图表用小时（保留 1 位小数） */
function minToHoursChart(min: number): number {
  return Math.round((min / 60) * 10) / 10
}

export function SleepTab({ data, loading }: SleepTabProps) {
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
        <div className="text-gray-400 text-sm mb-2">暂无睡眠数据</div>
        <div className="text-gray-300 text-xs">开始记录宝宝的睡眠后，这里将展示分析图表</div>
      </div>
    )
  }

  const seriesData = data.map((d) => ({
    label: formatDateSlash(d.date),
    values: {
      total: minToHoursChart(Number(d.totalMin) || 0),
      night: minToHoursChart(Number(d.nightSleepMin) || 0),
    },
  }))

  const flatHours = seriesData.flatMap((d) => [d.values.total, d.values.night])
  const vmaxHours = Math.max(0, ...flatHours)
  const rawYMaxHours = vmaxHours > 0 ? vmaxHours * 1.1 : 0
  const yTicks = 4
  const sleepYMax =
    rawYMaxHours <= 0 ? 1 : Math.max(1, Math.ceil(rawYMaxHours / yTicks) * yTicks)

  const totalSleep = data.reduce((sum, d) => sum + (Number(d.totalMin) || 0), 0)
  const avgSleep = data.length > 0 ? Math.round(totalSleep / data.length) : 0
  const totalNightSleep = data.reduce((sum, d) => sum + (Number(d.nightSleepMin) || 0), 0)
  const nightPercent =
    totalSleep > 0 ? Math.round((totalNightSleep / totalSleep) * 100) : 0

  const totalSessions = data.reduce((sum, d) => sum + (Number(d.sessionCount) || 0), 0)
  const avgSessionsNum = data.length > 0 ? totalSessions / data.length : 0
  const avgSessions = Number.isFinite(avgSessionsNum) ? avgSessionsNum.toFixed(1) : '0.0'
  const avgPerSessionMin =
    avgSessionsNum > 0 ? Math.round(avgSleep / avgSessionsNum) : 0

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl p-3 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">日均睡眠</div>
          <div className="text-lg font-semibold text-[#9B8ED8]">{formatDurationMinutes(avgSleep)}</div>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">日均睡眠次数</div>
          <div className="text-lg font-semibold text-[#7EC8E3]">
            {avgSessions}
            <span className="text-xs font-normal ml-0.5">次</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium text-gray-700">每日睡眠与夜间睡眠</div>
          <div className="text-xs text-gray-500">夜间：22:00–06:00，占全部睡眠 {nightPercent}%</div>
        </div>
        <LineChart
          seriesData={seriesData}
          seriesOrder={['total', 'night']}
          seriesLabels={{
            total: '每日睡眠',
            night: '夜间睡眠',
          }}
          height={200}
          fillArea
          smooth
          showDots={false}
          colors={{ primary: '#9B8ED8', secondary: '#7EC8E3' }}
          axis={{
            yMin: 0,
            yMax: sleepYMax,
            yFormat: (v) => {
              const n = Math.round(v * 100) / 100
              if (Number.isInteger(n)) return `${n}h`
              const t = n.toFixed(1)
              return t.endsWith('.0') ? `${Math.round(n)}h` : `${t}h`
            },
          }}
        />
      </div>

      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-4">
        <div className="text-sm font-medium text-gray-700 mb-2">数据洞察</div>
        <div className="text-xs text-gray-600 space-y-1">
          <p>
            • 日均睡眠 {formatDurationMinutes(avgSleep)}，
            {avgSleep >= 12 * 60
              ? '睡眠时间充足'
              : avgSleep >= 10 * 60
                ? '睡眠时间适中'
                : '睡眠时间偏少，建议调整作息'}
          </p>
          <p>
            • 夜间睡眠占比 {nightPercent}%，
            {nightPercent >= 60 ? '夜间睡眠比例良好' : '夜间睡眠较少，建议培养夜间睡眠习惯'}
          </p>
          <p>
            • 日均睡眠 {avgSessions} 次，每次平均 {formatDurationMinutes(avgPerSessionMin)}
          </p>
        </div>
      </div>
    </div>
  )
}
