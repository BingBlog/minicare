/**
 * P0 视觉链路实测（M6 tech §5）
 *
 * 验证目标：
 *  1. OAK session.send attachments（file 类型）→ DeepSeek Anthropic 端点是否被接受（image block 支持）
 *  2. vision-exp 经不同白名单 model.id 能否正确路由并解读图片
 *  3. 解读质量（能否准确描述图片内容）
 *  4. 延迟（首字/总耗时）
 *
 * 用法：node scripts/test-vision.mjs [imagePath] [modelId]
 *  - imagePath 默认 Design-Reference/妈妈和宝宝变化.png
 *  - modelId 依次尝试，默认依次测多个
 */
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { createAgent } from '@cloudbase/open-agent-kernel'
import { getDeepSeekKey } from '../src/config.js'
import { getCloudBaseCredentials } from '../src/lib/flexdb.js'
import { buildModelSpec } from '../src/lib/deepseek.js'

const DEFAULT_IMG = path.resolve(process.cwd(), '../Design-Reference/妈妈和宝宝变化.png')

async function runTest(imgPath, modelId) {
  const apiKey = getDeepSeekKey()
  let credentials
  try { credentials = getCloudBaseCredentials() } catch { /* FlexDB 非必需 */ }
  const agent = createAgent({
    envId: 'minicare-cloud-6gqledlle0132cbe',
    ...(credentials ? { credentials } : {}),
    model: { ...buildModelSpec(apiKey), id: modelId },
    systemPrompt: '你是图片理解测试助手。请用简体中文准确描述图片内容。',
    tools: [],
    cwd: process.cwd(),
  })
  const session = await agent.startSession({ userId: 'vision-test' })
  const t0 = Date.now()
  let firstTokenAt = null
  let answer = ''

  for await (const event of session.send({
    type: 'message',
    content: '请描述这张图片里有什么？',
    attachments: [{ type: 'file', source: imgPath, mimeType: 'image/png' }],
  })) {
    const u = event.params?.update
    if (!u) {
      // 非 update 事件（jsonrpc / client 请求等）打印类型便于诊断
      if (event.jsonrpc || event.type === 'jsonrpc') {
        console.log(`[${modelId}] jsonrpc event:`, JSON.stringify(event).slice(0, 300))
      }
      continue
    }
    if (u.sessionUpdate === 'agent_message_chunk') {
      if (!firstTokenAt) firstTokenAt = Date.now()
      answer += u.content.text
    } else {
      console.log(`[${modelId}] update:`, u.sessionUpdate)
    }
  }
  const ms = Date.now() - t0
  console.log(`[${modelId}] 首字 ${firstTokenAt ? firstTokenAt - t0 + 'ms' : 'N/A'} 总耗时 ${ms}ms`)
  console.log(`[${modelId}] 回答(${answer.length}字): ${answer.slice(0, 300)}`)
  console.log('---')
}

const imgPath = process.argv[2] || DEFAULT_IMG
if (!existsSync(imgPath)) {
  console.error(`图片不存在: ${imgPath}`)
  process.exit(1)
}
console.log(`测试图片: ${imgPath} (${(readFileSync(imgPath).length / 1024).toFixed(0)}KB)`)

// 候选模型依次实测（2026-08-23 结论：直接传真实模型名，无需白名单映射）
const candidates = process.argv[3] ? [process.argv[3]] : [
  'deepseek-v4-flash-vision-exp', // ✅ 已验证：可直接解读图片
  'deepseek-v4-flash',            // ✅ 已验证：文本
  'deepseek-v4-pro',              // 文本（复杂任务）
]
for (const m of candidates) {
  try {
    await runTest(imgPath, m)
  } catch (e) {
    console.error(`[${m}] FAILED:`, (e?.message || String(e)).slice(0, 500))
    console.log('---')
  }
}
console.log('视觉实测完成')
process.exit(0)
