/**
 * ChatChartCard — 对话消息内的图表卡（PRD-013 US-06 / TECH-028 §3.1）
 *
 * 形态：通栏附属卡（文字气泡下方），自上而下 = 图标题 → 图表本体 → 图注。
 * 复用 EcChart（canvas 2d 同层渲染直显，TECH-025）；触摸 tooltip 由 EcChart 内置，
 * 垂直滚动不拦截页面（EcChart 已做滚动甄别）。
 *
 * 降级（US-04/US-06）：option 构造或渲染异常 → 返回 null 静默隐藏本卡，文字不受影响。
 */
import { View, Text } from '@tarojs/components'
import { useMemo } from 'react'
import EcChart from '@/components/EcChart'
import { chartBlockToOption } from '@/lib/chartBlockToOption'
import type { ChartBlock } from '@/api/agent'
import './index.scss'

export default function ChatChartCard({ block }: { block: ChartBlock }) {
  const option = useMemo(() => {
    try {
      return chartBlockToOption(block)
    } catch (e) {
      console.warn('[chart] blockToOption error:', e)
      return null
    }
  }, [block])

  if (!option) return null

  return (
    <View className='chat-chart'>
      <Text className='chat-chart__title'>{block.title}</Text>
      <EcChart option={option} height='320rpx' />
      {block.caption ? <Text className='chat-chart__caption'>{block.caption}</Text> : null}
    </View>
  )
}
