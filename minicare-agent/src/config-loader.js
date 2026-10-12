/**
 * 信号配置加载器（TECH-029 §3.3）
 *
 * 职责：把 config/registry.yaml（结构真源）与 config/signals.yaml（值真源）加载为
 * 冻结的运行时配置对象，供 perception.js / profile.js 派生常量。
 *
 * 三层兜底（任何一层失败都静默降级 + warn，绝不抛错、不影响服务启动）：
 *   ① config/signals.yaml（值真源，当前生效值）
 *   ② config/registry.yaml 的 params[].default（结构真源的默认值；词表类为 null → 跳至 ③）
 *   ③ FACTORY_DEFAULTS（代码内置，最后防线）
 *
 * 加载时机：首次 import 时同步加载一次（进程内单例）。这是「随部署生效」的语义载体——
 * CloudRun 滚动部署重建实例 → 新实例启动时读到新配置；不引入文件监听/热更新。
 *
 * 干跑/测试场景：用环境变量指向其他文件后 import（子进程天然隔离，无缓存污染）：
 *   SIGNALS_CONFIG=/tmp/draft.yaml node scripts/perception-diff.mjs ...
 * 同进程切换（仅测试用）：resetSignalConfigCache() 后重新 import 无效（ESM 模块缓存），
 * 因此「同进程两套配置」的场景一律用独立子进程实现（见 perception-diff.mjs）。
 *
 * 校验：类型 / 范围 / 枚举（与平台侧保存校验同规则）；非法项单独回退到 baseline（warn）。
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** 路径解析：env 可覆盖（干跑脚本注入草稿用） */
const registryPath = () => process.env.SIGNALS_REGISTRY || path.join(ROOT, 'config', 'registry.yaml')
const configPath = () => process.env.SIGNALS_CONFIG || path.join(ROOT, 'config', 'signals.yaml')

/**
 * 出厂默认（最后防线）——与 config/registry.yaml 的 params[].default 的一致性
 * 由 scripts/verify-signals.mjs 断言守护：**改默认值必须两处同步**。
 * 词表类（highRiskGroups 等）的出厂值只在这里维护（registry 中对应 default 为 null）。
 * 已导出：供 verify-signals.mjs 与本文件的可测试性使用，业务代码不得直接引用。
 */
export const FACTORY_DEFAULTS = Object.freeze({
  // ref（15）
  stageStableDays: 14,
  stageMinDays: 7,
  observeDays: 3,
  dailyKinds: 4,
  dailyCategories: 4,
  maintainPerWeek: 2,
  maintainPerWeekMax: 3,
  symptomUsableDays: 14,
  windowVarietyDays: 14,
  windowEatenDays: 30,
  allergyEventDays: 90,
  stoolWindowDays: 14,
  coverageMin: 0.5,
  growthDropLevels: 1,
  adherenceDays: 30,
  // threshold（9）
  staleFormulaDays: 3,
  staleFoodDays: 3,
  staleSupplementDays: 3,
  staleMedicationDays: 3,
  staleGrowthDays: 45,
  staleSymptomDays: 14,
  staleMedicalDays: 45,
  staleDiaryDays: 3,
  weanedDays: 14,
  // throttle（3）
  dedupDays: 7,
  maxPerTurn: 1,
  strongBypass: true,
  // wordlist（5 类）——出厂词表只在此处维护
  highRiskGroups: [
    ['蛋类', ['蛋']],
    ['小麦', ['小麦', '面粉', '面条', '馒头', '面包']],
    ['大豆', ['大豆', '黄豆', '豆腐', '豆浆', '豆奶', '豆制品']],
    ['花生', ['花生']],
    ['鱼虾', ['鱼', '虾', '鳕鱼', '三文鱼', '鲈鱼', '龙利鱼', '贝']],
    ['坚果', ['坚果', '核桃', '芝麻', '杏仁', '腰果', '榛子']],
    ['乳制品', ['酸奶', '奶酪', '芝士', '黄油']],
  ],
  categoryRules: [
    ['谷薯', ['米粉', '米', '小米', '粥', '面', '馒头', '土豆', '红薯', '紫薯', '山药', '玉米', '燕麦', '南瓜']],
    ['蔬菜', ['青菜', '西兰花', '菠菜', '胡萝卜', '生菜', '芹菜', '白菜', '油菜', '番茄', '西红柿', '黄瓜', '冬瓜', '茄子', '豌豆', '西葫芦']],
    ['水果', ['苹果', '香蕉', '梨', '火龙果', '蓝莓', '草莓', '桃', '牛油果', '橙', '葡萄', '西梅']],
    ['肉禽鱼', ['鸡', '猪', '牛', '羊', '里脊', '鱼', '虾', '鳕鱼', '三文鱼', '肝']],
    ['蛋', ['蛋']],
    ['豆类坚果', ['豆腐', '豆', '花生', '芝麻', '核桃', '坚果']],
    ['奶类', ['奶', '酸奶', '奶酪']],
  ],
  prefix: ['纯', '熟', '自制', '新鲜', '有机', '进口'],
  suffix: ['米糊', '泥糊', '泥', '糊', '粥', '水', '汁', '条', '块', '片', '粉', '沫', '羹', '汤'],
  alias: {},
  // inject（2）
  injectPerception: true,
  injectFlagThrottle: true,
  // flags（12）——强度兜底；enabled 缺省 true
  flags: {
    eating_marked: { enabled: true, strength: 'strong' },
    stage_stalled_symptomatic: { enabled: true, strength: 'strong' },
    stage_ready_but_symptomatic: { enabled: true, strength: 'strong' },
    observing_overlap: { enabled: true, strength: 'intercept' },
    observe_stalled: { enabled: true, strength: 'medium' },
    stage_stalled: { enabled: true, strength: 'medium' },
    growth_falling: { enabled: true, strength: 'medium' },
    data_stale: { enabled: true, strength: 'medium' },
    safe_not_maintained: { enabled: true, strength: 'medium' },
    variety_insufficient: { enabled: true, strength: 'medium' },
    ladder_escalated: { enabled: true, strength: 'weak' },
    transition_ready: { enabled: true, strength: 'weak' },
  },
})

