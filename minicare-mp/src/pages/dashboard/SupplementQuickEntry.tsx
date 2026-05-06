/**
 * SupplementQuickEntry — 补剂快捷录入组件
 *
 * 替代原有 SupplementColumn，在 Dashboard 补剂列中同时展示：
 * 1. 已录入记录（今日，含时间标签）
 * 2. 待勾选快捷选项（近 7 天使用过的补剂，一键录入）
 *
 * 交互流程：
 * - 用户点击待选项 → 弹出确认弹层 → 确认后直接调 API → 刷新列表
 * - 已录入项展示打卡时间
 * - 保留"+记录"入口跳转完整表单
 */
import { useState, useCallback, useMemo } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { feedingApi } from '@/api/feeding'
import type { DashboardData } from './types'
import type { RecentSupplement } from './useRecentSupplements'
import SupplementConfirmSheet from './SupplementConfirmSheet'
import './SupplementQuickEntry.scss'

interface SuppItemDetail {
  key?: string
  label?: string
  dose?: string
  unit?: string
}

interface Props {
  data: DashboardData
  familyId: string | null
  babyId: string | null
  recentList: RecentSupplement[]
  recentLoading: boolean
  onAdd?: () => void
  onRecorded?: () => void
}

function formatHM(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function SupplementQuickEntry({
  data, familyId, babyId, recentList, recentLoading, onAdd, onRecorded
}: Props) {
  const [sheetVisible, setSheetVisible] = useState(false)
  const [selectedItem, setSelectedItem] = useState<RecentSupplement | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const records = data.supplement

  // 今日已录入的补剂 key 集合（用于标记已完成状态）
  const todayRecordedMap = useMemo(() => {
    const map = new Map<string, string>() // key → time
    for (const r of records) {
      const items = (r.detail?.supplement_items as SuppItemDetail[] | undefined) ?? []
      for (const it of items) {
        const key = it.key || `custom_${it.label}`
        if (key && !map.has(key)) {
          map.set(key, r.time)
        }
      }
    }
    return map
  }, [records])

  // 点击待选项
  const handleItemClick = useCallback((item: RecentSupplement) => {
    setSelectedItem(item)
    setSheetVisible(true)
  }, [])

  // 确认录入
  const handleConfirm = useCallback(async (item: RecentSupplement, dose: string, recordTime: string) => {
    if (!familyId || !babyId) return
    setSubmitting(true)
    try {
      await feedingApi.create(familyId, {
        baby_id: babyId,
        feed_type: 'complementary',
        record_time: recordTime,
        complementary_food: '营养素',
        supplement_items: [{
          key: item.key,
          label: item.label,
          dose: dose || '',
          unit: item.unit || '',
        }],
      })
      Taro.showToast({ title: `${item.label} 已录入`, icon: 'success', duration: 1500 })
      setSheetVisible(false)
      setSelectedItem(null)
      // 通知父组件刷新数据
      onRecorded?.()
    } catch (err) {
      console.error('[SupplementQuickEntry] create error:', err)
      Taro.showToast({ title: '录入失败，请重试', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }, [familyId, babyId, onRecorded])

  // 取消弹层
  const handleCancel = useCallback(() => {
    if (!submitting) {
      setSheetVisible(false)
      setSelectedItem(null)
    }
  }, [submitting])

  return (
    <View className='db-col'>
      <View className='db-col-header'>
        <View className='db-col-title'>
          <Text className='db-col-title-text'>补剂</Text>
          {onAdd && <Text className='db-col-add-btn' onClick={onAdd}>+记录</Text>}
        </View>
      </View>

      <View className='db-col-records supp-quick-body'>
        {/* 快捷选项区域 */}
        {recentList.length > 0 && (
          <View className='supp-quick-chips'>
            {recentList.map((item) => {
              const recordedTime = todayRecordedMap.get(item.key)
              const isDone = !!recordedTime
              return (
                <View
                  key={item.key}
                  className={`supp-quick-chip ${isDone ? 'supp-quick-chip--done' : ''}`}
                  onClick={() => handleItemClick(item)}
                >
                  <Text className={`supp-quick-chip-icon ${isDone ? 'supp-quick-chip-icon--done' : ''}`}>
                    {isDone ? '\u2713' : ''}
                  </Text>
                  <Text className='supp-quick-chip-label'>{item.label}</Text>
                </View>
              )
            })}
          </View>
        )}

        {/* 加载态 */}
        {recentLoading && recentList.length === 0 && (
          <Text className='db-empty'>加载中...</Text>
        )}

        {/* 无数据时的引导 */}
        {!recentLoading && recentList.length === 0 && records.length === 0 && (
          <View className='supp-quick-empty'>
            <Text className='supp-quick-empty-text'>暂无常用补剂</Text>
            <Text className='supp-quick-empty-hint'>点击"+记录"添加第一条补剂记录后，这里将展示快捷选项</Text>
          </View>
        )}

        {/* 今日录入记录时间线（简洁模式） */}
        {records.length > 0 && (
          <View className='supp-quick-records'>
            <Text className='supp-quick-records-title'>今日记录</Text>
            {records.map((r) => {
              const items = (r.detail?.supplement_items as SuppItemDetail[] | undefined) ?? []
              const names = items.map(it => it.label ?? it.key ?? '').filter(Boolean).join('、')
              return (
                <View key={r.id} className='supp-quick-record-row'>
                  <Text className='supp-quick-record-time'>{formatHM(r.time)}</Text>
                  <Text className='supp-quick-record-names'>{names}</Text>
                </View>
              )
            })}
          </View>
        )}
      </View>

      {/* 确认弹层 */}
      <SupplementConfirmSheet
        visible={sheetVisible}
        item={selectedItem}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        submitting={submitting}
      />
    </View>
  )
}
