/**
 * 词表试跑器（TECH-029 §4 / PRD-014 US-05）
 *
 * 用法：node scripts/wordlist-try.mjs --foods=土豆、豆浆 [--config=<覆盖文件>] [--pretty]
 * 输出：JSON { ok, foods: [{ input, normalized, categories, highRisk: [{group, matched:[{food, by}]}] }] }
 *
 * 语义：对每个食物名跑「归一化 → 七大类归类 → 高致敏分组命中」全链路，
 * 匹配逻辑与 perception.js::computeHighRisk 同口径（keys.some(k => name.includes(k))）；
 * --config 指向临时覆盖文件（完整 signals 结构 + 修改后的 wordlists），
 * 由平台在「编辑中词表试跑」场景注入（不改仓库真源）。
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ARGS = process.argv.slice(2)
const val = (name) => {
  const hit = ARGS.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : null
}
const CONFIG_FILE = val('config')
if (CONFIG_FILE) process.env.SIGNALS_CONFIG = CONFIG_FILE // 必须在动态 import 之前
const raw = val('foods') || ''
const foods = raw
  .split(/[、,，]/)
  .map((s) => s.trim())
  .filter(Boolean)

let out
try {
  // 动态 import：确保 SIGNALS_CONFIG 已设置（静态 import 会提前求值）
  const { normalizeFoods, categoryOf } = await import('../src/lib/perception.js')
  const { getSignalConfig } = await import('../src/config-loader.js')
  const cfg = getSignalConfig()

  out = {
    ok: true,
    foods: foods.map((input) => {
      const normalized = normalizeFoods(input)
      const categories = [...new Set(normalized.map((n) => categoryOf(n)))]
      const highRisk = []
      for (const [group, keys] of cfg.wordlists.highRiskGroups) {
        const matched = []
        for (const n of normalized) {
          const by = keys.find((k) => n.includes(k))
          if (by) matched.push({ food: n, by })
        }
        if (matched.length) highRisk.push({ group, matched })
      }
      return { input, normalized, categories, highRisk }
    }),
    configSource: CONFIG_FILE ? 'override' : 'live',
  }
} catch (e) {
  out = { ok: false, error: String(e?.message || e) }
}
console.log(JSON.stringify(out, null, ARGS.includes('--pretty') ? 2 : 0))
process.exit(out.ok ? 0 : 1)
