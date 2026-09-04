/**
 * P1 检索自测（scripts/test-search.mjs）
 *
 * 本地联调：从 .env.local 加载 DB + TOKENHUB 配置，跑 hybridSearch 验证
 * FULLTEXT + 向量 + RRF 链路。用法：
 *   node scripts/test-search.mjs
 */
import { loadLocalEnv } from '../src/lib/env.js'

loadLocalEnv()
import { initDb, closeDb } from '../src/lib/db.js'
import { loadConfig } from '../src/config.js'
import { hybridSearch } from '../src/lib/tools/search-knowledge.js'

const config = loadConfig()
initDb(config)

const queries = [
  '深度水解配方怎么选',
  '宝宝便血怎么办',
  '辅食添加顺序',
  '严重过敏反应急救',
  '牛奶蛋白过敏诊断标准',
]

console.log('DB:', Boolean(config.db), '| embedding:', Boolean(config.tokenHubKey), '\n')

for (const q of queries) {
  const items = await hybridSearch(q, 5)
  console.log(`\n### 查询: ${q}`)
  if (items.length === 0) {
    console.log('  （无结果）')
    continue
  }
  for (const it of items) {
    console.log(`  [${it.kb_id}] ${it.title} (risk=${it.risk_level}) ${String(it.content).slice(0, 60)}...`)
  }
}

// 过滤器验证
console.log('\n### 过滤器 riskLevel=emergency, query=过敏:')
const em = await hybridSearch('过敏', 5, { riskLevel: 'emergency' })
console.log(em.length === 0 ? '  （无结果）' : em.map((i) => `  [${i.kb_id}] ${i.title} (${i.risk_level})`).join('\n'))

await closeDb()
