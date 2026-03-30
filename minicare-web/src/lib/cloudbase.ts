import cloudbase from '@cloudbase/js-sdk'

// ⚠️ 必须同步初始化，不能 async/lazy import
export const app = cloudbase.init({
  env: import.meta.env.VITE_TCB_ENV_ID as string,
  region: 'ap-shanghai',
})

// v2 SDK：auth 是属性访问（CloudBase JS SDK v2.x）
// 支持 signInWithOtp / verifyOtp 短信登录流程
export const auth = app.auth()
