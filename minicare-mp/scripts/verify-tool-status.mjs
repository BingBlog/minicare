// 验证修复：回复结束后工具状态（chat-msg__tool）和光标（cursor）必须消失
import automator from 'miniprogram-automator'

const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
const errors = []
mp.on('console', msg => {
  const s = JSON.stringify(msg.args || msg)
  if (s.includes('UnhandledRejection') || s.includes('error')) errors.push(s.slice(0, 150))
})

let page = await mp.currentPage()
console.log('page:', page.path)
if (page.path !== 'pages/chat/index') {
  await mp.evaluate(() => wx.navigateTo({ url: '/pages/chat/index' }))
  await new Promise(r => setTimeout(r, 3500))
  page = await mp.currentPage()
}

// 清空输入框（如有旧文本）并发送问题
const input = await page.$('.chat-input__field')
if (!input) { console.log('INPUT NOT FOUND'); process.exit(1) }
await input.input('旺仔昨天睡得好吗？')
await new Promise(r => setTimeout(r, 500))
const sendBtn = await page.$('.chat-input__send')
if (!sendBtn) { console.log('SEND NOT FOUND'); process.exit(1) }
await sendBtn.tap()
console.log('sent, waiting for reply...')

// 轮询：等待出现 cursor（流式中）→ 再等它消失（流结束）
let sawStreaming = false
let sawTool = false
let done = false
for (let i = 0; i < 60; i++) {
  await new Promise(r => setTimeout(r, 2000))
  const cursor = await page.$$('.chat-msg__cursor').catch(() => [])
  const tools = await page.$$('.chat-msg__tool').catch(() => [])
  if (cursor.length > 0) sawStreaming = true
  if (tools.length > 0) sawTool = true
  if (sawStreaming && cursor.length === 0 && tools.length === 0) { done = true; break }
  if (i % 5 === 4) console.log(`[${(i + 1) * 2}s] cursor=${cursor.length} tool=${tools.length}`)
}
console.log('sawStreaming:', sawStreaming, '| sawTool:', sawTool, '| finished(no cursor & no tool):', done)
console.log('errors:', errors.length)
process.exit(0)
