/**
 * 睡眠分析 Tab
 * 展示每日睡眠时长趋势、夜间睡眠占比
 */
import React from 'react'
import { LineChart, BarChart } from '@/components/charts'
import type { DailySleepData } from '@/api/report'

interface SleepTabProps {
  data: DailySleepData[] | null
  loading: boolean
}

/** 格式化日期为简短标签（MM-DD -> M/D） */
function formatDateLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split('-')
  return `${parseInt(month)}/${parseInt(day)}`
}

/** 格式化分钟为小时分钟 */
function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours === 0) return `${mins}分钟`
  if (mins === 0) return `${hours}小时`
  return `${hours}小时${mins}分钟`
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

  // 折线图数据：每日睡眠时长
  const lineChartData = data.map((d) => ({
    label: formatDateLabel(d.date),
    value: Math.round(d.totalMin / 60 * 10) / 10, // 转换为小时，保留1位小数
  }))

  // 柱状图数据：夜间睡眠时长
  const barChartData = data.map((d) => ({
    label: formatDateLabel(d.date),
    value: Math.round(d.nightSleepMin / 60 * 10) / 10,
  }))

  // 计算汇总数据
  const totalSleep = data.reduce((sum, d) => sum + d.totalMin, 0)
  const avgSleep = Math.round(totalSleep / data.length)
  const totalNightSleep = data.reduce((sum, d) => sum + d.nightSleepMin, 0)
  const avgNightSleep = Math.round(totalNightSleep / data.length)
  const nightPercent = Math.round((totalNightSleep / totalSleep) * 100)
  const totalSessions = data.reduce((sum, d) => sum + d.sessionCount, 0)
  const avgSessions = (totalSessions / data.length).toFixed(1)

  return (
    <div className="space-y-6">
      {/* 汇总指标卡 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl p-3 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">日均睡眠</div>
          <div className="text-lg font-semibold text-[#9B8ED8]">{formatDuration(avgSleep)}</div>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">日均睡眠次数</div>
          <div className="text-lg font-semibold text-[#7EC8E3]">{avgSessions}<span className="text-xs font-normal ml-0.5">次</span></div>
        </div>
      </div>

      {/* 睡眠时长趋势 */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="text-sm font-medium text-gray-700 mb-3">每日睡眠时长</div>
        <LineChart
          data={lineChartData}
          height={180}
          fillArea
          smooth
          colors={{ primary: '#9B8ED8' }}
          axis={{
            yFormat: (v) => `${v}h`,
            xLabelInterval: Math.ceil(data.length / 5),
          }}
        />
      </div>

      {/* 夜间睡眠 */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium text-gray-700">夜间睡眠（22:00-06:00）</div>
          <div className="text-xs text-gray-500">占总睡眠 {nightPercent}%</div>
        </div>
        <BarChart
          data={barChartData}
          height={180}
          colors={{ primary: '#7EC8E3' }}
          axis={{
            yFormat: (v) => `${v}h`,
            xLabelInterval: Math.ceil(data.length / 5),
          }}
        />
      </div>

      {/* 数据洞察 */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-4">
        <div className="text-sm font-medium text-gray-700 mb-2">数据洞察</div>
        <div className="text-xs text-gray-600 space-y-1">
          <p>• 日均睡眠 {formatDuration(avgSleep)}，{avgSleep >= 12 * 60 ? '睡眠时间充足' : avgSleep >= 10 * 60 ? '睡眠时间适中' : '睡眠时间偏少，建议调整作息'}</p>
          <p>• 夜间睡眠占比 {nightPercent}%，{nightPercent >= 60 ? '夜间睡眠比例良好' : '夜间睡眠较少，建议培养夜间睡眠习惯'}</p>
          <p>• 日均睡眠 {avgSessions} 次，每次平均 {formatDuration(Math.round(avgSleep / parseFloat(avgSessions)))}</p>
        </div>
      </div>
    </div>
  )
}
