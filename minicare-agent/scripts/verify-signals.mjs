/**
 * 信号配置层回归验证（config/registry.yaml + config/signals.yaml + src/config-loader.js）
 * —— TECH-029 S1
 *
 * 运行：cd minicare-agent && node scripts/verify-signals.mjs
 * 覆盖：
 *   ① 结构：组 / 信号 / flag / 参数的数量口径与双向对齐、字段完整性
 *   ② 一致性：registry 默认值 ≡ 代码兜底（FACTORY_DEFAULTS）≡ 迁移基线（fixtures）
 *   ③ 兜底链：坏文件 / 非法值 / 缺文件 → 静默降级到正确层级（子进程 probe，真实进程隔离）
 *   ④ 词表：结构完整性（组数 / 键非空 / 类型）
 * 不依赖数据库。失败即退出码 1，可直接接进平台发布校验。
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import yaml from 'js-yaml'
import { FACTORY_DEFAULTS } from '../src/config-loader.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0
let fail = 0
const check = (name, cond, extra) => {
  if (cond) {
    pass += 1
    console.log(`PASS  ${name}${extra ? ` :: ${extra}` : ''}`)
  } else {
    fail += 1
    console.log(`FAIL  ${name}${extra ? ` :: ${extra}` : ''}`)
  }
}

// ══ ① 结构 ══════════════════════════════════════════════════════
const reg = yaml.load(readFileSync(path.join(ROOT, 'config/registry.yaml'), 'utf8'))
const sig = yaml.load(readFileSync(path.join(ROOT, 'config/signals.yaml'), 'utf8'))
const allSignals = (reg.groups || []).flatMap((g) => g.signals || [])

check('schema_version 一致', reg.schema_version === sig.schema_version, `${reg.schema_version}/${sig.schema_version}`)
check('10 组（A-J）', (reg.groups || []).length === 10)
check('46 信号（口径锁定）', allSignals.length === 46, String(allSignals.length))
check('12 条 flag 定义', (reg.flags || []).length === 12)
check('34 项参数定义', (reg.params || []).length === 34)
check('信号 id 唯一', new Set(allSignals.map((s) => s.id)).size === allSignals.length)
check('flag key 唯一', new Set(reg.flags.map((f) => f.key)).size === reg.flags.length)

const pkeys = reg.params.map((p) => p.key)
const vkeys = Object.keys(sig.values).filter((k) => k !== 'flags')
check('参数 ↔ 值：无缺值', pkeys.every((k) => vkeys.includes(k)), pkeys.filter((k) => !vkeys.includes(k)).join(','))
check('参数 ↔ 值：无孤儿键', vkeys.every((k) => pkeys.includes(k)), vkeys.filter((k) => !pkeys.includes(k)).join(','))
const fkeys = reg.flags.map((f) => f.key)
const sfkeys = Object.keys(sig.values.flags)
check('flag 定义 ↔ 开关值：双向对齐', fkeys.every((k) => sfkeys.includes(k)) && sfkeys.every((k) => fkeys.includes(k)))
check('每条 flag 带触发描述与出处', reg.flags.every((f) => f.trigger_desc && f.origin))

const badSignal = allSignals.filter((s) => !s.id || !s.name || !s.layer || !s.caliber || !s.status)
check('信号字段完整（id/name/layer/caliber/status）', badSignal.length === 0, badSignal.map((s) => s.id).join(','))
const badParam = reg.params.filter((p) => !p.key || !p.name || !p.group || !p.type)
check('参数字段完整（key/name/group/type）', badParam.length === 0, badParam.map((p) => p.key).join(','))
const badLayer = allSignals.filter((s) => !['fact', 'inference', 'meta'].includes(s.layer))
check('信号 layer 枚举合法', badLayer.length === 0, badLayer.map((s) => s.id).join(','))
const badStatus = allSignals.filter((s) => !['active', 'degraded', 'gap'].includes(s.status))
check('信号 status 枚举合法', badStatus.length === 0, badStatus.map((s) => s.id).join(','))

// ══ ② 一致性 ════════════════════════════════════════════════════
const mismatch = reg.params.filter((p) => p.default != null && FACTORY_DEFAULTS[p.key] !== p.default)
check(
  'registry 默认 ≡ 代码兜底（数值类）',
  mismatch.length === 0,
  mismatch.map((p) => `${p.key}: ${p.default} vs ${FACTORY_DEFAULTS[p.key]}`).join('; '),
)
const fMismatch = reg.flags.filter((f) => FACTORY_DEFAULTS.flags[f.key]?.strength !== f.default_strength)
check('registry flag 默认强度 ≡ 代码兜底', fMismatch.length === 0, fMismatch.map((f) => f.key).join(','))

const baseline = JSON.parse(readFileSync(path.join(ROOT, 'scripts/fixtures/signal-baseline.json'), 'utf8'))
const baseMismatch = Object.entries(baseline.numeric).filter(([k, v]) => FACTORY_DEFAULTS[k] !== v)
check('代码兜底 ≡ 迁移基线（数值类，防搬运漂移）', baseMismatch.length === 0, baseMismatch.map(([k]) => k).join(','))
const baseFlagMismatch = Object.entries(baseline.flagsStrength).filter(([k, v]) => FACTORY_DEFAULTS.flags[k]?.strength !== v)
check('代码兜底 flag 强度 ≡ 迁移基线', baseFlagMismatch.length === 0, baseFlagMismatch.map(([k]) => k).join(','))

// ══ ③ 兜底链（子进程 probe：env 在进程启动时读取，须真实隔离）════════════
const PROBE = `
import { getSignalConfig } from ${JSON.stringify(path.join(ROOT, 'src/config-loader.js'))}
const c = getSignalConfig()
console.log(JSON.stringify({ source: c.meta.source, warnings: c.meta.warnings.length, observeDays: c.ref.observeDays, strongBypass: c.throttle.strongBypass }))
`
const probe = (env) =>
  JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', PROBE], { cwd: ROOT, env: { ...process.env, ...env }, encoding: 'utf8' }).trim())

const tmp = mkdtempSync(path.join(os.tmpdir(), 'verify-signals-'))
const badYaml = path.join(tmp, 'bad.yaml')
writeFileSync(badYaml, 'values:\n  a: [unclosed', 'utf8')
const badVal = path.join(tmp, 'badval.yaml')
writeFileSync(badVal, yaml.dump({ schema_version: 1, values: { ...sig.values, observeDays: 99 } }), 'utf8')

const normal = probe({})
check('正常路径：source=signals+registry 且零告警', normal.source === 'signals+registry' && normal.warnings === 0, JSON.stringify(normal))
const w1 = probe({ SIGNALS_CONFIG: badYaml })
check('坏文件 → 降级 registry 且不崩', w1.source === 'registry' && w1.warnings >= 1, JSON.stringify(w1))
const w2 = probe({ SIGNALS_CONFIG: badVal })
check('非法值 → 单项回退默认（observeDays 99 → 3）', w2.observeDays === 3 && w2.warnings >= 1, JSON.stringify(w2))
const w3 = probe({ SIGNALS_CONFIG: path.join(tmp, 'not-exist.yaml') })
check('缺文件 → 降级 registry', w3.source === 'registry', JSON.stringify(w3))

// ══ ④ 词表 ══════════════════════════════════════════════════════
check(
  '高致敏 7 组且 keys 非空',
  sig.values.highRiskGroups.length === 7 && sig.values.highRiskGroups.every((g) => g.group && Array.isArray(g.keys) && g.keys.length > 0),
)
check(
  '七大类 7 类且 keys 非空',
  sig.values.categoryRules.length === 7 && sig.values.categoryRules.every((c) => c.category && Array.isArray(c.keys) && c.keys.length > 0),
)
check(
  '前缀/后缀为非空数组',
  Array.isArray(sig.values.prefix) && sig.values.prefix.length > 0 && Array.isArray(sig.values.suffix) && sig.values.suffix.length > 0,
)
check('别名表为对象', sig.values.alias != null && typeof sig.values.alias === 'object' && !Array.isArray(sig.values.alias))

// ══ 汇总 ════════════════════════════════════════════════════════
console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
process.exit(fail === 0 ? 0 : 1)