const VALID_STRENGTHS = ['strong', 'medium', 'weak', 'intercept']
/** REF 的 15 个键（运行时 ref 对象的组成；与 registry params 的 ref 组一致） */
const REF_KEYS = [
  'stageStableDays', 'stageMinDays', 'observeDays', 'dailyKinds', 'dailyCategories',
  'maintainPerWeek', 'maintainPerWeekMax', 'symptomUsableDays', 'windowVarietyDays',
  'windowEatenDays', 'allergyEventDays', 'stoolWindowDays', 'coverageMin',
  'growthDropLevels', 'adherenceDays',
]
/** 扁平 staleXxxDays → 8 源键名（runtime thresholds.staleDays 形态） */
const STALE_KEY_MAP = {
  formula: 'staleFormulaDays', food: 'staleFoodDays', supplement: 'staleSupplementDays',
  medication: 'staleMedicationDays', growth: 'staleGrowthDays', symptom: 'staleSymptomDays',
  medical: 'staleMedicalDays', diary: 'staleDiaryDays',
}

const warnings = []
const warn = (msg) => {
  warnings.push(msg)
  console.warn(`[signal-config] ${msg}`)
}

function readYamlSafe(file, label) {
  try {
    const doc = yaml.load(readFileSync(file, 'utf8'))
    if (!doc || typeof doc !== 'object') {
      warn(`${label} 内容为空或非对象（${file}），使用兜底默认`)
      return null
    }
    return doc
  } catch (e) {
    warn(`${label} 读取/解析失败（${file}）：${e?.message || e}，使用兜底默认`)
    return null
  }
}

/** 从注册表提取默认值（params[].default；null 跳过；flags 默认强度） */
function extractRegistryDefaults(registry) {
  const out = {}
  if (!registry?.params || !Array.isArray(registry.params)) return out
  for (const p of registry.params) {
    if (p && p.key && p.default != null) out[p.key] = p.default
  }
  if (Array.isArray(registry?.flags)) {
    out.flags = {}
    for (const f of registry.flags) {
      if (f && f.key) out.flags[f.key] = { enabled: true, strength: f.default_strength || 'medium' }
    }
  }
  return out
}

/** flag 对象级合并（enabled/strength 逐字段） */
function mergeFlags(base, over) {
  const out = { ...(base || {}) }
  for (const [k, v] of Object.entries(over || {})) {
    if (v && typeof v === 'object') out[k] = { ...(out[k] || {}), ...v }
  }
  return out
}

/** 逐键覆盖合并：不覆盖时保留 base 值；flags 走对象级合并 */
function overlay(base, over) {
  if (!over) return { ...base }
  const out = { ...base }
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined || v === null) continue
    out[k] = k === 'flags' ? mergeFlags(base.flags, v) : v
  }
  return out
}

/** 按注册表校验 candidate；非法项回退 baseline，返回修复后的对象 */
function validateAndRepair(candidate, registry, baseline) {
  const out = { ...candidate }
  const params = Array.isArray(registry?.params) ? registry.params : []
  for (const p of params) {
    const key = p?.key
    if (!key || !(key in out)) continue
    const v = out[key]
    let ok = true
    const t = p.type
    if (t === 'int') ok = Number.isInteger(v)
    else if (t === 'float') ok = typeof v === 'number' && Number.isFinite(v)
    else if (t === 'bool') ok = typeof v === 'boolean'
    else if (t === 'list') ok = Array.isArray(v)
    else if (t === 'object') ok = v != null && typeof v === 'object' && !Array.isArray(v)
    if (ok && Array.isArray(p.range) && p.range.length === 2 && (t === 'int' || t === 'float')) {
      ok = v >= p.range[0] && v <= p.range[1]
      if (!ok) warn(`参数 ${key}=${v} 超出范围 [${p.range[0]}, ${p.range[1]}]，回退默认 ${baseline[key]}`)
    } else if (!ok) {
      warn(`参数 ${key} 类型非法（期望 ${t}，实得 ${typeof v}），回退默认`)
    }
    if (!ok) out[key] = baseline[key]
  }
  // flags：enabled / strength 校验
  const flags = mergeFlags(baseline.flags, out.flags)
  for (const [k, v] of Object.entries(flags)) {
    if (typeof v?.enabled !== 'boolean') {
      warn(`flag ${k}.enabled 非法，回退 true`)
      v.enabled = true
    }
    if (!VALID_STRENGTHS.includes(v?.strength)) {
      const fallback = baseline.flags?.[k]?.strength || 'medium'
      warn(`flag ${k}.strength=${v?.strength} 非法，回退 ${fallback}`)
      v.strength = fallback
    }
  }
  out.flags = flags
  return out
}

