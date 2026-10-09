// 测试同一 session 对象连续两次 send（验证 OAK 同对象续聊）
import { createAgent } from '@cloudbase/open-agent-kernel'
import { randomUUID } from 'node:crypto'
import { getDeepSeekKey } from '../src/config.js'
import { getCloudBaseCredentials } from '../src/lib/flexdb.js'
import { buildModelSpec } from '../src/lib/deepseek.js'

const agent = createAgent({
  envId: 'minicare-cloud-6gqledlle0132cbe',
  credentials: getCloudBaseCredentials(),
  model: buildModelSpec(getDeepSeekKey()),
  systemPrompt: '你是测试助手，简洁回答。',
  tools: [],
  cwd: process.cwd(),
})
const session = await agent.startSession({ userId: 'cont-test', conversationId: randomUUID() })

async function sendOnce(label, msg) {
  let out = ''
  let count = 0
  for await (const e of session.send(msg)) {
    const u = e.params?.update
    if (u?.sessionUpdate === 'agent_message_chunk') {
      out += u.content.text
      count++
    }
  }
  console.log(`[${label}] chunks=${count} 输出: ${out.slice(0, 60)}`)
}

await sendOnce('第1次', '我叫小明，请记住。')
await sendOnce('第2次(同session对象)', '我叫什么？')
process.exit(0)
