/**
 * 密码策略 —— 前端镜像
 *
 * 🚨 真相源：`minicare-server/src/auth/password-policy.ts`
 *    Taro 编译期无法共享后端 TS 文件，因此规则与文案在此各存一份。
 *    **修改任一处必须同步另一处**，否则会出现「前端放行、后端 400」的口径不一致。
 *
 * 规则：8–20 位；必须同时包含字母与数字；允许 !@#$%^&*._- 等常用符号；禁止空格与中文。
 */

export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 20

/** 与后端 `PASSWORD_REGEX` 逐字一致 */
export const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d!@#$%^&*._-]{8,20}$/

export const PASSWORD_HINT = `密码需为 ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} 位，且同时包含字母和数字`

/** 校验密码；通过返回 null，不通过返回可直接 toast 的提示文案 */
export function validatePassword(password: string): string | null {
  if (!password) return '请输入密码'
  if (!PASSWORD_REGEX.test(password)) return PASSWORD_HINT
  return null
}

/** 校验「确认密码」 */
export function validatePasswordConfirm(password: string, confirm: string): string | null {
  const basic = validatePassword(password)
  if (basic) return basic
  if (!confirm) return '请再次输入密码'
  if (password !== confirm) return '两次输入的密码不一致'
  return null
}
