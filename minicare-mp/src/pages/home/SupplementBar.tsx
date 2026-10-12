import { View, Text } from '@tarojs/components'
import { useMemo } from 'react'
import { navigateToRecord } from '@/lib/navigation'
import { HOME_RECORD_ROUTES } from '@/lib/constants'
import { normalizeSupplementKey, normalizeSupplementKeys, supplementLabel } from '@/lib/supplements'
import type { HomeRecord } from './types'

/** 补剂项（从 supplement 记录的 detail.supplement_items 中提取） */
interface SupplementItem {
  key: string
  label?: string
}

interface SupplementBarProps {
  /** 宝宝「每日补充计划」（营养素 key 数组；[] = 未配置，PRD-018） */
  planKeys: string[]
  /** 今日记录（用于计算已吃集合） */
  todayRecords: HomeRecord[]
}

/** 从记录列表中提取补剂项（去重） */
function extractSupplements(records: HomeRecord[]): SupplementItem[] {
  const items: SupplementItem[] = []
  const seen = new Set<string>()
  for (const r of records) {
    if (r.type !== 'feeding' && r.type !== 'supplement') continue
    const d = r.detail ?? {}
    const feedType = d.feed_type as string | undefined
    if (feedType !== 'supplement' && feedType !== 'complementary') continue
    if (feedType === 'complementary' && d.complementary_food !== '营养素') continue
    const suppItems = (d.supplement_items as SupplementItem[] | undefined) ?? []
    for (const item of suppItems) {
      // key 缺失的脏数据用 label 兜底参与去重（对账仍只认 key）
      const dedupKey = item.key || `label:${item.label ?? ''}`
      if (!dedupKey || seen.has(dedupKey)) continue
      seen.add(dedupKey)
      items.push(item)
    }
  }
  return items
}

const SUPPLEMENT_RECORD_ROUTE =
  HOME_RECORD_ROUTES.supplement ?? '/records/form/feeding?tab=supplement'

/**
 * 补剂&营养素提醒 Bar（首页 banners 区，排敏进度 Bar 上方）
 *
 * 口径（PRD-018，2026-10-12 升级：昨日反推 → 计划对账）：
 * - 未配置计划（[] / NULL）：渲染轻引导条「还没有每日补充计划」（与日程「还没有作息计划」同构）
 * - 已配置：对账 = 计划 − 今日已吃（key 经 `normalizeSupplementKey` 归一化后比较）
 *   · 计划内全部已吃 → 不渲染
 *   · 有未吃 → 「今天还没吃：x、y、z」（最多 3 项，超出追加「，另有 N 项」）
 *
 * 点击整条 → 补剂记录页（配置区与记录表单同页）。
 * 显隐总开关：提醒设置（reminderSettings.supplement），由首页渲染条件控制。
 */
export default function SupplementBar({ planKeys, todayRecords }: SupplementBarProps) {
  const takenKeys = useMemo(
    () => normalizeSupplementKeys(extractSupplements(todayRecords).map((i) => i.key ?? '')),
    [todayRecords],
  )

  const plan = (planKeys ?? []).filter((k) => typeof k === 'string' && k)

  // 未配置 → 轻引导条
  if (plan.length === 0) {
    return (
      <View
        className='home-inline-banner home-inline-banner--plan-setup'
        onClick={() => navigateToRecord(SUPPLEMENT_RECORD_ROUTE)}
      >
        <View className='home-inline-banner__dot home-inline-banner__dot--plan-setup' />
        <View className='home-inline-banner__content'>
          <Text className='home-inline-banner__title'>还没有每日补充计划</Text>
          <Text className='home-inline-banner__desc'>设置每天要补的营养素，首页会提醒还没吃的</Text>
        </View>
        <Text className='home-inline-banner__action-text--plan-setup'>去设置</Text>
      </View>
    )
  }

  // 对账：计划 − 今日已吃
  const missing = plan.filter((k) => !takenKeys.has(normalizeSupplementKey(k)))

  // 计划内全部吃完 → 不渲染
  if (missing.length === 0) return null

  const labels = missing.map(supplementLabel)
  const shown = labels.slice(0, 3)
  const extra = labels.length - 3

  return (
    <View
      className='home-inline-banner home-inline-banner--supplement'
      onClick={() => navigateToRecord(SUPPLEMENT_RECORD_ROUTE)}
    >
      <View className='home-inline-banner__dot home-inline-banner__dot--supplement' />
      <View className='home-inline-banner__content'>
        <Text className='home-inline-banner__title'>补剂&营养素</Text>
        <Text className='home-inline-banner__desc'>
          <Text className='home-inline-banner__desc-em'>今天还没吃</Text>
          {`：${shown.join('、')}${extra > 0 ? `，另有 ${extra} 项` : ''}`}
        </Text>
      </View>
      <Text className='home-inline-banner__action--supplement'>记补剂</Text>
    </View>
  )
}
