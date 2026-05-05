/**
 * Toast 工具函数 — 统一封装 Taro.showToast 调用
 *
 * 消除各页面中重复的 Toast 调用模式。
 */
import Taro from '@tarojs/taro'

/** 显示成功 Toast */
export function showSuccessToast(title: string, duration = 1500): void {
  Taro.showToast({ title, icon: 'success', duration })
}

/** 显示普通提示 Toast（无图标） */
export function showInfoToast(title: string, duration = 1500): void {
  Taro.showToast({ title, icon: 'none', duration })
}

/** 显示错误 Toast，自动从 Error 对象提取 message */
export function showErrorToast(err: unknown, fallback = '操作失败，请重试'): void {
  const msg = err instanceof Error ? err.message : fallback
  Taro.showToast({ title: msg, icon: 'none', duration: 2000 })
}
