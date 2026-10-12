/**
 * 全量信号实测（TECH-029 / US-01 表格直显「实测值」列）
 *
 * 用法：node scripts/signals-all.mjs --baby=<UUID|名字> [--prod] [--config=<file>] [--pretty]
 * 输出：JSON { ok, baby, datasource, values: { [signalId]: { value } }, flags: { [flagKey]: { triggered, strength, detail } }, generatedAt }
 *
 * 一次 getPerception + getBabyProfile，遍历共享提取器表（signal-extractors.mjs）批量取值；
 * 提取器单条异常不影响整体（该项 value=null + error）。
 */
import { parseArgs, bootstrap } from './lib/signal-common.mjs'
import { EXTRACTORS } from './lib/signal-extractors.mjs'

const opts = parseArgs(process.argv)

try {
  const { baby, p, q, datasource, signalConfig } = await bootstrap(opts)

  const values = {}
  for (const [key, fn] of Object.entries(EXTRACTORS)) {
    try {
      const r = fn(q, p)
      values[key] = { value: r?.value ?? null, note: r?.note ?? null }
    } catch (e) {
      values[key] = { value: null, note: null, error: String(e?.message || e) }
    }
  }

  // flags：以注册表 12 条为准（未触发的也输出，triggered: false）
  const flags = {}
  const flagCfg = signalConfig?.flags || {}
  const triggered = new Map((q.flags || []).map((f) => [f.key, f]))
  for (const key of Object.keys(flagCfg)) {
    const hit = triggered.get(key)
    flags[key] = hit
      ? { triggered: true, strength: hit.strength, detail: hit.detail }
      : { triggered: false, strength: flagCfg[key]?.strength || null, detail: null }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        baby: { id: baby.id, name: baby.name },
        datasource,
        values,
        flags,
        generatedAt: new Date().toISOString(),
      },
      null,
      opts.pretty ? 2 : 0,
    ),
  )
  // ⚠️ 必须显式退出：mysql2 连接池的 keepalive 连接会保活事件循环，不加这句进程永不退出
  // （表现为「输出已写完但子进程挂住」——2026-10-11 实测踩坑；signal-dump 早前用 process.exit 无意规避）
  process.exit(0)
} catch (e) {
  console.log(JSON.stringify({ ok: false, error: String(e?.message || e) }))
  process.exit(1)
}
