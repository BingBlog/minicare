/**
 * 饮食分析 Tab
 * 展示奶量趋势线、母乳/配方奶/辅食占比堆积图
 */
import React from 'react'
import { LineChart, StackedBarChart } from '@/components/charts'
import type { DailyFeedingData } from '@/api/report'

interface FeedingTabProps {
  data: DailyFeedingData[] | null
  loading: boolean
}

/** 格式化日期为简短标签（MM-DD -> M/D） */
function formatDateLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split('-')
  return `${parseInt(month)}/${parseInt(day)}`
}

export function FeedingTab({ data, loading }: FeedingTabProps) {
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
        <div className="text-gray-400 text-sm mb-2">暂无饮食数据</div>
        <div className="text-gray-300 text-xs">开始记录宝宝的饮食后，这里将展示分析图表</div>
      </div>
    )
  }

  // 折线图数据：每日配方奶量
  const lineChartData = data.map((d) => ({
    label: formatDateLabel(d.date),
    value: d.formulaMl,
  }))

  // 堆积柱状图数据：母乳次数、配方奶量（转换为等效次数）、辅食次数
  // 假设一次母乳喂养约 90ml，用于对比展示
  const stackedData = data.map((d) => ({
    label: formatDateLabel(d.date),
    values: {
      '母乳': d.breastCount,
      '配方奶': Math.round(d.formulaMl / 90), // 转换为次数
      '辅食': d.complementaryCount,
    },
  }))

  // 计算汇总数据
  const totalFormula = data.reduce((sum, d) => sum + d.formulaMl, 0)
  const avgFormula = Math.round(totalFormula / data.length)
  const totalBreast = data.reduce((sum, d) => sum + d.breastCount, 0)
  const totalComplementary = data.reduce((sum, d) => sum + d.complementaryCount, 0)

  return (
    <div className="space-y-6">
      {/* 汇总指标卡 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl p-3 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">日均奶量</div>
          <div className="text-lg font-semibold text-[#F87098]">{avgFormula}<span className="text-xs font-normal ml-0.5">ml</span></div>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">母乳次数</div>
          <div className="text-lg font-semibold text-[#9B8ED8]">{totalBreast}<span className="text-xs font-normal ml-0.5">次</span></div>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">辅食次数</div>
          <div className="text-lg font-semibold text-[#6BCB77]">{totalComplementary}<span className="text-xs font-normal ml-0.5">次</span></div>
        </div>
      </div>

      {/* 奶量趋势图 */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="text-sm font-medium text-gray-700 mb-3">配方奶量趋势</div>
        <LineChart
          data={lineChartData}
          height={180}
          fillArea
          smooth
          colors={{ primary: '#F87098' }}
          axis={{
            yFormat: (v) => `${v}`,
            xLabelInterval: Math.ceil(data.length / 5),
          }}
        />
      </div>

      {/* 饮食类型占比 */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="text-sm font-medium text-gray-700 mb-3">每日喂养类型分布</div>
        <StackedBarChart
          data={stackedData}
          height={180}
          seriesOrder={['母乳', '配方奶', '辅食']}
          seriesColors={{
            '母乳': '#9B8ED8',
            '配方奶': '#F87098',
            '辅食': '#6BCB77',
          }}
          axis={{
            yFormat: (v) => `${v}次`,
            xLabelInterval: Math.ceil(data.length / 5),
          }}
          showLegend
        />
      </div>

      {/* 数据洞察 */}
      <div className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-xl p-4">
        <div className="text-sm font-medium text-gray-700 mb-2">数据洞察</div>
        <div className="text-xs text-gray-600 space-y-1">
          {avgFormula > 0 && (
            <p>• 宝宝日均配方奶量 {avgFormula}ml，{avgFormula < 500 ? '建议关注是否摄入充足' : avgFormula > 1000 ? '奶量较高，注意观察是否有过度喂养' : '处于正常范围'}</p>
          )}
          {totalBreast > 0 && (
            <p>• 期间母乳喂养 {totalBreast} 次，母乳能为宝宝提供最佳营养和免疫保护</p>
          )}
          {totalComplementary > 0 && (
            <p>• 已添加辅食 {totalComplementary} 次，建议逐步增加辅食种类和质地</p>
          )}
        </div>
      </div>
    </div>
  )
}
