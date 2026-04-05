/**
 * 健康分析 Tab
 * 展示体温趋势、情绪/精神状态分布
 */
import React from 'react'
import { LineChart, DonutChart } from '@/components/charts'
import type { DailyHealthData } from '@/api/report'
import { MOOD_LABELS, SPIRIT_LABELS } from '@/lib/constants'

interface HealthTabProps {
  data: DailyHealthData[] | null
  loading: boolean
}

/** 格式化日期为简短标签（MM-DD -> M/D） */
function formatDateLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split('-')
  return `${parseInt(month)}/${parseInt(day)}`
}

export function HealthTab({ data, loading }: HealthTabProps) {
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
        <div className="text-gray-400 text-sm mb-2">暂无健康数据</div>
        <div className="text-gray-300 text-xs">开始记录宝宝的体温、情绪、精神状态后，这里将展示分析图表</div>
      </div>
    )
  }

  // 体温数据（过滤掉 null）
  const tempData = data.filter((d) => d.temperature !== null)
  const tempChartData = tempData.map((d) => ({
    label: formatDateLabel(d.date),
    value: d.temperature!,
  }))

  // 计算体温统计
  const temps = tempData.map((d) => d.temperature!)
  const avgTemp = temps.length > 0 ? (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1) : null
  const maxTemp = temps.length > 0 ? Math.max(...temps).toFixed(1) : null

  // 统计情绪分布
  const moodCounts: Record<string, number> = {}
  data.forEach((d) => {
    if (d.mood) {
      moodCounts[d.mood] = (moodCounts[d.mood] || 0) + 1
    }
  })
  const moodData = Object.entries(moodCounts).map(([key, value]) => ({
    label: MOOD_LABELS[key] || key,
    value,
    color: getMoodColor(key),
  }))

  // 统计精神状态分布
  const spiritCounts: Record<string, number> = {}
  data.forEach((d) => {
    if (d.spirit) {
      spiritCounts[d.spirit] = (spiritCounts[d.spirit] || 0) + 1
    }
  })
  const spiritData = Object.entries(spiritCounts).map(([key, value]) => ({
    label: SPIRIT_LABELS[key] || key,
    value,
    color: getSpiritColor(key),
  }))

  return (
    <div className="space-y-6">
      {/* 汇总指标卡 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl p-3 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">平均体温</div>
          <div className="text-lg font-semibold text-[#F87098]">
            {avgTemp || '--'}<span className="text-xs font-normal text-gray-400 ml-0.5">°C</span>
          </div>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">最高体温</div>
          <div className="text-lg font-semibold text-[#F5A962]">
            {maxTemp || '--'}<span className="text-xs font-normal text-gray-400 ml-0.5">°C</span>
          </div>
        </div>
      </div>

      {/* 体温趋势图 */}
      {tempChartData.length > 0 && (
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-sm font-medium text-gray-700 mb-3">体温变化</div>
          <LineChart
            data={tempChartData}
            height={180}
            colors={{ primary: '#F87098' }}
            axis={{
              yFormat: (v) => `${v}°C`,
              yMin: 36,
              yMax: 39,
              xLabelInterval: Math.ceil(tempChartData.length / 5),
            }}
          />
          <div className="text-xs text-gray-400 mt-2">
            正常体温范围：36.5°C - 37.5°C，超过 38°C 可能发热
          </div>
        </div>
      )}

      {/* 情绪分布 */}
      {moodData.length > 0 && (
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-sm font-medium text-gray-700 mb-3">情绪分布</div>
          <div className="flex justify-center">
            <DonutChart
              data={moodData}
              size={140}
              innerRadius={0.65}
              showCenter
              centerText="记录"
              centerValue={`${data.length}天`}
            />
          </div>
        </div>
      )}

      {/* 精神状态分布 */}
      {spiritData.length > 0 && (
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-sm font-medium text-gray-700 mb-3">精神状态分布</div>
          <div className="flex justify-center">
            <DonutChart
              data={spiritData}
              size={140}
              innerRadius={0.65}
              showCenter
              centerText="记录"
              centerValue={`${data.length}天`}
            />
          </div>
        </div>
      )}

      {/* 数据洞察 */}
      <div className="bg-gradient-to-r from-rose-50 to-pink-50 rounded-xl p-4">
        <div className="text-sm font-medium text-gray-700 mb-2">数据洞察</div>
        <div className="text-xs text-gray-600 space-y-1">
          {avgTemp && (
            <p>• 平均体温 {avgTemp}°C，{parseFloat(avgTemp) >= 36.5 && parseFloat(avgTemp) <= 37.5 ? '体温正常' : parseFloat(avgTemp) < 36.5 ? '体温偏低，注意保暖' : '体温偏高，注意观察'}</p>
          )}
          {maxTemp && parseFloat(maxTemp) >= 38 && (
            <p>• 期间有发热记录（最高 {maxTemp}°C），建议关注宝宝状态</p>
          )}
          {moodData.length > 0 && (
            <p>• 情绪方面：{moodData.sort((a, b) => b.value - a.value)[0]?.label || '--'} 出现最多</p>
          )}
        </div>
      </div>
    </div>
  )
}

/** 获取情绪对应的颜色 */
function getMoodColor(mood: string): string {
  const colors: Record<string, string> = {
    happy: '#6BCB77',     // 开心 - 绿色
    calm: '#7EC8E3',      // 平静 - 蓝色
    fussy: '#F5A962',     // 烦躁 - 橙色
    crying: '#F05060',    // 哭闹 - 红色
  }
  return colors[mood] || '#9CA3AF'
}

/** 获取精神状态对应的颜色 */
function getSpiritColor(spirit: string): string {
  const colors: Record<string, string> = {
    active: '#6BCB77',    // 精神活跃 - 绿色
    normal: '#7EC8E3',    // 精神正常 - 蓝色
    tired: '#F5A962',     // 有点累 - 橙色
    lethargic: '#F05060', // 萎靡 - 红色
  }
  return colors[spirit] || '#9CA3AF'
}
