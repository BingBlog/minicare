/**
 * ConfirmSheet — 底部确认弹窗组件
 *
 * 统一所有记录表单页面的删除确认弹窗 UI：
 * - 半透明遮罩
 * - 底部弹出面板
 * - 标题 + 描述 + 确认/取消按钮
 */
import { View, Text } from '@tarojs/components'
import './ConfirmSheet.scss'

export interface ConfirmSheetProps {
  /** 是否显示 */
  open: boolean
  /** 标题，默认 "确定删除这条记录吗？" */
  title?: string
  /** 描述，默认 "删除后无法恢复" */
  desc?: string
  /** 确认按钮文案，默认 "确认删除" */
  confirmText?: string
  /** 取消按钮文案，默认 "取消" */
  cancelText?: string
  /** 确认按钮是否为危险样式，默认 true */
  danger?: boolean
  /** 确认回调 */
  onConfirm: () => void
  /** 取消回调 */
  onCancel: () => void
}

export default function ConfirmSheet({
  open,
  title = '确定删除这条记录吗？',
  desc = '删除后无法恢复',
  confirmText = '确认删除',
  cancelText = '取消',
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  if (!open) return null

  return (
    <View className='confirm-sheet-mask' onClick={onCancel}>
      <View className='confirm-sheet' onClick={(e) => e.stopPropagation()}>
        <View className='confirm-sheet__handle' />
        <Text className='confirm-sheet__title'>{title}</Text>
        <Text className='confirm-sheet__desc'>{desc}</Text>
        <View className='confirm-sheet__actions'>
          <View
            className={`confirm-sheet__btn ${danger ? 'confirm-sheet__btn--danger' : 'confirm-sheet__btn--primary'}`}
            onClick={onConfirm}
          >
            <Text>{confirmText}</Text>
          </View>
          <View className='confirm-sheet__btn confirm-sheet__btn--cancel' onClick={onCancel}>
            <Text>{cancelText}</Text>
          </View>
        </View>
      </View>
    </View>
  )
}
