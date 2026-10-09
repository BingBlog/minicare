/**
 * 清理 P0 联调测试数据（开发库）
 * 1) agent_chat_history 集合中测试用户的历史记录
 * 2) 测试家庭通过 API 软删除（需 token）
 * 用法：TCB_ENV_ID=... TCB_SECRET_ID=... TCB_SECRET_KEY=... node scripts/cleanup-test-data.mjs <token>
 */
import cloudbase from '@cloudbase/node-sdk'
import { readFileSync } from 'node:fs'

// 清理 agent_chat_history 测试数据
async function cleanHistory() {
  const app = cloudbase.init({
    env: process.env.TCB_ENV_ID,
    secretId: process.env.TCB_SECRET_ID,
    secretKey: process.env.TCB_SECRET_KEY,
  })
  const db = app.database()
  const col = db.collection('agent_chat_history')
  try {
    const { data } = await col.limit(1000).get()
    for (const d of data) {
      await col.doc(d._id).remove()
      console.log(`  - 已删历史: ${d.conversationId} (${d.messages?.length || 0} 条消息)`)
    }
    console.log(`history 清理完成: ${data.length} 条`)
  } catch (e) {
    console.log('history 清理（集合可能为空）:', e?.message || 'OK')
  }
}

async function cleanFamily(token) {
  const families = await fetch('http://127.0.0.1:3001/api/family/mine', {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json())
  for (const f of families || []) {
    if (f.name?.includes('agent联调')) {
      const resp = await fetch(`http://127.0.0.1:3001/api/family/${f.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      console.log(`  删除家庭 ${f.name} (${f.id}): HTTP ${resp.status}`)
    }
  }
}

await cleanHistory()
const token = process.argv[2]
if (token) {
  await cleanFamily(token)
} else {
  console.log('未提供 token，跳过家庭删除')
}
console.log('清理完成')
process.exit(0)
