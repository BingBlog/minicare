/**
 * CloudBase SDK 按需引入（仅 auth 模块）
 *
 * 原来使用 `@cloudbase/js-sdk` 全家桶入口，会注册全部 11 个子模块
 * （database/bson/ai/mysql/realtime 等），打包体积 ~828KB。
 *
 * 优化后仅引入 @cloudbase/app + @cloudbase/auth，
 * 跳过 database(含 bson)、storage、functions、realtime、analytics、
 * model、ai、cloudrun、mysql、apis 等不使用的模块，
 * 预期减少 ~600-700KB 包体积。
 *
 * 用于 SMS 模式下的短信验证码登录流程：
 *   auth.signInWithOtp({ phone }) → data.verifyOtp({ token }) → 拿到 access_token
 *   → 调后端 /api/auth/tcb-login 换取自定义 JWT
 *
 * 环境变量（Taro 编译时替换）：
 *   TARO_APP_TCB_ENV_ID — CloudBase 环境 ID
 */
import cloudbase from '@cloudbase/app'
import { registerAuth } from '@cloudbase/auth'

// 仅注册 auth 模块
registerAuth(cloudbase)

const envId = process.env.TARO_APP_TCB_ENV_ID || ''

export const app = cloudbase.init({
  env: envId,
  region: 'ap-shanghai',
})

export const auth = app.auth()
