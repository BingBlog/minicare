/**
 * 精确 Recall@10 评测（scripts/eval-recall-exact.mjs，M02 §7 上线闸门）
 *
 * 口径与 minicare-platform/api/scripts/eval-recall-exact.py 一致：
 *   Recall@10 = 每题 gold KB 条目映射的知识块在 top10 中被命中的比例，≥90% 为闸门。
 * 检索用本服务（agent-poc）的 hybridSearch——验证的就是生产检索链路。
 *
 * 用法：node scripts/eval-recall-exact.mjs
 */
import { loadLocalEnv } from '../src/lib/env.js'

loadLocalEnv()
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initDb, closeDb } from '../src/lib/db.js'
import { loadConfig } from '../src/config.js'
import { hybridSearch } from '../src/lib/tools/search-knowledge.js'

const _dir = path.dirname(fileURLToPath(import.meta.url))
const TEST_SET = path.resolve(_dir, '../../docs/knowledge/research/召回测试集-种子50题.md')
// 映射表为构建期中间产物（var/ 下）；如缺失，见 minicare-platform/api/docs/KB-MAPPING.md
const MAPPING = path.resolve(_dir, '../../minicare-platform/api/var/kb_mapping.json')
const RRF_TOP_K = 10

function parseTestset(path) {
  const items = []
  for (const line of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\|\s*([A-H]-\d+)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(\w+)\s*\|/)
    if (!m || m[2].startsWith('question')) continue
    const gold = m[3].match(/KB-[A-H]\d+/g) || []
    const neg = m[5].match(/KB-[A-H]\d+/g) || []
    items.push({ qid: m[1], question: m[2], gold, neg, risk: m[7] })
  }
  return items
}

const config = loadConfig()
initDb(config)
const mapping = JSON.parse(fs.readFileSync(MAPPING, 'utf8'))
const kbToChunks = {}
for (const [code, v] of Object.entries(mapping)) kbToChunks[code] = new Set(v)

const items = parseTestset(TEST_SET)
const rows = []
let idx = 0
for (const it of items) {
  const top10 = await hybridSearch(it.question, RRF_TOP_K)
  const topKb = top10.map((c) => c.kb_id)
  const top10Set = new Set(topKb)
  let goldChunks = new Set()
  for (const code of it.gold) goldChunks = new Set([...goldChunks, ...(kbToChunks[code] || [])])
  const goldHit = goldChunks.size > 0 && [...goldChunks].some((k) => top10Set.has(k))
  let negChunks = new Set()
  for (const code of it.neg) negChunks = new Set([...negChunks, ...(kbToChunks[code] || [])])
  const harmful = negChunks.size > 0 && topKb.slice(0, 5).some((k) => negChunks.has(k))
  rows.push({ qid: it.qid, question: it.question, risk: it.risk, gold: it.gold, goldHit, harmful, top5: topKb.slice(0, 5) })
  process.stdout.write(`\r${++idx}/${items.length} 题`)
}
console.log()

const total = rows.length
const goldHits = rows.filter((r) => r.goldHit).length
const harmfulN = rows.filter((r) => r.harmful).length
console.log(`\n=== 精确 Recall@10（gold 条目命中，检索=agent-poc hybridSearch）===\ngold 命中: ${goldHits}/${total} = ${(goldHits / total * 100).toFixed(1)}%  （目标 ≥90%）`)
console.log(`有害召回（negative 进 top5）: ${harmfulN}\n闸门: ${goldHits / total >= 0.9 ? '✅ 通过' : '❌ 未通过'}\n`)
console.log('=== 未命中题目 ===')
for (const r of rows) {
  if (!r.goldHit) {
    console.log(`[${r.qid}](${r.risk}) ${r.question.slice(0, 28)}… gold=${r.gold.join(',')}`)
    console.log(`   top5: ${r.top5.join(', ')}`)
  }
}

await closeDb()
