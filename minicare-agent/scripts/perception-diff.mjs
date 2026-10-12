/**
 * 改前/改后对比（TECH-029 §4.2 / PRD-014 US-06 干跑）
 *
 * 设计：双进程模式——perception.js 的 REF 等是模块级常量（加载时固化），
 * 同一进程无法加载两套配置；独立子进程天然隔离（模块全新求值）。
 *
 * 用法（编排，默认）：
 *   node scripts/perception-diff.mjs --baby=<UUID|名字> [--prod] [--config=<草稿 file>] [--pretty]
 *   - 无 --config：只跑基线快照（mode=baseline）
 *   - 有 --config：spawn 基线 + 草稿两个 --emit 子进程，输出 diff（mode=diff）
 * 用法（单发，内部）：
 *   --emit  输出单份快照 JSON（供编排模式递归调用；不 spawn，防递归）
 *
 * 输出：JSON（默认单行；--pretty 人类可读）。不改任何文件；草稿只读。
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseArgs, bootstrap } from './lib/signal-common.mjs'

const SELF = fileURLToPath(import.meta.url)
const opts = parseArgs(process.argv)
const out = (obj, code = 0) => {
  if (opts.pretty && obj.ok && obj.mode === 'diff') {
    renderPretty(obj)
  } else {
    console.log(JSON.stringify(obj, null, opts.pretty ? 2 : 0))
  }
  process.exit(code)
}

// ══ 快照（emit 模式）════════════════════════════════════════════
/** diff 用的信号摘要（扁平 key→值，值为原始类型或已字符串化） */
function signalSummary(q) {
  return {
    'formula.status': q.stage?.status ?? null,
    'formula.stableDays': q.stage?.stableDays ?? null,
    'formula.mix': q.stage?.mix ? q.stage.mix.map(([t, r]) => `${t}:${Math.round(r * 100)}%`).join('+') : null,
    'formula.verdict': q.stage?.verdict ?? null,
    'allergy.safeKinds': q.allergy?.safeKinds ?? null,
    'allergy.observing': (q.allergy?.observing ?? []).map((o) => `${o.name}:${o.day}/${o.days}`).join('|') || null,
    'variety.hitDays': q.variety?.hitDays ?? null,
    'variety.avgKinds': q.variety?.avgKinds ?? null,
    'maintain.idleSafe': q.maintain?.idleSafe?.length ?? null,
    'symptoms.eventTotal': q.symptoms?.eventTotal ?? null,
    'symptoms.symptomStaleDays': q.symptoms?.symptomStaleDays ?? null,
    'stool.fillRate': q.stool?.fillRate ?? null,
    'trust.symptomUsable': q.trust?.symptomUsable ?? null,
    'coverage.foodIntakeRate': q.coverage?.foodIntake?.rate ?? null,
    'highRisk.introduced': (q.highRisk ?? []).filter((h) => h.introduced).length,
  }
}

async function emitSnapshot() {
  const { baby, p, q, datasource, renderPerceptionBlock, signalConfig } = await bootstrap(opts)
  const { block, flags } = renderPerceptionBlock(q, { enabled: true })
  return {
    ok: true,
    baby: { id: baby.id, name: baby.name },
    datasource,
    block,
    flags,
    route: q.route?.route ?? null,
    guardHits: (q.route?.guardHits ?? []).map((g) => g.key),
    signals: signalSummary(q),
    cfg: { ref: q.ref, throttle: signalConfig.throttle, flags: signalConfig.flags },
  }
}

// ══ 行级 diff（LCS；注入块规模几十行，O(n²) 足够）══════════════════
function diffLines(beforeLines, afterLines) {
  const n = beforeLines.length
  const m = afterLines.length
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = beforeLines[i] === afterLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const lines = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (beforeLines[i] === afterLines[j]) {
      lines.push({ type: 'same', text: beforeLines[i] })
      i += 1
      j += 1
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push({ type: 'del', text: beforeLines[i] })
      i += 1
    } else {
      lines.push({ type: 'add', text: afterLines[j] })
      j += 1
    }
  }
  while (i < n) lines.push({ type: 'del', text: beforeLines[i++] })
  while (j < m) lines.push({ type: 'add', text: afterLines[j++] })
  return lines
}

function diffFlat(beforeObj, afterObj) {
  const keys = new Set([...Object.keys(beforeObj || {}), ...Object.keys(afterObj || {})])
  const changed = []
  for (const k of keys) {
    const b = beforeObj?.[k] ?? null
    const a = afterObj?.[k] ?? null
    if (JSON.stringify(b) !== JSON.stringify(a)) changed.push({ key: k, before: b, after: a })
  }
  return changed
}

