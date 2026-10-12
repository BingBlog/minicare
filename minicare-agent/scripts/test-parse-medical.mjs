#!/usr/bin/env node
/**
 * 就医单据解析 · 回归脚本（scripts/test-parse-medical.mjs，PRD-017 / TECH-035）
 *
 * 用法（cd minicare-agent）:
 *   NODE_OPTIONS= node scripts/test-parse-medical.mjs                       # fixtures 模式（本地实样图）
 *   NODE_OPTIONS= node scripts/test-parse-medical.mjs --fixtures-dir <dir>  # 自定义图目录
 *   NODE_OPTIONS= node scripts/test-parse-medical.mjs --file-ids <id,id,...> # 真实 fileID，走完整拉图链路
 *
 * fixtures 模式：本地图 → callVisionOnce（经 wire-proxy）→ 归一 → 金标准断言（宽松，防脆弱）
 * file-ids 模式：parseMedicalImages（完整链路，含并发 3 + 拉图）→ 打印逐图结果与总耗时
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadLocalEnv } from '../src/lib/env.js'

loadLocalEnv()
const { loadConfig } = await import('../src/config.js')
const { initAgentRuntime } = await import('../src/lib/runtime.js')
const { callVisionOnce, parseMedicalImages } = await import('../src/lib/parse-medical.js')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const fileIdsArg = args.includes('--file-ids') ? args[args.indexOf('--file-ids') + 1] : null
const fixturesDir = args.includes('--fixtures-dir')
  ? args[args.indexOf('--fixtures-dir') + 1]
  : '/tmp/minicare-medical-imgs'

const config = loadConfig()
const info = await initAgentRuntime(config)
const baseUrl = process.env.ANTHROPIC_BASE_URL || info.baseUrl

const c = { green: (s) => `\x1b[32m${s}\x1b[0m`, red: (s) => `\x1b[31m${s}\x1b[0m`, dim: (s) => `\x1b[2m${s}\x1b[0m` }

// ── file-ids 模式：完整链路（拉图 + 并发 3 + 归一）────────────────────────
if (fileIdsArg) {
  const fileIds = fileIdsArg.split(',').map((s) => s.trim()).filter(Boolean)
  console.log(`[test] file-ids 模式：${fileIds.length} 张，base=${baseUrl}`)
  const t0 = Date.now()
  const results = await parseMedicalImages(fileIds, { config })
  const dt = Date.now() - t0
  for (const r of results) {
    if (r.ok) {
      const d = r.data || {}
      console.log(`  ✓ ${r.fileId.slice(-24)} → ${r.docType} (${r.confidence})` +
        ` meds=${d.medications?.length ?? 0} items=${d.items?.length ?? 0} low=${r.lowConfidenceFields?.length ?? 0}`)
    } else {
      console.log(`  ✗ ${r.fileId.slice(-24)} → ${r.error.code}: ${r.error.message}`)
    }
  }
  console.log(`[test] 总耗时 ${dt}ms（并发 3 上限）`)
  process.exit(results.some((r) => !r.ok) ? 1 : 0)
}

// ── fixtures 模式：本地实样图 + 金标准断言 ────────────────────────────────
/** 文件名前缀 → 期望（宽松断言：只验类型与关键数量/关键词） */
const EXPECT = [
  { match: '2026-10-12-sick-2', want: { docType: 'prescription', minMeds: 4 } },
  { match: '2026-10-12-sick-3', want: { docType: 'outpatient_record', diagnosisHas: '感染' } },
  { match: '2026-10-12-sick-4', want: { docType: 'lab_report', minItems: 20 } },
  { match: '2026-08-19', want: { docType: 'lab_report', minItems: 10 } },
]

if (!existsSync(fixturesDir)) {
  console.error(`[test] fixtures 目录不存在：${fixturesDir}`)
  console.error('       先运行 scripts/tmp-download-medical-photos.mjs 拉取实样图，或用 --file-ids 模式')
  process.exit(1)
}
const files = readdirSync(fixturesDir).filter((f) => f.endsWith('.jpg')).sort()
if (files.length === 0) {
  console.error(`[test] ${fixturesDir} 下没有 .jpg`)
  process.exit(1)
}
console.log(`[test] fixtures 模式：${files.length} 张，base=${baseUrl}`)

let pass = 0
let fail = 0
for (const file of files) {
  const t0 = Date.now()
  const b64 = readFileSync(path.join(fixturesDir, file)).toString('base64')
  try {
    const r = await callVisionOnce(config, baseUrl, b64)
    const dt = Date.now() - t0
    const d = r.data || {}
    const brief = `${r.docType} (${r.confidence}) meds=${d.medications?.length ?? 0} items=${d.items?.length ?? 0} low=${r.lowConfidenceFields?.length ?? 0}`
    const exp = EXPECT.find((e) => file.startsWith(e.match))
    let ok = true
    const notes = []
    if (exp) {
      if (exp.want.docType && r.docType !== exp.want.docType) { ok = false; notes.push(`docType≠${exp.want.docType}`) }
      if (exp.want.minMeds && (d.medications?.length ?? 0) < exp.want.minMeds) { ok = false; notes.push(`meds<${exp.want.minMeds}`) }
      if (exp.want.minItems && (d.items?.length ?? 0) < exp.want.minItems) { ok = false; notes.push(`items<${exp.want.minItems}`) }
      if (exp.want.diagnosisHas && !(d.diagnosis || []).some((x) => String(x).includes(exp.want.diagnosisHas))) {
        ok = false
        notes.push(`diagnosis 缺「${exp.want.diagnosisHas}」`)
      }
    }
    if (ok) { pass++; console.log(`  ${c.green('PASS')} ${file} ${dt}ms → ${brief}`) }
    else { fail++; console.log(`  ${c.red('FAIL')} ${file} ${dt}ms → ${brief} :: ${notes.join('; ')}`) }
  } catch (e) {
    fail++
    console.log(`  ${c.red('FAIL')} ${file} ${Date.now() - t0}ms → 异常: ${e?.message || e}`)
  }
}
console.log(`\n[test] ${c.green(`${pass} PASS`)} / ${fail ? c.red(`${fail} FAIL`) : '0 FAIL'}`)
console.log(c.dim('  注：fixtures 为宽松断言（类型 + 数量/关键词），字段级金标准对账见 TECH-035 §6.2'))
process.exit(fail ? 1 : 0)
