/**
 * iPad 设备检测 Hook
 *
 * 微信小程序在 iPad 真机上运行时，CSS viewport 宽度可能不是实际屏幕像素宽度，
 * 导致 @media (min-width: 768px) 等媒体查询不生效。
 * 因此通过 JS 检测设备类型，给页面根元素添加 class 来实现条件样式。
 *
 * 使用新版微信 API（getDeviceInfo / getWindowInfo）替代已废弃的 getSystemInfoSync。
 */
import Taro from '@tarojs/taro'

let cachedIsIPad: boolean | null = null

function detectIPad(): boolean {
  if (cachedIsIPad !== null) return cachedIsIPad
  // H5：桌面浏览器宽度 ≥768 且 platform 可能为 mac，会误触发 iPad 大屏样式。
  // H5 端统一按手机画框呈现，仅 iPad UA 才启用大屏样式。
  if (process.env.TARO_ENV === 'h5') {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
    cachedIsIPad = /iPad/i.test(ua)
    return cachedIsIPad
  }
  try {
    // 优先使用新 API（基础库 2.20.1+）
    let model = ''
    let platform = ''
    let screenWidth = 0

    if (Taro.getDeviceInfo) {
      const deviceInfo = Taro.getDeviceInfo()
      model = (deviceInfo.model || '').toLowerCase()
      platform = (deviceInfo.platform || '').toLowerCase()
      // 获取屏幕宽度
      if (Taro.getWindowInfo) {
        const windowInfo = Taro.getWindowInfo()
        screenWidth = windowInfo.screenWidth || windowInfo.windowWidth || 0
      }
    } else {
      // 降级：旧版基础库
      const sysInfo = Taro.getSystemInfoSync()
      model = (sysInfo.model || '').toLowerCase()
      platform = ((sysInfo as any).platform || '').toLowerCase()
      screenWidth = sysInfo.screenWidth || 0
    }

    // 判断条件：
    // 1. model 包含 "ipad"
    // 2. platform 为 "mac"（iPad 上微信可能报告为 mac）
    // 3. screenWidth >= 768（真实大屏设备）
    cachedIsIPad = model.includes('ipad')
      || platform === 'mac'
      || screenWidth >= 768

    console.log('[useIsIPad]', { model, platform, screenWidth, result: cachedIsIPad })
  } catch (e) {
    console.error('[useIsIPad] detection failed:', e)
    cachedIsIPad = false
  }
  return cachedIsIPad
}

/**
 * 返回当前设备是否为 iPad（或大屏设备）
 * 结果会被缓存，多次调用无性能开销
 */
export function useIsIPad(): boolean {
  return detectIPad()
}

/**
 * 非 Hook 版本，可在任意位置调用
 */
export function isIPadDevice(): boolean {
  return detectIPad()
}
