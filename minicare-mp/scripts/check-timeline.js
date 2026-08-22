/**
 * 检查模拟器首页时间线 + 记录列表页的实际渲染（medication 是否展示）
 */
const automator = require('/Users/bing/Documents/minicare-v1/minicare-mp/node_modules/miniprogram-automator')
const MiniProgram = require('/Users/bing/Documents/minicare-v1/minicare-mp/node_modules/miniprogram-automator/out/MiniProgram').default
MiniProgram.prototype.checkVersion = async function () {}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function pageText(page) {
  const views = await page.$$('view')
  let t = ''
  for (const v of views) { try { t += (await v.text() ?? '') + ' ' } catch {} }
  return t
}
;(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
  const jsErrors = []
  mp.on('console', (msg) => { if (msg.type === 'error') jsErrors.push(String(msg.args?.[0] ?? '').slice(0, 120)) })

  // 首页
  await mp.reLaunch('/pages/home/index')
  await sleep(3500)
  const home = await mp.currentPage()
  console.log('当前页:', home.path)
  const t1 = await pageText(home)
  console.log('首页含「今日时间线」:', t1.includes('今日时间线'))
  console.log('首页含「用药」文字:', t1.includes('用药'))
  console.log('首页含药名(西替利嗪/布洛芬):', t1.includes('西替利嗪') || t1.includes('布洛芬'))
  console.log('首页时间线片段:', (t1.match(/今日时间线[\s\S]{0,200}/) || ['未找到'])[0].slice(0, 200))
  console.log('---')

  // 记录列表页
  await mp.switchTab('/pages/records/list/index').catch(async () => { await mp.reLaunch('/pages/records/list/index'); await sleep(2000) })
  await sleep(3000)
  const list = await mp.currentPage()
  console.log('列表页:', list.path)
  const t2 = await pageText(list)
  console.log('列表页含「用药」筛选:', t2.includes('用药'))
  console.log('列表页含药名:', t2.includes('西替利嗪') || t2.includes('布洛芬'))
  console.log('列表页片段:', t2.replace(/\s+/g, ' ').slice(0, 300))

  console.log('JS 错误:', jsErrors.length ? jsErrors.slice(0, 3).join(' | ') : '无')
  await mp.disconnect()
  process.exit(0)
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
