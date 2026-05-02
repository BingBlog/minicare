/**
 * CloudBase JS SDK 初始化（小程序端）
 *
 * 用于 SMS 模式下的短信验证码登录流程：
 *   auth.signInWithOtp({ phone }) → data.verifyOtp({ token }) → 拿到 access_token
 *   → 调后端 /api/auth/tcb-login 换取自定义 JWT
 *
 * 环境变量（Taro 编译时替换）：
 *   TARO_APP_TCB_ENV_ID — CloudBase 环境 ID
 */
import cloudbase from '@cloudbase/js-sdk'

const envId = process.env.TARO_APP_TCB_ENV_ID || ''

export const app = cloudbase.init({
  env: envId,
  region: 'ap-shanghai',
})

export const auth = app.auth()