/** 跨项规则（量少、与平台侧保存校验同规则；不一致由测试守护） */
function crossChecks(v) {
  const fixes = []
  if (v.maintainPerWeek > v.maintainPerWeekMax) {
    fixes.push(['maintainPerWeek', `维持下限 ${v.maintainPerWeek} > 上限 ${v.maintainPerWeekMax}，下限回退默认`])
    v.maintainPerWeek = FACTORY_DEFAULTS.maintainPerWeek
  }
  if (v.stageMinDays > v.stageStableDays) {
    fixes.push(['stageMinDays', `阶内下限 ${v.stageMinDays} > 参考 ${v.stageStableDays}，下限回退默认`])
    v.stageMinDays = FACTORY_DEFAULTS.stageMinDays
  }
  for (const f of fixes) warn(f[1])
  return v
}

function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj)
    for (const v of Object.values(obj)) if (v && typeof v === 'object') deepFreeze(v)
  }
  return obj
}

/** 扁平 values → 运行时形态 */
function toRuntimeForm(v) {
  const ref = {}
  for (const k of REF_KEYS) ref[k] = v[k]
  const staleDays = {}
  for (const [srcKey, flatKey] of Object.entries(STALE_KEY_MAP)) staleDays[srcKey] = v[flatKey]
  const tupleify = (arr, nameField) =>
    Array.isArray(arr) ? arr.map((e) => (Array.isArray(e) ? e : [e?.[nameField], e?.keys || []])) : []
  return {
    ref,
    thresholds: { staleDays, weanedDays: v.weanedDays },
    throttle: { dedupDays: v.dedupDays, maxPerTurn: v.maxPerTurn, strongBypass: v.strongBypass },
    wordlists: {
      highRiskGroups: tupleify(v.highRiskGroups, 'group'),
      categoryRules: tupleify(v.categoryRules, 'category'),
      prefix: Array.isArray(v.prefix) ? [...v.prefix] : [],
      suffix: Array.isArray(v.suffix) ? [...v.suffix] : [],
      alias: new Map(Object.entries(v.alias && typeof v.alias === 'object' ? v.alias : {})),
    },
    inject: { perception: v.injectPerception !== false, flagThrottle: v.injectFlagThrottle !== false },
    flags: v.flags,
  }
}

let cached = null

/**
 * 加载信号配置（同步、进程内单例）。
 * @returns {object} 冻结的运行时配置；结构见 toRuntimeForm 与 TECH-029 §3.3。
 */
export function getSignalConfig() {
  if (cached) return cached
  const registry = readYamlSafe(registryPath(), 'registry.yaml')
  const signals = readYamlSafe(configPath(), 'signals.yaml')
  if (registry && signals && registry.schema_version !== signals.schema_version) {
    warn(`schema_version 不一致（registry=${registry.schema_version} / signals=${signals.schema_version}），按尽力解析继续`)
  }
  const registryDefaults = extractRegistryDefaults(registry)
  const baseline = overlay(FACTORY_DEFAULTS, registryDefaults) // ①② 合并（无 signals）
  const merged = overlay(baseline, signals?.values)             // ⊕ signals
  const repaired = crossChecks(validateAndRepair(merged, registry, baseline))
  const source = signals?.values ? (registry?.params ? 'signals+registry' : 'signals+factory')
    : (registry?.params ? 'registry' : 'factory')
  cached = deepFreeze({
    ...toRuntimeForm(repaired),
    meta: { source, warnings: [...warnings], at: new Date().toISOString() },
  })
  return cached
}

/** 清缓存（仅供测试/干跑进程使用；ESM 模块缓存下同进程重载受限，跨配置对比请用独立子进程） */
export function resetSignalConfigCache() {
  cached = null
  warnings.length = 0
}

/** 配置健康摘要（供 /health 类场景与断言脚本使用） */
export function signalConfigHealth() {
  const cfg = getSignalConfig()
  return { source: cfg.meta.source, warnings: cfg.meta.warnings, flags: Object.keys(cfg.flags).length }
}
