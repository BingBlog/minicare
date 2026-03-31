/**
 * RecordActionSheet 记录操作底部弹层
 *
 * 长按/点击记录条目后弹出，提供"编辑记录"和"删除记录"两个操作。
 * 删除时需二次确认（使用 window.confirm，后续可替换为自定义 Dialog）。
 *
 * 被引用：RecordsPage.tsx
 */
import BottomSheet from '@/components/ui/BottomSheet'
import { IconPencil, IconTrash } from '@/components/ui/icons'
import type { RecordItem } from '@/api'

/** RecordActionSheet 属性 */
interface RecordActionSheetProps {
  /** 是否展开 */
  open: boolean
  /** 当前操作的记录（null 时弹层不可见） */
  record: RecordItem | null
  /** 关闭回调 */
  onClose: () => void
  /** 编辑回调 */
  onEdit: (record: RecordItem) => void
  /** 删除确认后回调 */
  onDelete: (record: RecordItem) => void
}

/**
 * 记录操作选择弹层（编辑 / 删除）
 *
 * @example
 * <RecordActionSheet
 *   open={ctxOpen}
 *   record={selectedRecord}
 *   onClose={() => setCtxOpen(false)}
 *   onEdit={handleEdit}
 *   onDelete={handleDelete}
 * />
 */
export default function RecordActionSheet({
  open,
  record,
  onClose,
  onEdit,
  onDelete,
}: RecordActionSheetProps) {
  if (!record) return null

  const handleDelete = () => {
    onClose()
    // 使用原生 confirm 弹窗二次确认，MVP 阶段简洁实现
    if (window.confirm('确定删除这条记录吗？')) {
      onDelete(record)
    }
  }

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
        onClick={handleDelete}
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
