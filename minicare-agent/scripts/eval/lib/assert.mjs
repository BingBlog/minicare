/**
 * 确定性断言（eval/lib/assert.mjs）
 *
 * 对 runTurn() 的结果做确定性校验（工具名/参数/次数/关键词/done）。
 * 主观指标（忠实/完整/护栏/风格）走 judge.mjs 的 LLM-as-judge。
 *
 * 每个校验项返回 { pass, reason }。
 */

function matchValue(actual, rule, path) {
  if (rule && typeof rule === 'object' && !Array.isArray(rule)) {
    if ('contains' in rule) {
      return String(actual).includes(rule.contains)
        ? { pass: true }
        : { pass: false, reason: `${path} 期望包含 "${rule.contains}"，实际为 "${String(actual).slice(0, 60)}"` }
    }
    if ('eq' in rule) {
      return String(actual) === String(rule.eq)
        ? { pass: true }
        : { pass: false, reason: `${path} 期望等于 "${rule.eq}"，实际为 "${String(actual).slice(0, 60)}"` }
    }
    if ('oneOf' in rule) {
      return rule.oneOf.includes(actual)
        ? { pass: true }
        : { pass: false, reason: `${path} 期望 ∈ [${rule.oneOf.join(',')}]，实际为 "${String(actual).slice(0, 60)}"` }
    }
    if ('exists' in rule) {
      const ok = rule.exists ? actual != null && actual !== '' : actual == null || actual === ''
      return ok ? { pass: true } : { pass: false, reason: `${path} exists=${rule.exists} 不满足（实际="${String(actual).slice(0, 60)}"）` }
    }
  }
  // 普通值：直接相等
  return String(actual) === String(rule)
    ? { pass: true }
    : { pass: false, reason: `${path} 期望 "${rule}"，实际为 "${String(actual).slice(0, 60)}"` }
}

function matchInput(input, rule) {
  for (const [k, v] of Object.entries(rule || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && !('contains' in v) && !('eq' in v) && !('oneOf' in v) && !('exists' in v)) {
      const sub = matchInput(input?.[k], v)
      if (!sub.pass) return sub
    } else {
      const m = matchValue(input?.[k], v, `参数 ${k}`)
      if (!m.pass) return m
    }
  }
  return { pass: true }
}

/**
 * 执行 expect 断言
 * @param {object} result  runTurn() 结果
 * @param {object} expect  用例的 expect 字段
 */
export function runExpect(result, expect = {}) {
  const failures = []
  const add = (check) => { if (!check.pass) failures.push(check.reason) }

  // ---- 工具调用断言 ----
  const calls = result.toolCalls || []
  if (expect.noToolCalls) {
    if (calls.length > 0) {
      failures.push(`期望不调用任何工具，实际调用了 ${calls.map((c) => c.name).join(',')}`)
    }
  }
  if (expect.minToolCalls != null && calls.length < expect.minToolCalls) {
    failures.push(`期望工具调用 ≥ ${expect.minToolCalls} 次，实际 ${calls.length} 次`)
  }
  if (expect.maxToolCalls != null && calls.length > expect.maxToolCalls) {
    failures.push(`期望工具调用 ≤ ${expect.maxToolCalls} 次，实际 ${calls.length} 次`)
  }
  for (const tc of expect.toolCalls || []) {
    const matches = calls.filter((c) => c.name === tc.name)
    const minRequired = tc.count?.gte ?? 1
    if (matches.length === 0) {
      if (minRequired > 0) failures.push(`期望调用工具 ${tc.name}，实际未调用`)
      continue
    }
    if (tc.count) {
      if (tc.count.gte != null && matches.length < tc.count.gte) {
        failures.push(`期望 ${tc.name} 调用 ≥ ${tc.count.gte} 次，实际 ${matches.length} 次`)
      }
      if (tc.count.lte != null && matches.length > tc.count.lte) {
        failures.push(`期望 ${tc.name} 调用 ≤ ${tc.count.lte} 次，实际 ${matches.length} 次`)
      }
    }
    if (tc.input) {
      const m = matchInput(matches[0].input, tc.input)
      if (!m.pass) failures.push(`[${tc.name}] ${m.reason}`)
    }
    if (tc.allowUnknown == null) {
      const known = new Set((expect.toolCalls || []).map((t) => t.name))
      const unexpected = calls.filter((c) => !known.has(c.name))
      if (unexpected.length > 0) {
        failures.push(`出现了未预期工具调用: ${[...new Set(unexpected.map((c) => c.name))].join(',')}`)
      }
    }
  }

  // ---- 文本断言 ----
  const answer = result.answer || ''
  for (const kw of expect.textContains || []) {
    if (!answer.includes(kw)) failures.push(`回答缺少关键信息 "${kw}"`)
  }
  for (const kw of expect.textNotContains || []) {
    if (answer.includes(kw)) failures.push(`回答包含禁用话术 "${kw}"`)
  }

  // ---- 完成性断言 ----
  if (expect.done && !result.done) {
    failures.push(`期望正常收尾（done），实际 forceFinished=${result.forceFinished}`)
  }
  if (expect.answerNotEmpty && !answer.trim()) {
    failures.push('期望有非空回答')
  }
  if (expect.errorFree && result.error) {
    failures.push(`期望无运行错误，实际: ${result.error}`)
  }

  return { pass: failures.length === 0, reasons: failures }
}
