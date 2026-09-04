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
 * 胶囊按钮等小程序专属 API 的平台守卫。
 * H5 下 Taro.getMenuButtonBoundingClientRect() 不抛同步异常，而是返回 rejected Promise，
 * try/catch 捕获不到 → unhandledrejection（H5 兼容性问题，2026-09-03 测试发现）。
 * 因此非 weapp 平台必须在调用前短路，直接走降级值。
 */
const IS_WEAPP = process.env.TARO_ENV === 'weapp'

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
  if (!IS_WEAPP) {
    // H5 无胶囊按钮，直接降级（避免 rejected Promise 产生 unhandledrejection）
    cachedNavBarHeight = statusBarHeight + 44
    return cachedNavBarHeight
  }
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

/**
 * 右侧需避让微信胶囊按钮的 padding（px）
 * 用于 Tab 页自定义顶栏、标题行右侧操作区等
 */
export function getCapsuleRightPadding(): number {
  if (!IS_WEAPP) return 96
  try {
    const menuBtn = Taro.getMenuButtonBoundingClientRect()
    const sysInfo = Taro.getSystemInfoSync()
    return Math.max(0, sysInfo.windowWidth - menuBtn.left + 8)
  } catch {
    return 96
  }
}
