/** 验收辅助：查看 FlexDB agent_traces 最近记录（TECH-007） */
import { loadLocalEnv } from '../src/lib/env.js'

loadLocalEnv()
import cloudbase from '@cloudbase/node-sdk'
import { getTcbCredentials } from '../src/config.js'

const credentials = getTcbCredentials()
const envId = process.env.TCB_ENV_ID || 'minicare-cloud-6gqledlle0132cbe'
const app = cloudbase.init({
  env: envId,
  secretId: credentials.secretId,
  secretKey: credentials.secretKey,
  ...(credentials.sessionToken ? { sessionToken: credentials.sessionToken } : {}),
})
const col = app.database().collection('agent_traces')
const { data } = await col.orderBy('startedAt', 'desc').limit(3).get()
for (const d of data || []) {
  const gens = (d.observations || []).filter((o) => o.type === 'generation')
  const spans = (d.observations || []).filter((o) => o.type === 'span')
  console.log('─'.repeat(70))
  console.log(`traceId: ${d.traceId}`)
  console.log(`status=${d.status}  userId=${d.userId}  model=${d.metadata?.model}  totalMs=${d.metadata?.totalMs}`)
  console.log(`input.message: ${JSON.stringify(d.input?.message)?.slice(0, 60)}`)
  console.log(`output: ${JSON.stringify(d.output)?.slice(0, 80)}`)
  console.log(`generations=${gens.length}: ${gens.map((g) => `${g.name}[${g.endTime - g.startTime}ms, tokens=${g.usage?.total_tokens ?? '-'}, out=${(g.output || '').length}字]`).join('  ')}`)
  for (const s of spans) {
    console.log(`span: ${s.name} [${s.endTime - s.startTime}ms] level=${s.level} input=${JSON.stringify(s.input).slice(0, 80)} output=${JSON.stringify(s.output).slice(0, 120)}`)
  }
  console.log(`importedAt: ${d.importedAt || '(未导入)'}`)
}
if (!data?.length) console.log('agent_traces 为空')
