#!/usr/bin/env node
/**
 * impact-scan — minicare 业务域影响面扫描器
 *
 * 用途：改动任何功能前，先扫描该功能域的消费点，避免"改完用户测试才发现
 *       别的页面/展示层没同步"（如 health 拆页漏掉时间线/列表展示）。
 *
 * 用法：
 *   node impact-scan.mjs <关键词...> [--web] [--ignore 子串]
 *   例：node impact-scan.mjs health temperature allergy
 *       node impact-scan.mjs skin_care
 *       node impact-scan.mjs sleep --ignore index.scss
 *
 * 默认扫描 minicare-mp/src + minicare-server/src（小程序主平台 + 后端）；
 * 传 --web 额外扫描 minicare-web/src（维护模式，默认不扫）。
 * 排除 node_modules / dist / .codegraph / *.map。
 *
 * 输出按业务层分组：MP 入口层 / MP 表单页 / MP 组件 / MP API / MP 展示层 /
 * MP 常量工具 / MP 样式资源 / 后端 / 文档。匹配为大小写不敏感子串，
 * 可能含误报（如 health 匹配 HealthRecord），需人工确认。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const keywords = args.filter((a) => !a.startsWith('--'))
const opts = {
  web: args.includes('--web'),
  ignore: '',
}
const i = args.indexOf('--ignore')
if (i !== -1 && args[i + 1]) opts.ignore = args[i + 1]

if (keywords.length === 0) {
  console.error('用法: node impact-scan.mjs <关键词...> [--web] [--ignore 子串]')
  process.exit(1)
}

const SCAN_ROOTS = [
  { label: 'MP 源码', root: 'minicare-mp/src' },
  { label: '后端源码', root: 'minicare-server/src' },
]
if (opts.web) SCAN_ROOTS.push({ label: 'Web 源码(维护)', root: 'minicare-web/src' })
SCAN_ROOTS.push({ label: '文档', root: 'docs' })

const LAYER_RULES = [
  { layer: 'MP 入口层', re: /minicare-mp\/src\/pages\/(home|login|onboarding)/ },
  { layer: 'MP 表单页', re: /minicare-mp\/src\/pages\/records\/[^/]+\/index\.(tsx|scss|config)/ },
  { layer: 'MP 组件', re: /minicare-mp\/src\/(components|pages\/records\/[^/]+\/[A-Z])/ },
  { layer: 'MP API 层', re: /minicare-mp\/src\/api/ },
  { layer: 'MP 展示层', re: /minicare-mp\/src\/pages\/(records\/list|pagesReport|dashboard)/ },
  { layer: 'MP 页面层', re: /minicare-mp\/src\/pages/ },
  { layer: 'MP 常量工具', re: /minicare-mp\/src\/lib/ },
  { layer: 'MP 样式资源', re: /minicare-mp\/src\/(styles|assets)/ },
  { layer: '后端', re: /minicare-server\/src/ },
  { layer: 'Web(维护)', re: /minicare-web\/src/ },
  { layer: '文档', re: /^docs\// },
]

function classify(relPath) {
  for (const rule of LAYER_RULES) {
    if (rule.re.test(relPath)) return rule.layer
  }
  return '其他'
}

const EXCLUDE_DIRS = new Set(['node_modules', 'dist', '.codegraph', '.git', 'build', 'output'])
const EXCLUDE_EXT = new Set(['.map', '.png', '.jpg', '.svg', '.json'])

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    if (EXCLUDE_DIRS.has(name)) continue
    const full = join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) walk(full, out)
    else if (stat.size > 512 * 1024) continue
    else if (!EXCLUDE_EXT.has(ext(name))) out.push(full)
  }
  return out
}

function ext(name) {
  const idx = name.lastIndexOf('.')
  return idx === -1 ? '' : name.slice(idx)
}

const lowerKws = keywords.map((k) => k.toLowerCase())
function matches(line) {
  const l = line.toLowerCase()
  return lowerKws.some((k) => l.includes(k))
}

const groups = new Map() // layer -> Map<relPath, number[]>
const allFiles = []
for (const { label, root } of SCAN_ROOTS) {
  const dir = join(ROOT, root)
  for (const file of walk(dir)) {
    const rel = relative(ROOT, file)
    if (opts.ignore && rel.includes(opts.ignore)) continue
    const content = readFileSync(file, 'utf8')
    const lines = content.split('\n')
    const hits = []
    lines.forEach((line, idx) => {
      if (matches(line)) hits.push(idx + 1)
    })
    if (hits.length > 0) {
      allFiles.push(rel)
      const layer = classify(rel)
      if (!groups.has(layer)) groups.set(layer, new Map())
      groups.get(layer).set(rel, hits)
    }
  }
}

console.log(`\nimpact-scan: 关键词 [${keywords.join(', ')}]  匹配 ${allFiles.length} 个文件\n`)
for (const [layer, files] of groups) {
  console.log(`── ${layer}（${files.size} 个文件）`)
  for (const [rel, hits] of files) {
    console.log(`  ${rel}`)
    const shown = hits.slice(0, 8)
    for (const lineNo of shown) {
      const content = readFileSync(join(ROOT, rel), 'utf8').split('\n')[lineNo - 1]
      console.log(`    ${lineNo}: ${content.trim().slice(0, 120)}`)
    }
    if (hits.length > 8) console.log(`    ... 共 ${hits.length} 处`)
  }
  console.log('')
}

console.log(`共 ${allFiles.length} 个文件命中。误报排查提示：大小写不敏感匹配（health 会命中 HealthRecord 等类型名）。`)
