/**
 * AskAssistantBar — 分析页「问助手」入口（PRD-013 US-01 / TECH-028 §3.1）
 *
 * 洞察卡底部的一行入口：点击跳转对话页并携带分析上下文（intent/anchor/range），
 * 进入后由 chat 页组装起手消息并向助手发起深度分析（TECH-028 D1：前端组装、agent 无感知）。
 *
 * 显示条件由父级天然决定：洞察卡只在有数据时渲染，空态 / 游客态不出现。
 */
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { getToken } from '@/api/http'
import type { TabKey } from '../types'

interface AskAssistantBarProps {
  tab: TabKey
  /** 当前 Tab 的时间窗（分析页 rangeMap 值）；allergy 场景由 chat 页忽略 */
  range: string
}

export function AskAssistantBar({ tab, range }: AskAssistantBarProps) {
  // 游客态不显示入口（PRD-013 US-01 场景4）：无登录态时分析页走 GuestReport 示例数据，
  // 与真实数据无关，问助手也无从分析
  if (!getToken()) return null

  const onTap = () => {
    Taro.navigateTo({
      url: `/pages/chat/index?intent=analysis&anchor=report:${tab}&range=${encodeURIComponent(range)}`,
    })
  }

  return (
    <View
      hoverClass='ask-assistant--pressed'
      onClick={onTap}
      style={{
        marginTop: 10,
        paddingTop: 10,
        borderTop: '0.5px solid rgba(248,112,152,0.18)',
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <Text style={{ fontSize: 12, color: '#F87098', fontWeight: 500 }}>
        {tab === 'allergy' ? '让助手评估排敏风险 →' : '让助手深入分析 →'}
      </Text>
    </View>
  )
}
