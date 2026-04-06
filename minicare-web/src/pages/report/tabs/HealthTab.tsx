/**
 * 健康分析 Tab
 * 展示体温与情绪散点分布、精神状态分布
 */
import React from 'react'
import { ScatterChart, DonutChart } from '@/components/charts'
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

/** 情绪在 Y 轴上的数值：越高越偏正面（视觉上更靠上） */
const MOOD_Y: Record<string, number> = {
  happy: 3,
  neutral: 2,
  fussy: 1,
  crying: 0,
}

/** 体温越高散点越大（36～40.5°C 映射到半径约 3.5～11） */
function tempToRadius(temp: number): number {
  const clamped = Math.max(36, Math.min(40.5, temp))
  return 3.5 + ((clamped - 36) / (40.5 - 36)) * 7.5
}

/** 烦躁、哭闹视为异常，散点更大 */
function moodToRadius(mood: string): number {
  return mood === 'fussy' || mood === 'crying' ? 9 : 4
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

  const xLabels = data.map((d) => formatDateLabel(d.date))
  const xSlotCount = data.length

  const tempPoints = data
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => d.temperature !== null)
    .map(({ d, i }) => ({
      xSlot: i,
      y: d.temperature!,
      r: tempToRadius(d.temperature!),
      color: d.temperature! > 37.4 ? '#F05060' : '#A8D8A8',
    }))

  const temps = data.filter((d) => d.temperature !== null).map((d) => d.temperature!)
  const maxTemp = temps.length > 0 ? Math.max(...temps) : null

  const moodPoints = data
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => d.mood && MOOD_Y[d.mood] !== undefined)
    .map(({ d, i }) => ({
      xSlot: i,
      y: MOOD_Y[d.mood!],
      r: moodToRadius(d.mood!),
      color: getMoodColor(d.mood!),
    }))

  // 统计情绪分布（数据洞察）
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

  const moodYFormat = (v: number) => {
    const map: Record<number, string> = {
      0: MOOD_LABELS.crying,
      1: MOOD_LABELS.fussy,
      2: MOOD_LABELS.neutral,
      3: MOOD_LABELS.happy,
    }
    return map[Math.round(v)] ?? ''
  }

  return (
    <div className="space-y-6">
      {/* 体温散点 */}
      {tempPoints.length > 0 && (
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-sm font-medium text-gray-700 mb-3">体温</div>
          <ScatterChart
            points={tempPoints}
            xSlotCount={xSlotCount}
            xLabels={xLabels}
            yMin={36}
            yMax={39}
            yFormat={(v) => `${v.toFixed(1)}°C`}
            yTicks={4}
            height={200}
          />
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: '#A8D8A8' }}></span>
              正常（≤37.4°C）
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: '#F05060' }}></span>
              偏高（&gt;37.4°C）
            </span>
          </div>
        </div>
      )}

      {/* 情绪散点 */}
      {moodPoints.length > 0 && (
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-sm font-medium text-gray-700 mb-3">情绪</div>
          <ScatterChart
            points={moodPoints}
            xSlotCount={xSlotCount}
            xLabels={xLabels}
            yMin={0}
            yMax={3}
            yFormat={moodYFormat}
            yTicks={3}
            height={220}
          />
          <div className="text-xs text-gray-400 mt-2">
            纵轴为情绪倾向；圆点越大表示烦躁、哭闹等需关注状态
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
          {maxTemp !== null && maxTemp >= 38 && (
            <p>• 期间有发热记录（最高 {maxTemp.toFixed(1)}°C），建议关注宝宝状态</p>
          )}
          {maxTemp !== null && maxTemp < 38 && temps.some((t) => t >= 37.5 && t < 38) && (
            <p>• 部分时段体温偏高（37.5°C 以上），建议继续观察</p>
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
    happy: '#6BCB77',
    neutral: '#7EC8E3',
    fussy: '#F5A962',
    crying: '#F05060',
  }
  return colors[mood] || '#9CA3AF'
}

/** 获取精神状态对应的颜色 */
function getSpiritColor(spirit: string): string {
  const colors: Record<string, string> = {
    active: '#6BCB77',
    normal: '#7EC8E3',
    tired: '#F5A962',
    lethargic: '#F05060',
  }
  return colors[spirit] || '#9CA3AF'
}
