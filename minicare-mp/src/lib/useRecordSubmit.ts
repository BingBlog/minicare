/**
 * useRecordSubmit — 记录表单提交/删除通用 Hook
 *
 * 封装所有记录表单页面共同的提交和删除流程：
 * - submitting 状态管理
 * - try/catch + Toast + navigateBack
 * - 删除确认状态
 */
import Taro from '@tarojs/taro'
import { useState, useCallback } from 'react'
import { showSuccessToast, showErrorToast } from './toast'

export interface SubmitOptions {
  /** 提交前校验，返回 true 通过，返回 string 表示错误信息 */
  validate?: () => true | string
  /** 执行实际 API 调用，返回成功提示文案 */
  execute: () => Promise<string>
  /** navigateBack 延迟 ms，默认 1200 */
  delay?: number
}

export interface DeleteOptions {
  /** 执行删除 API 调用 */
  execute: () => Promise<void>
  /** 成功提示文案，默认 "记录已删除" */
  successText?: string
  /** navigateBack 延迟 ms，默认 800 */
  delay?: number
}

export interface UseRecordSubmitResult {
  submitting: boolean
  deleteConfirmOpen: boolean
  setDeleteConfirmOpen: (open: boolean) => void
  handleSubmit: (options: SubmitOptions) => Promise<void>
  handleDelete: (options: DeleteOptions) => Promise<void>
}

export function useRecordSubmit(): UseRecordSubmitResult {
  const [submitting, setSubmitting] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  const handleSubmit = useCallback(async (opts: SubmitOptions) => {
    if (opts.validate) {
      const result = opts.validate()
      if (result !== true) {
        Taro.showToast({ title: result, icon: 'none' })
        return
      }
    }
    setSubmitting(true)
    try {
      const successText = await opts.execute()
      showSuccessToast(successText)
      setTimeout(() => Taro.navigateBack(), opts.delay ?? 1200)
    } catch (err) {
      showErrorToast(err, '保存失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }, [])

  const handleDelete = useCallback(async (opts: DeleteOptions) => {
    try {
      await opts.execute()
      showSuccessToast(opts.successText ?? '记录已删除')
      setTimeout(() => Taro.navigateBack(), opts.delay ?? 800)
    } catch {
      Taro.showToast({ title: '删除失败，请重试', icon: 'none' })
    }
    setDeleteConfirmOpen(false)
  }, [])

  return { submitting, deleteConfirmOpen, setDeleteConfirmOpen, handleSubmit, handleDelete }
}
