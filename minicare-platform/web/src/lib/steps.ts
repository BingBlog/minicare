import { STEP_LABEL, STEP_ORDER } from './labels'
import { STEP_SHORT } from '../nav'
import type { DocStatus } from './types'

/**
 * 七步状态的**唯一推导口径**。
 *
 * 背景：同一份「这一步到底是什么状态」原来在三个地方各写了一遍 ——
 *   · `ui.tsx` 的 `Dots` / `StepBar` 读 `steps[s]`
 *   · `Corpus.tsx` 的 `StepStrip` 读 `steps_detail[s].status ?? steps[s]`
 *   · `Corpus.tsx` 的 "七步全绿" KPI 又是一份内联的 `DONE_STATES` 判断
 * 三处口径一旦分叉，就会出现"列表显示全绿、按钮却还在让你跑"这类自相矛盾。
 * 因此这里收口成一份，下游一律复用。
 *
 * 口径说明：`steps_detail`（读 manifest 的 `runs[current_run]`）是**逐步真值**；
 * `steps`（后端汇总出来的字典）在明细缺失时兜底。
 */

/** 视为「这一步已完成」的状态。缓存命中同样算完成 —— 与后端的 skip 语义一致。 */
export const DONE_STATES: ReadonlySet<string> = new Set(['succeeded', 'skipped_cached'])

/** 七步里第一个「未完成」的步骤（全部完成返回 null）。 */
export function nextStep(doc: Pick<DocStatus, 'steps' | 'steps_detail'>): string | null {
  for (const sid of STEP_ORDER) {
    if (!DONE_STATES.has(stepStatus(doc, sid))) return sid
  }
  return null
}

/** 单步状态：明细优先，汇总兜底，都没有则当作未执行。 */
export function stepStatus(
  doc: Pick<DocStatus, 'steps' | 'steps_detail'>,
  sid: string,
): string {
  return doc.steps_detail?.[sid]?.status ?? doc.steps[sid] ?? 'pending'
}

/** 七步是否全绿（含缓存命中）。 */
export function isDocDone(doc: Pick<DocStatus, 'steps' | 'steps_detail'>): boolean {
  return nextStep(doc) === null
}

export interface NextAction {
  /** 本次将要执行的步骤 id；null = 七步已全绿，无可执行步骤 */
  step: string | null
  /** 按钮文案：进行XX / 重试XX / 重跑XX / 七步已完成 */
  label: string
  /** 悬停说明：为什么是这一步、会做什么 */
  hint: string
  /** 是否可执行。七步全绿时为 false（当前没有 force 入口，跑一遍只会全部命中缓存） */
  enabled: boolean
}

/**
 * 由文档当前状态推导「下一步该干什么」，用于把笼统的「跑七步」换成具体动作。
 *
 * 动词随状态变：`failed` → 重试、`stale` → 重跑（上游变了要重算）、
 * 其余（`pending`）→ 进行。这样用户在列表里一眼能看出
 * "这份文档点下去会发生什么"，而不是每次都要先猜自己跑到哪了。
 *
 * ⚠️ 文案只说明**从哪一步开始**：一次执行会顺着往下连跑（已完成的直接命中缓存），
 * 直到出错为止。所以提示里必须写清楚"依次往下跑"，否则「进行预检」会被读成"只跑预检"。
 *
 * 早期这里还要处理「人工闸门」（暂停点 1 未放行时按钮不可执行）—— 闸门机制已于
 * 2026-10-09 整体移除，`nextAction` 现在只依据产物状态。
 */
export function nextAction(
  doc: Pick<DocStatus, 'steps' | 'steps_detail'>,
): NextAction {
  const sid = nextStep(doc)
  if (!sid) {
    return {
      step: null,
      label: '七步已完成',
      hint:
        '七个步骤全部为「已完成」或「缓存命中」，没有待执行的步骤。\n' +
        '当前界面只跑 dry-run 且不强制重算，再点也只会全部命中缓存；' +
        '要真实重跑请用「作废切块及下游」标脏，或用 CLI：kb-pipeline run --force',
      enabled: false,
    }
  }

  const name = STEP_SHORT[sid] || STEP_LABEL[sid] || sid
  const full = STEP_LABEL[sid] || sid
  const status = stepStatus(doc, sid)
  const tail = '已完成的步骤会直接命中缓存。'

  if (status === 'failed') {
    return {
      step: sid,
      label: `重试${name}`,
      hint: `${full} 上次执行失败，本次从这一步开始重新执行，并依次往下跑。${tail}`,
      enabled: true,
    }
  }
  if (status === 'stale') {
    return {
      step: sid,
      label: `重跑${name}`,
      hint: `${full} 的产物已过期（上游产物指纹变了），本次从这一步开始重算并依次往下跑。${tail}`,
      enabled: true,
    }
  }
  return {
    step: sid,
    label: `进行${name}`,
    hint: `${full} 尚未执行，本次从这一步开始并依次往下跑。${tail}`,
    enabled: true,
  }
}
