/**
 * 401 语义回归测试（TECH-016）
 *
 * 目的：验证 `src/api/http.ts` 的 401 分支在两种语义下的真实行为。
 *   ① redirectOn401:false（登录/验证码/改密）→ 透出后端原始文案，**不**清凭证、**不** reLaunch
 *   ② redirectOn401:true （默认，token 失效）→ 清凭证 + reLaunch + 固定文案「登录已过期，请重新登录」
 *
 * 背景：`request()` 原先把**任何** 401 都当成登录态失效，导致「密码输错」这种业务错误
 *       被显示成「登录已过期，请重新登录」，同时 reLaunch 清空表单、误删 token。
 *
 * 做法：用 typescript 把真实源码 transpile 成 CJS 后加载，只 stub 掉 @tarojs/taro。
 *       因此测的是**仓库里那份真实实现**，不是重写的等价逻辑。
 *
 * 运行：node scripts/check-401-semantics.cjs      （或 npm run check:401）
 *
 * 前置条件（缺失会大面积失败，不是代码问题）：
 *   1. 本地后端已在 127.0.0.1:3001 运行，且 AUTH_TEST_MODE=true
 *   2. 后端连的是 minicare_dev，且已应用 migration 024
 *   3. 存在测试账号（脚本按固定密码校验，缺失时先跑一次下面两行重建）：
 *        POST /api/auth/verify-code  {phone:"13900000001", code:"123456"}
 *        POST /api/auth/password     {code:"123456", newPassword:"xyz98765"}
 *      `13900000002` 用于「未设置密码」场景，只需验证码登录过即可（不可设密码）。
 */
const fs = require('fs')
const path = require('path')
const Module = require('module')
const ts = require(path.join(__dirname, '../node_modules/typescript'))

const SRC = path.join(__dirname, '../src')
const API = 'http://127.0.0.1:3001'

// ── Taro stub ────────────────────────────────────────────────
const storage = new Map()
const calls = { reLaunch: [] }

const taroStub = {
  getStorageSync: (k) => (storage.has(k) ? storage.get(k) : ''),
  setStorageSync: (k, v) => storage.set(k, v),
  removeStorageSync: (k) => storage.delete(k),
  reLaunch: ({ url }) => {
    calls.reLaunch.push(url)
    return Promise.resolve()
  },
  request: async ({ url, method = 'GET', data, header }) => {
    const res = await fetch(url, {
      method,
      headers: header,
      body: data === undefined ? undefined : JSON.stringify(data),
    })
    let body
    const text = await res.text()
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
    return { statusCode: res.status, data: body }
  },
}

// ts.transpileModule 产出的 CJS 用 `taro_1.default.xxx` 访问（无 esModuleInterop），
// 故 stub 必须自带 default 自引用
taroStub.default = taroStub

// ── TS 加载钩子 ──────────────────────────────────────────────
const origRequire = Module.prototype.require
Module.prototype.require = function (id) {
  if (id === '@tarojs/taro') return taroStub
  return origRequire.apply(this, arguments)
}
Module._extensions['.ts'] = (mod, filename) => {
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  }).outputText
  mod._compile(js, filename)
}

const { authApi, loginByPasswordAndPersist } = require(path.join(SRC, 'api/auth.ts'))

// ── 断言工具 ─────────────────────────────────────────────────
let pass = 0
let fail = 0
function check(name, cond, detail = '') {
  if (cond) {
    pass++
    console.log(`  ✅ ${name}`)
  } else {
    fail++
    console.log(`  ❌ ${name}${detail ? `  → ${detail}` : ''}`)
  }
}
function reset() {
  calls.reLaunch.length = 0
}
async function grab(fn) {
  try {
    return { ok: true, value: await fn() }
  } catch (e) {
    return { ok: false, err: e }
  }
}

const PHONE_PWD = '13900000001'
const PWD = 'xyz98765'
const PHONE_NOPWD = '13900000002'

