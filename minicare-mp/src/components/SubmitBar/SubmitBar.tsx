/**
 * SubmitBar — 记录表单页面底部提交栏
 *
 * 统一所有记录表单页面的底部操作栏：
 * - 编辑模式：左侧删除按钮 + 右侧提交按钮
 * - 新建模式：全宽提交按钮
 * - submitting 状态自动禁用 + 文案切换
 */
import { View, Text } from '@tarojs/components'
import './SubmitBar.scss'

export interface SubmitBarProps {
  /** 是否提交中 */
  submitting: boolean
  /** 是否编辑模式 */
  isEditMode: boolean
  /** 提交按钮点击 */
  onSubmit: () => void
  /** 删除按钮点击（编辑模式） */
  onDelete?: () => void
  /** 新建模式提交文案，默认 "保存记录" */
  submitText?: string
  /** 编辑模式提交文案，默认 "更新记录" */
  updateText?: string
  /** 提交中文案，默认 "保存中..." */
  loadingText?: string
  /** 删除按钮文案，默认 "删除" */
  deleteText?: string
}

export default function SubmitBar({
  submitting,
  isEditMode,
  onSubmit,
  onDelete,
  submitText = '保存记录',
  updateText = '更新记录',
  loadingText = '保存中...',
  deleteText = '删除',
}: SubmitBarProps) {
  const btnText = submitting ? loadingText : isEditMode ? updateText : submitText

  return (
    <View className='submit-bar'>
      <View className='submit-bar__inner'>
        {isEditMode && onDelete ? (
          <View className='submit-bar__btn submit-bar__btn--delete' onClick={onDelete}>
            <Text className='submit-bar__btn-text submit-bar__btn-text--delete'>{deleteText}</Text>
          </View>
        ) : null}
        <View
          className={`submit-bar__btn submit-bar__btn--primary ${submitting ? 'submit-bar__btn--disabled' : ''}`}
          onClick={submitting ? undefined : onSubmit}
        >
          <Text className='submit-bar__btn-text'>{btnText}</Text>
        </View>
      </View>
    </View>
  )
}
