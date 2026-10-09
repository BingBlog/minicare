/**
 * 裁判试跑（rejudge.mjs）—— 用当前裁判配置对「历史回答」重新判分（TECH-022 B6）。
 *
 * 与 eval-agent.mjs 的关系：复用同一 `lib/judge.mjs` 判分器与同一分发逻辑（runJudge 等价），
 * 但**不跑被测 agent、不写台账**——输入是既有的回答与工具轨迹，输出仅判分结果。
 * 用途：改完裁判 prompt 后，对历史用例的回答立即验证判分行为（校准闭环的最小入口）。
 *
 * 用法：
 *   node scripts/eval/rejudge.mjs --case-file=<json> --fixture-file=<json> \
 *     [--judges-file=<json>] --out=<json>
 *
 *   case-file：单条用例（harness 结构，含 id/message/expect/judge）
 *   fixture ：{ answer: string, toolCalls: [{name, input, output}] }（来自台账历史结果）
 *   judges  ：{ key: {prompt, model, temperature} }（平台物化产物；缺省用内置模板）
 */
import { loadLocalEnv } from '../../src/lib/env.js'

loadLocalEnv()
import fs from 'node:fs'
import {
  judgeFaithfulness,
  judgeCompleteness,
  judgeGuardrail,
  judgeStyle,
} from './lib/judge.mjs'

function parseArgs() {
  const opt = { caseFile: null, fixtureFile: null, judgesFile: null, out: null }
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--case-file=')) opt.caseFile = a.slice('--case-file='.length)
    else if (a.startsWith('--fixture-file=')) opt.fixtureFile = a.slice('--fixture-file='.length)
    else if (a.startsWith('--judges-file=')) opt.judgesFile = a.slice('--judges-file='.length)
    else if (a.startsWith('--out=')) opt.out = a.slice('--out='.length)
  }
  return opt
}

/** 与 eval-agent.mjs collectToolOutputs 同构（faithfulness 判分溯源用）。 */
function collectToolOutputs(toolCalls = []) {
  return toolCalls
    .map((c) => `[工具 ${c.name} input=${JSON.stringify(c.input)}]\n${c.output ?? ''}`)
    .join('\n\n')
}

const opt = parseArgs()
if (!opt.caseFile || !opt.fixtureFile || !opt.out) {
  console.error('缺少参数：--case-file / --fixture-file / --out 必填')
  process.exit(2)
}

const c = JSON.parse(fs.readFileSync(opt.caseFile, 'utf8'))
const fixture = JSON.parse(fs.readFileSync(opt.fixtureFile, 'utf8'))
let judges = null
if (opt.judgesFile) {
  try {
    judges = JSON.parse(fs.readFileSync(opt.judgesFile, 'utf8'))
  } catch {
    judges = null
  }
}

const j = c.judge || {}
const answer = fixture.answer || ''

// 分发逻辑与 eval-agent.mjs runJudge 保持一致：只为用例配置了的维度判分
const out = {}
if (j.faithfulness) {
  out.faithfulness = await judgeFaithfulness({
    answer, toolOutputs: collectToolOutputs(fixture.toolCalls), cfg: judges?.faithfulness,
  })
}
if (j.completeness) {
  out.completeness = await judgeCompleteness({
    answer, goldenPoints: j.completeness.goldenPoints, cfg: judges?.completeness,
  })
}
if (j.guardrail) {
  out.guardrail = await judgeGuardrail({ answer, cfg: judges?.guardrail })
}
if (j.style) {
  out.style = await judgeStyle({
    answer, needsDisclaimer: j.style.needsDisclaimer, cfg: judges?.style,
  })
}

fs.writeFileSync(opt.out, JSON.stringify(out, null, 2))
console.log(JSON.stringify(out))
