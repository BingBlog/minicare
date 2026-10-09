/**
 * 清理云端端到端验证测试数据（staging API + FlexDB）
 * 1) 删除「agent云端验证」测试家庭（软删除）
 * 2) 清理 agent_chat_history 中测试 userId 的历史
 * 用法：node scripts/cleanup-cloud-test.mjs <stagingBaseUrl> <token>
 */
import cloudbase from '@cloudbase/node-sdk'

const base = process.argv[2]
const token = process.argv[3]

// 1) 删除测试家庭
async function cleanFamily() {
  const families = await fetch(`${base}/api/family/mine`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json())
  for (const f of families || []) {
    if (f.name?.includes('agent云端验证')) {
      const resp = await fetch(`${base}/api/family/${f.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      console.log(`删除家庭 ${f.name} (${f.id}): HTTP ${resp.status}`)
    }
  }
}

// 2) 清理测试历史（userId=1111... 直连测试 / 40ade8d5 联调账号）
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
    let removed = 0
    for (const d of data) {
      const uid = d.userId || ''
      if (uid.startsWith('11111111-') || uid === '40ade8d5-a98b-419b-b934-2788be93684c' || uid === 'vision-test') {
        await col.doc(d._id).remove()
        removed++
        console.log(`  已删历史: ${d.conversationId} (userId=${uid})`)
      }
    }
    console.log(`history 清理: ${removed} 条`)
  } catch (e) {
    console.log('history 清理: 集合为空或不存在:', e?.message || 'OK')
  }
}

await cleanFamily()
await cleanHistory()
console.log('云端测试数据清理完成')
process.exit(0)
