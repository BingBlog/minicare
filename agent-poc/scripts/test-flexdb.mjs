import cloudbase from '@cloudbase/node-sdk'
import { randomUUID } from 'node:crypto'

const app = cloudbase.init({
  env: process.env.TCB_ENV_ID,
  secretId: process.env.TCB_SECRET_ID,
  secretKey: process.env.TCB_SECRET_KEY,
})
const db = app.database()
try {
  await db.createCollection('agent_chat_history')
  console.log('createCollection OK')
} catch (e) { console.log('create err:', e.message) }
const col = db.collection('agent_chat_history')
const cid = randomUUID()

// 写入（upsert by conversationId）
const doc = { conversationId: cid, userId: 'u1', messages: [{ role: 'user', content: '你好' }], updatedAt: Date.now() }
try {
  await col.add(doc)
  console.log('add OK')
} catch (e) { console.log('add err:', e.message) }

// 读取
const { data } = await col.where({ conversationId: cid }).limit(1).get()
console.log('get:', JSON.stringify(data).slice(0, 200))

// 更新（追加）
if (data.length) {
  const m = [...data[0].messages, { role: 'assistant', content: '你好！' }]
  await col.doc(data[0]._id).update({ messages: m, updatedAt: Date.now() })
  console.log('update OK')
}

// 再读
const { data: d2 } = await col.where({ conversationId: cid }).limit(1).get()
console.log('read2:', JSON.stringify(d2[0].messages))
process.exit(0)
