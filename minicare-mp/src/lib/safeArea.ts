/**
 * 安全区域工具
 *
 * 在 navigationStyle: 'custom' 模式下，需要手动处理状态栏和导航栏区域。
 * 微信小程序中 CSS env(safe-area-inset-top) 不一定可靠，
 * 使用 Taro.getSystemInfoSync() + Taro.getMenuButtonBoundingClientRect()
 * 获取精确的状态栏高度和胶囊按钮位置来计算导航栏总高度。
 */
import Taro from '@tarojs/taro'

let cachedNavBarHeight: number | null = null
let cachedStatusBarHeight: number | null = null

/**
 * 获取状态栏高度（px）
 * iOS 刘海屏约 47px，非刘海约 20px，Android 各异
 */
export function getStatusBarHeight(): number {
  if (cachedStatusBarHeight !== null) return cachedStatusBarHeight
  try {
    const sysInfo = Taro.getSystemInfoSync()
    cachedStatusBarHeight = sysInfo.statusBarHeight ?? 44
  } catch {
    cachedStatusBarHeight = 44
  }
  return cachedStatusBarHeight
}

/**
 * 获取自定义导航栏总高度 = 状态栏高度 + 导航内容区高度
 *
 * 导航内容区高度根据胶囊按钮位置计算：
 *   contentHeight = (menuButton.top - statusBarHeight) * 2 + menuButton.height
 * 确保导航栏内容与胶囊按钮垂直居中对齐。
 */
export function getNavBarHeight(): number {
  if (cachedNavBarHeight !== null) return cachedNavBarHeight
  const statusBarHeight = getStatusBarHeight()
  try {
    const menuButton = Taro.getMenuButtonBoundingClientRect()
    const gap = menuButton.top - statusBarHeight
    const contentHeight = gap * 2 + menuButton.height
    cachedNavBarHeight = statusBarHeight + contentHeight
  } catch {
    // 降级：状态栏 + 44px 标准导航内容高度
    cachedNavBarHeight = statusBarHeight + 44
  }
  return cachedNavBarHeight
}

/**
 * React Hook: 返回导航栏占位所需的 paddingTop 值（字符串，带 px 单位）
 * 用于页面顶层容器或自定义导航栏的 paddingTop
 */
export function useNavBarPaddingTop(): string {
  return `${getStatusBarHeight()}px`
}
