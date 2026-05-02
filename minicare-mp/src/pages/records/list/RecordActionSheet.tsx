/**
 * RecordActionSheet 记录操作底部弹层
 *
 * 与 Web RecordActionSheet 保持相同的两阶段状态机：
 *   'menu'    → 编辑 / 删除 两个选项
 *   'confirm' → 二次确认：确认删除 / 取消
 *
 * 打开时自动重置到 menu 视图。
 * 使用固定定位实现底部弹层（非 BottomSheet 组件，与 MP home 模式一致）。
 *
 * 被引用：index.tsx
 */
import { View, Text, Image } from '@tarojs/components'
import { useState, useEffect } from 'react'
import type { RecordItem } from '@/api/types'

// 铅笔图标 SVG (与 Web IconPencil 同 path)
const ICON_PENCIL = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%239A8090" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>')}`

// 垃圾桶图标 SVG (与 Web IconTrash 同 path)
const ICON_TRASH = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%23F05060" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>')}`

interface RecordActionSheetProps {
  open: boolean
  record: RecordItem | null
  onClose: () => void
  onEdit: (record: RecordItem) => void
  onDelete: (record: RecordItem) => void
}

export default function RecordActionSheet({
  open,
  record,
  onClose,
  onEdit,
  onDelete,
}: RecordActionSheetProps) {
  const [view, setView] = useState<'menu' | 'confirm'>('menu')

  // 每次打开重置到主菜单
  useEffect(() => {
    if (open) setView('menu')
  }, [open])

  if (!open || !record) return null

  const handleEditClick = () => {
    onClose()
    onEdit(record)
  }

  const handleDeleteClick = () => {
    setView('confirm')
  }

  const handleConfirmDelete = () => {
    onClose()
    onDelete(record)
  }

  const handleCancelDelete = () => {
    setView('menu')
  }

  // ── 主菜单视图 ──
  if (view === 'menu') {
    return (
      <View className='action-sheet-mask' onClick={onClose}>
        <View className='action-sheet-panel' onClick={(e) => e.stopPropagation()}>
          <View className='action-sheet-handle' />
          {/* 编辑 */}
          <View className='action-sheet-item' onClick={handleEditClick}>
            <View className='action-sheet-item__icon-box'>
              <Image src={ICON_PENCIL} style={{ width: 20, height: 20 }} mode='aspectFit' />
            </View>
            <Text className='action-sheet-item__text'>编辑记录</Text>
          </View>
          {/* 删除（红色警示色） */}
          <View className='action-sheet-item action-sheet-item--border' onClick={handleDeleteClick}>
            <View className='action-sheet-item__icon-box'>
              <Image src={ICON_TRASH} style={{ width: 20, height: 20 }} mode='aspectFit' />
            </View>
            <Text className='action-sheet-item__text action-sheet-item__text--danger'>删除记录</Text>
          </View>
          <View className='action-sheet-spacer' />
        </View>
      </View>
    )
  }

  // ── 二次确认视图 ──
  return (
    <View className='action-sheet-mask' onClick={onClose}>
      <View className='action-sheet-panel' onClick={(e) => e.stopPropagation()}>
        <View className='action-sheet-handle' />
        <View className='confirm-view'>
          <View className='confirm-view__icon'>
            <Image src={ICON_TRASH} style={{ width: 22, height: 22 }} mode='aspectFit' />
          </View>
          <Text className='confirm-view__title'>确定删除这条记录吗？</Text>
          <Text className='confirm-view__desc'>删除后无法恢复</Text>
        </View>
        <View className='confirm-view__actions'>
          <View className='confirm-view__btn confirm-view__btn--cancel' onClick={handleCancelDelete}>
            <Text>取消</Text>
          </View>
          <View className='confirm-view__btn confirm-view__btn--danger' onClick={handleConfirmDelete}>
            <Text>确认删除</Text>
          </View>
        </View>
        <View className='action-sheet-spacer' />
      </View>
    </View>
  )
}
