/**
 * 单信号实测（TECH-029 §4.1 / PRD-014 US-02「跑一遍」）
 *
 * 用法：node scripts/signal-dump.mjs --baby=<UUID|名字> --key=<signalId|flagKey> [--prod] [--config=<file>] [--pretty]
 * 输出：JSON { ok, baby, datasource, key, name, group, value, note, generatedAt }
 * 失败：JSON { ok:false, error, hint? }，exit 1（平台按错误摘要展示，可重试）
 */
import { parseArgs, bootstrap } from './lib/signal-common.mjs'
import { EXTRACTORS, FLAG_META, SIG_META, findFlag } from './lib/signal-extractors.mjs'

const opts = parseArgs(process.argv)
const out = (obj, code = 0) => {
  console.log(JSON.stringify(obj, null, opts.pretty ? 2 : 0))
  process.exit(code)
}

try {
  if (!opts.key) out({ ok: false, error: '缺少 --key=<signalId|flagKey>' }, 1)
  const { baby, p, q, datasource } = await bootstrap(opts)
  const meta = SIG_META.get(opts.key)
  let result = null
  if (meta && EXTRACTORS[opts.key]) result = EXTRACTORS[opts.key](q, p)
  else if (FLAG_META.has(opts.key)) result = findFlag(q, opts.key)
  else if (meta) result = { value: null, note: '该信号暂未提供单点提取器（见 signal-dump.mjs EXTRACTORS）' }
  if (!result) {
    out({ ok: false, error: 'NO_EXTRACTOR', hint: `未知信号 key：${opts.key}（46 信号 id 或 12 flag key）` }, 1)
  }
  out({
    ok: true,
    baby: { id: baby.id, name: baby.name },
    datasource,
    key: opts.key,
    name: meta?.name || FLAG_META.get(opts.key)?.name || opts.key,
    group: meta ? `${meta.groupName}（${meta.status}）` : 'J 矛盾与风险',
    value: result.value ?? null,
    note: result.note ?? null,
    generatedAt: new Date().toISOString(),
  })
} catch (e) {
  out({ ok: false, error: String(e?.message || e) }, 1)
}
