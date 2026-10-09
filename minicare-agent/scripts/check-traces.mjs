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
  console.log(`status=${d.status}  userId=${d.userId}  model=${d.metadata?.model}  totalMs=${d.metadata?.totalMs}${d.metadata?.cliEnriched ? '  [transcript 增强]' : ''}`)
  console.log(`input.message: ${JSON.stringify(d.input?.message)?.slice(0, 60)}`)
  console.log(`output: ${JSON.stringify(d.output)?.slice(0, 80)}`)
  console.log(
    `generations=${gens.length}: ${gens
      .map((g) => {
        const u = g.usage || {}
        const cache = u.cache_read_input_tokens || u.cache_creation_input_tokens
        const ms = (g.endTime || g.startTime) - g.startTime
        const usage =
          u.input_tokens != null
            ? `in=${u.input_tokens}/out=${u.output_tokens}${cache ? `/cache=${cache}` : ''}`
            : `tokens=${u.total_tokens ?? '-'}`
        return `${g.name}[${ms}ms, ${usage}, out=${(g.output || '').length}字]`
      })
      .join('  ')}`,
  )
  for (const s of spans) {
    console.log(`span: ${s.name} [${s.endTime - s.startTime}ms] level=${s.level} input=${JSON.stringify(s.input).slice(0, 80)} output=${JSON.stringify(s.output).slice(0, 120)}`)
  }
  console.log(`importedAt: ${d.importedAt || '(未导入)'}`)
}
if (!data?.length) console.log('agent_traces 为空')