;(async () => {
  console.log('═══ 场景 1：密码错误 → 应透出后端文案，不清凭证不跳转 ═══')
  storage.set('minicare_token', 'PRESERVED_TOKEN')
  storage.set('minicare_user', { id: 'u1' })
  reset()
  let r = await grab(() => authApi.loginByPassword(PHONE_PWD, 'definitely-wrong-1'))
  check('抛错', !r.ok)
  check('文案=后端原始文案', /^手机号或密码错误（还可尝试 \d 次）$/.test(r.err?.message || ''), `实际: ${r.err?.message}`)
  check('状态码 401', r.err?.statusCode === 401, `实际: ${r.err?.statusCode}`)
  check('未 reLaunch 登录页', calls.reLaunch.length === 0, `实际: ${JSON.stringify(calls.reLaunch)}`)
  check('token 未被清除', storage.get('minicare_token') === 'PRESERVED_TOKEN', `实际: ${storage.get('minicare_token')}`)
  check('user 未被清除', !!storage.get('minicare_user'))

  console.log('\n═══ 场景 2：账号未设密码 → 400 + code=NO_PASSWORD_SET ═══')
  reset()
  r = await grab(() => authApi.loginByPassword(PHONE_NOPWD, 'abc12345'))
  check('code=NO_PASSWORD_SET', r.err?.code === 'NO_PASSWORD_SET', `实际: ${r.err?.code}`)
  check('文案正确', r.err?.message === '该账号未设置密码，请使用验证码登录', `实际: ${r.err?.message}`)
  check('未 reLaunch', calls.reLaunch.length === 0)
  check('token 未被清除', storage.get('minicare_token') === 'PRESERVED_TOKEN')

  console.log('\n═══ 场景 3：验证码错误（测试模式）→ 属业务错误，不应登出 ═══')
  reset()
  r = await grab(() => authApi.verifyCode('13900000001', '000000'))
  check('文案=验证码错误（测试模式固定为 123456）', r.err?.message === '验证码错误（测试模式固定为 123456）', `实际: ${r.err?.message}`)
  check('未 reLaunch', calls.reLaunch.length === 0)
  check('token 未被清除', storage.get('minicare_token') === 'PRESERVED_TOKEN')

  console.log('\n═══ 场景 4：已登录用户输错原密码 → 不能把用户登出 ═══')
  // 先真登录拿一个有效 token
  const login = await loginByPasswordAndPersist(PHONE_PWD, PWD)
  check('密码登录成功', !!login.token)
  const tokenAfterLogin = storage.get('minicare_token')
  reset()
  r = await grab(() =>
    authApi.setPassword({ currentPassword: 'wrongOldPwd1', newPassword: 'zzz99999' }),
  )
  check('抛错', !r.ok)
  check('文案=原密码错误…', /原密码错误/.test(r.err?.message || ''), `实际: ${r.err?.message}`)
  check('状态码 401', r.err?.statusCode === 401)
  check('未 reLaunch（关键：不能把已登录用户踢出）', calls.reLaunch.length === 0, `实际: ${JSON.stringify(calls.reLaunch)}`)
  check('token 仍是登录后的那个（未被清除）', storage.get('minicare_token') === tokenAfterLogin)

  console.log('\n═══ 场景 5：真实 token 失效 → 必须保留原有登出跳转行为 ═══')
  storage.set('minicare_token', 'garbage.invalid.token')
  reset()
  r = await grab(() => authApi.checkToken())
  check('抛错', !r.ok)
  check('文案=登录已过期，请重新登录（home 页依赖此串）', r.err?.message === '登录已过期，请重新登录', `实际: ${r.err?.message}`)
  check('已 reLaunch 登录页', calls.reLaunch.includes('/pages/login/index'), `实际: ${JSON.stringify(calls.reLaunch)}`)
  check('token 已清除', !storage.get('minicare_token'))
  check('user 已清除', !storage.get('minicare_user'))

  console.log('\n═══ 场景 6：重置密码时验证码错误 → 业务错误 ═══')
  reset()
  r = await grab(() =>
    authApi.resetPassword({ phone: PHONE_PWD, code: '000000', newPassword: 'zzz99999' }),
  )
  check('文案=验证码错误或已过期', r.err?.message === '验证码错误或已过期', `实际: ${r.err?.message}`)
  check('未 reLaunch', calls.reLaunch.length === 0)

  console.log(`\n──────── 结果：${pass} 通过 / ${fail} 失败 ────────`)
  process.exit(fail === 0 ? 0 : 1)
})().catch((e) => {
  console.error('harness 崩溃:', e)
  process.exit(2)
})
