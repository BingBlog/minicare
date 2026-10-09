/**
 * 期望断言渲染（TECH-022 B3）：把 harness 的 `expect`（assert.mjs 语义）渲染成中文人话。
 *
 * 与 `agent-poc/scripts/eval/lib/assert.mjs` 的字段一一对应；未知字段以 JSON 兜底展示，不丢信息。
 * 两个消费点：运行详情的「期望 vs 实际」证据链、用例编辑器的结构化预览。
 */

function isRule(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
    && ('contains' in (v as object) || 'eq' in (v as object) || 'oneOf' in (v as object) || 'exists' in (v as object))
}

function ruleText(v: unknown): string {
  if (isRule(v)) {
    const r = v as Record<string, unknown>
    if ('contains' in r) return `包含「${String(r.contains)}」`
    if ('eq' in r) return `等于「${String(r.eq)}」`
    if ('oneOf' in r) return `∈ [${(r.oneOf as unknown[]).map(String).join(', ')}]`
    if ('exists' in r) return r.exists ? '存在（非空）' : '不存在（为空）'
  }
  return `= ${JSON.stringify(v)}`
}

/** 参数条件递归展开：input: { query: { contains: '血' } } → ['query 包含「血」'] */
function inputRuleLines(input: unknown, prefix = ''): string[] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return [`参数 ${prefix || '?'} ${ruleText(input)}`]
  }
  const obj = input as Record<string, unknown>
  const lines: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (isRule(v)) lines.push(`参数 ${path} ${ruleText(v)}`)
    else if (v && typeof v === 'object' && !Array.isArray(v)) lines.push(...inputRuleLines(v, path))
    else lines.push(`参数 ${path} ${ruleText(v)}`)
  }
  return lines
}

/** expect → 人话断言清单（有序） */
export function expectToLines(expect: Record<string, unknown> | null | undefined): string[] {
  if (!expect || typeof expect !== 'object') return []
  const e = expect
  const lines: string[] = []
  const managed = new Set([
    'noToolCalls', 'minToolCalls', 'maxToolCalls', 'toolCalls',
    'textContains', 'textNotContains', 'done', 'answerNotEmpty', 'errorFree',
  ])

  if (e.noToolCalls) lines.push('不调用任何工具')
  if (e.minToolCalls != null) lines.push(`工具调用 ≥ ${e.minToolCalls} 次`)
  if (e.maxToolCalls != null) lines.push(`工具调用 ≤ ${e.maxToolCalls} 次`)
  const tools = Array.isArray(e.toolCalls) ? (e.toolCalls as Record<string, unknown>[]) : []
  for (const tc of tools) {
    const name = String(tc.name ?? '?')
    let line = `调用 ${name}`
    const count = tc.count as { gte?: number; lte?: number } | undefined
    if (count?.gte != null) line += `（≥ ${count.gte} 次）`
    else if (count?.lte != null) line += `（≤ ${count.lte} 次）`
    lines.push(line)
    if (tc.input) for (const l of inputRuleLines(tc.input)) lines.push(`　↳ ${l}`)
    if (tc.allowUnknown) lines.push(`　↳ 允许其他工具同时出现`)
  }
  const tc = e.textContains
  if (Array.isArray(tc) && tc.length) lines.push(`回答必须包含：${tc.map((x) => `「${x}」`).join('、')}`)
  const tn = e.textNotContains
  if (Array.isArray(tn) && tn.length) lines.push(`回答不得出现：${tn.map((x) => `「${x}」`).join('、')}`)
  if (e.done) lines.push('正常收尾（未被强制中断）')
  if (e.answerNotEmpty) lines.push('回答非空')
  if (e.errorFree) lines.push('无运行错误')

  for (const [k, v] of Object.entries(e)) {
    if (managed.has(k)) continue
    lines.push(`其他：${k} = ${JSON.stringify(v)}`)
  }
  return lines
}

/** judge 配置摘要（用例编辑/详情共用）：「忠实 · 完整(2 要点) · 护栏 · 风格」 */
export function judgeSummary(judge: Record<string, unknown> | null | undefined): string {
  if (!judge) return ''
  const parts: string[] = []
  if (judge.faithfulness) parts.push('忠实')
  if (judge.completeness) {
    const pts = (judge.completeness as { goldenPoints?: unknown[] })?.goldenPoints
    parts.push(`完整${Array.isArray(pts) ? `(${pts.length} 要点)` : ''}`)
  }
  if (judge.guardrail) parts.push('护栏')
  if (judge.style) parts.push('风格')
  return parts.join(' · ')
}
