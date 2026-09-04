/** 检查 agent_traces 数据分布（判断线上是否已在埋点） */
import { loadLocalEnv } from '../src/lib/env.js'

loadLocalEnv()
import cloudbase from '@cloudbase/node-sdk'
import { getTcbCredentials } from '../src/config.js'

const credentials = getTcbCredentials()
const app = cloudbase.init({
  env: process.env.TCB_ENV_ID || 'minicare-cloud-6gqledlle0132cbe',
  secretId: credentials.secretId,
  secretKey: credentials.secretKey,
  ...(credentials.sessionToken ? { sessionToken: credentials.sessionToken } : {}),
})
const col = app.database().collection('agent_traces')
const { data } = await col.orderBy('startedAt', 'desc').limit(100).get()
console.log('agent_traces 文档数(近100):', (data || []).length)
const users = {}
const statuses = {}
const hosts = {}
for (const d of data || []) {
  users[d.userId] = (users[d.userId] || 0) + 1
  statuses[d.status] = (statuses[d.status] || 0) + 1
}
console.log('按 userId:', JSON.stringify(users))
console.log('按 status:', JSON.stringify(statuses))
console.log('最新 8 条:')
for (const d of (data || []).slice(0, 8)) {
  console.log(' ', new Date(d.startedAt).toISOString(), d.userId, d.status, JSON.stringify(d.input?.message || '').slice(0, 44), 'obs=' + (d.observations || []).length)
}
