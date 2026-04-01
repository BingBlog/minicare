/**
 * RecordActionSheet 记录操作底部弹层
 *
 * 点击记录条目后弹出，提供"编辑记录"和"删除记录"两个操作。
 * 删除时在弹层内展示二次确认视图（不使用 window.confirm），
 * 用户确认后才调用 onDelete 回调。
 *
 * 状态机：
 *   'menu'    → 默认视图：编辑 / 删除 两个选项
 *   'confirm' → 二次确认视图：确认删除 / 取消
 *
 * 被引用：RecordsPage.tsx / HomePage.tsx
 */
import { useState, useEffect } from 'react'
import BottomSheet from '@/components/ui/BottomSheet'
import { IconPencil, IconTrash } from '@/components/ui/icons'
import type { RecordItem } from '@/api'
import type { TodayRecord } from '@/api/types'

/** RecordActionSheet 接受的记录类型（两种来源均可） */
export type ActionRecord = RecordItem | TodayRecord

/** RecordActionSheet 属性 */
interface RecordActionSheetProps {
  /** 是否展开 */
  open: boolean
  /** 当前操作的记录（null 时弹层不可见） */
  record: ActionRecord | null
  /** 关闭回调 */
  onClose: () => void
  /** 编辑回调 */
  onEdit: (record: ActionRecord) => void
  /** 删除确认后回调 */
  onDelete: (record: ActionRecord) => void
}

/**
 * 记录操作选择弹层（编辑 / 删除 + 内联二次确认）
 */
export default function RecordActionSheet({
  open,
  record,
  onClose,
  onEdit,
  onDelete,
}: RecordActionSheetProps) {
  // 'menu' = 主菜单；'confirm' = 删除二次确认
  const [view, setView] = useState<'menu' | 'confirm'>('menu')

  // 每次打开时重置到主菜单视图
  useEffect(() => {
    if (open) setView('menu')
  }, [open])

  if (!record) return null

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

  // ── 主菜单视图 ────────────────────────────────────────────────
  if (view === 'menu') {
    return (
      <BottomSheet open={open} onClose={onClose} zIndex={50}>
        {/* 编辑操作 */}
        <div
          className="flex items-center gap-3 px-5 py-4 cursor-pointer active:bg-gray-50 transition-colors"
          onClick={() => { onClose(); onEdit(record) }}
        >
          <div className="w-8 flex items-center justify-center">
            <IconPencil size={20} color="#9A8090" />
          </div>
          <span className="text-[15px] font-medium text-[#4A3035]">编辑记录</span>
        </div>

        {/* 删除操作（红色警示色） */}
        <div
          className="flex items-center gap-3 px-5 py-4 cursor-pointer active:bg-gray-50 transition-colors"
          style={{ borderTop: '.5px solid #F5F0F2' }}
          onClick={handleDeleteClick}
        >
          <div className="w-8 flex items-center justify-center">
            <IconTrash size={20} color="#F05060" />
          </div>
          <span className="text-[15px] font-medium text-[#F05060]">删除记录</span>
        </div>

        <div className="h-2" />
      </BottomSheet>
    )
  }

  // ── 二次确认视图 ──────────────────────────────────────────────
  return (
    <BottomSheet open={open} onClose={onClose} zIndex={50}>
      {/* 提示文字 */}
      <div className="px-5 pt-5 pb-3 text-center">
        <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
          style={{ background: '#FFF0F0' }}>
          <IconTrash size={22} color="#F05060" />
        </div>
        <div className="text-[15px] font-semibold text-[#4A3035] mb-1">确定删除这条记录吗？</div>
        <div className="text-xs text-[#9A8090]">删除后无法恢复</div>
      </div>

      {/* 操作按钮区 */}
      <div className="px-4 pb-4 pt-1 flex gap-3">
        {/* 取消 */}
        <button
          className="flex-1 py-3 rounded-2xl text-[14px] font-medium transition-colors active:opacity-70"
          style={{ background: '#F5F0F2', color: '#9A8090' }}
          onClick={handleCancelDelete}
        >
          取消
        </button>
        {/* 确认删除 */}
        <button
          className="flex-1 py-3 rounded-2xl text-[14px] font-medium transition-colors active:opacity-70"
          style={{ background: '#F05060', color: '#fff' }}
          onClick={handleConfirmDelete}
        >
          确认删除
        </button>
      </div>

      <div className="h-2" />
    </BottomSheet>
  )
}
