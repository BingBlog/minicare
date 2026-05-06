/**
 * SupplementConfirmSheet — 补剂快捷录入确认弹层
 *
 * 底部半屏弹出，展示：
 * - 补剂名称
 * - 剂量输入（预填上次值，非必填）
 * - 录入时间（默认"现在"）
 * - 确认/取消按钮
 *
 * 确认后直接调用 feedingApi.create 完成录入，无需跳转表单页。
 */
import { useState, useEffect, useCallback } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { RecentSupplement } from './useRecentSupplements'
import './SupplementConfirmSheet.scss'

interface Props {
  visible: boolean
  item: RecentSupplement | null
  onConfirm: (item: RecentSupplement, dose: string, recordTime: string) => void
  onCancel: () => void
  submitting?: boolean
}

function getNowISOStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function formatTimeDisplay(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function SupplementConfirmSheet({ visible, item, onConfirm, onCancel, submitting }: Props) {
  const [dose, setDose] = useState('')
  const [recordTime, setRecordTime] = useState(getNowISOStr())

  // 每次弹出时重置
  useEffect(() => {
    if (visible && item) {
      setDose(item.dose || '')
      setRecordTime(getNowISOStr())
    }
  }, [visible, item])

  const handleConfirm = useCallback(() => {
    if (!item || submitting) return
    onConfirm(item, dose, recordTime)
  }, [item, dose, recordTime, submitting, onConfirm])

  const handleTimeClick = useCallback(() => {
    // 使用 Taro 时间选择器
    Taro.showModal({
      title: '修改时间',
      content: '使用当前时间录入即可，如需修改请前往完整表单',
      showCancel: true,
      cancelText: '取消',
      confirmText: '确定',
    })
  }, [])

  if (!visible || !item) return null

  return (
    <View className='supp-sheet-mask' onClick={onCancel}>
      <View className='supp-sheet' onClick={(e) => e.stopPropagation()}>
        <View className='supp-sheet-header'>
          <Text className='supp-sheet-title'>确认录入</Text>
          <Text className='supp-sheet-close' onClick={onCancel}>取消</Text>
        </View>

        <View className='supp-sheet-body'>
          {/* 补剂名称 */}
          <View className='supp-sheet-field'>
            <Text className='supp-sheet-label'>补剂</Text>
            <Text className='supp-sheet-value'>{item.label}</Text>
          </View>

          {/* 剂量输入 */}
          <View className='supp-sheet-field'>
            <Text className='supp-sheet-label'>剂量（选填）</Text>
            <View className='supp-sheet-dose-row'>
              <Input
                className='supp-sheet-input'
                type='digit'
                placeholder='不填则不记录剂量'
                value={dose}
                onInput={(e) => setDose(e.detail.value)}
              />
              {item.unit && <Text className='supp-sheet-unit'>{item.unit}</Text>}
            </View>
          </View>

          {/* 录入时间 */}
          <View className='supp-sheet-field' onClick={handleTimeClick}>
            <Text className='supp-sheet-label'>时间</Text>
            <Text className='supp-sheet-value supp-sheet-time'>{formatTimeDisplay(recordTime)}（现在）</Text>
          </View>
        </View>

        <View className='supp-sheet-footer'>
          <View
            className={`supp-sheet-btn supp-sheet-btn--confirm ${submitting ? 'supp-sheet-btn--disabled' : ''}`}
            onClick={handleConfirm}
          >
            <Text className='supp-sheet-btn-text'>
              {submitting ? '录入中...' : '确认录入'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  )
}