function computeDiff(before, after) {
  const bFlags = new Map((before.flags || []).map((f) => [f.key, f]))
  const aFlags = new Map((after.flags || []).map((f) => [f.key, f]))
  const flagsAdded = [...aFlags.keys()].filter((k) => !bFlags.has(k)).map((k) => aFlags.get(k))
  const flagsRemoved = [...bFlags.keys()].filter((k) => !aFlags.has(k)).map((k) => bFlags.get(k))
  const flagsChanged = [...aFlags.keys()]
    .filter((k) => bFlags.has(k))
    .filter((k) => bFlags.get(k).strength !== aFlags.get(k).strength || bFlags.get(k).detail !== aFlags.get(k).detail)
    .map((k) => ({ key: k, before: bFlags.get(k), after: aFlags.get(k) }))

  const configChanged = [
    ...diffFlat(before.cfg?.ref, after.cfg?.ref).map((d) => ({ ...d, key: `ref.${d.key}` })),
    ...diffFlat(before.cfg?.throttle, after.cfg?.throttle).map((d) => ({ ...d, key: `throttle.${d.key}` })),
    ...diffFlat(before.cfg?.flags, after.cfg?.flags).map((d) => ({ ...d, key: `flags.${d.key}` })),
  ]

  return {
    blockLines: diffLines(before.block.split('\n'), after.block.split('\n')),
    flagsAdded,
    flagsRemoved,
    flagsChanged,
    routeChanged: before.route !== after.route ? { before: before.route, after: after.route } : null,
    guardHitsChanged: JSON.stringify(before.guardHits) !== JSON.stringify(after.guardHits) ? { before: before.guardHits, after: after.guardHits } : null,
    signalsChanged: diffFlat(before.signals, after.signals),
    configChanged,
  }
}

function renderPretty(result) {
  const d = result.diff
  console.log(`变更对比（${result.meta.datasource} · ${result.before?.baby?.name || ''}）\n`)
  console.log(`配置层变化（${d.configChanged.length} 项）：`)
  for (const c of d.configChanged) console.log(`  ~ ${c.key}: ${JSON.stringify(c.before)} -> ${JSON.stringify(c.after)}`)
  console.log(`\nflag 变化：新增 ${d.flagsAdded.length} / 消失 ${d.flagsRemoved.length} / 变化 ${d.flagsChanged.length}`)
  for (const f of d.flagsAdded) console.log(`  + [${f.strength}] ${f.label}`)
  for (const f of d.flagsRemoved) console.log(`  - [${f.strength}] ${f.label}`)
  for (const f of d.flagsChanged) console.log(`  ~ ${f.after.label}: ${f.before.strength} -> ${f.after.strength}`)
  if (d.routeChanged) console.log(`\n判定路径：${d.routeChanged.before} -> ${d.routeChanged.after}`)
  if (d.signalsChanged.length) {
    console.log(`\n信号值变化（${d.signalsChanged.length} 项）：`)
    for (const s of d.signalsChanged) console.log(`  ~ ${s.key}: ${JSON.stringify(s.before)} -> ${JSON.stringify(s.after)}`)
  }
  console.log('\n注入块 diff：')
  for (const l of d.blockLines) {
    if (l.type === 'same') continue
    console.log(`  ${l.type === 'add' ? '+' : '-'} ${l.text}`)
  }
  const changedCount = d.blockLines.filter((l) => l.type !== 'same').length
  console.log(`\n（注入块共 ${d.blockLines.length} 行，其中变化 ${changedCount} 行）`)
}

// ══ 编排（parent）═══════════════════════════════════════════════
function runEmit(extra = []) {
  const env = { ...process.env }
  delete env.SIGNALS_CONFIG
  delete env.SIGNALS_REGISTRY // 基线不得继承草稿 env（草稿经 --config 参数传入）
  const args = [SELF, '--emit', `--baby=${opts.baby}`, ...(opts.prod ? ['--prod'] : []), ...extra]
  const stdout = execFileSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, env })
  const line = stdout.split('\n').filter((l) => l.trim().startsWith('{')).pop()
  if (!line) throw new Error('emit 子进程无 JSON 输出')
  return JSON.parse(line)
}

try {
  if (opts.emit) {
    const snap = await emitSnapshot()
    console.log(JSON.stringify(snap))
    process.exit(0)
  }
  if (!opts.baby) out({ ok: false, error: '缺少 --baby' }, 1)
  if (opts.configFile && !existsSync(opts.configFile)) {
    out({ ok: false, error: `草稿文件不存在：${opts.configFile}` }, 1)
  }
  const before = runEmit()
  if (!before.ok) throw new Error(before.error || '基线快照失败')
  if (!opts.configFile) {
    out({ ok: true, mode: 'baseline', meta: { at: new Date().toISOString() }, before })
  }
  const after = runEmit([`--config=${opts.configFile}`])
  if (!after.ok) throw new Error(after.error || '草稿快照失败')
  const result = {
    ok: true,
    mode: 'diff',
    meta: { at: new Date().toISOString(), draftFile: opts.configFile, datasource: before.datasource, baby: before.baby },
    diff: computeDiff(before, after),
    before,
    after,
  }
  out(result)
} catch (e) {
  out({ ok: false, error: String(e?.message || e) }, 1)
}
