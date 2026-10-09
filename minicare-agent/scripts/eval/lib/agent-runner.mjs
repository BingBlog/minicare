/**
 * 评测用 Agent 驱动（eval/lib/agent-runner.mjs，2026-09-04 直连 SDK 改造）
 *
 * 不依赖 HTTP / SSE / FlexDB 历史——评测直接驱动 runAgentTurn（lib/runtime.js），
 * 会话历史由调用方以内存数组传入（避免 TCB 临时凭证过期干扰评测）。
 * 归一化事件消费逻辑与 routes/chat.js 同源（runtime 已收敛，不再复刻 OAK 循环）。
 *
 * 返回结构化结果供断言使用：
 *   {
 *     answer,           // 最终回答全文
 *     toolCalls: [{name, input, output, ms, allowed}],  // 全部工具调用记录
 *     done,             // 是否收到正常收尾（未 forceFinish）
 *     forceFinished,    // 是否被看门狗强制收尾
 *     error,            // 运行时错误（若有）
 *     t0, tDone,        // 开始/结束时间戳
 *     ms,               // 总耗时
 *     eventCount,       // 事件总数
 *   }
 */
import { randomUUID } from 'node:crypto'
import { runAgentTurn } from '../../../src/agent.js'
import { createTraceRecorder } from '../../../src/lib/telemetry.js'
import { buildImageAttachments } from '../../../src/lib/vision.js'

// 看门狗上限（默认与 chat.js/生产一致：55s 总时长 < 代理层 60s 超时）。
// 评测场景可注入 EVAL_MAX_TOTAL_MS / EVAL_IDLE_TIMEOUT_MS 解耦代理超时约束，
// 测量 agent 真实能力上限（多工具+知识库组合在 55s 内跑不完 ≠ 能力不行）。
const IDLE_TIMEOUT_MS = Number(process.env.EVAL_IDLE_TIMEOUT_MS) || 30_000
const MAX_TOTAL_MS = Number(process.env.EVAL_MAX_TOTAL_MS) || 55_000

/**
 * 执行一轮对话
 * @param {object} opts
 * @param {object} opts.config   loadConfig() 返回值
 * @param {string} opts.message  用户消息
 * @param {Array}  [opts.history] 内存会话历史 [{role,content}]
 * @param {object} [opts.ctx]    {userId,familyId,babyId}
 * @param {Array}  [opts.images] [{fileId,mimeType}]
 * @param {string} [opts.model]  模型覆盖
 * @param {boolean} [opts.trace] 开启观测埋点（TECH-007）：旁路写 FlexDB agent_traces，
 *                               供 langfuse-import.mjs 导入本地 Langfuse；默认关闭
 */
export async function runTurn({ config, message, history = [], ctx = {}, images, model, trace = false }) {
  const t0 = Date.now()
  const result = {
    answer: '',
    toolCalls: [],
    done: false,
    forceFinished: false,
    error: null,
    t0,
    tDone: null,
    ms: null,
    eventCount: 0,
    traceId: null,
  }

  if (!config.deepSeekKey) {
    result.error = 'DEEPSEEK_API_KEY 未配置'
    return result
  }

  // 观测埋点（与 chat.js 同款 API；旁路失败不影响评测）。
  // ⚠️ 直连 SDK 后 usage 由 result 消息汇总（每轮一条），轮次归因比 OAK 时期准确。
  const recorder = trace
    ? createTraceRecorder({
        envId: config.envId,
        credentials: config.tcbCredentials,
        req: {
          userId: ctx.userId || 'eval-runner',
          conversationId: randomUUID(),
          familyId: ctx.familyId || null,
          babyId: ctx.babyId || null,
          message,
          imageCount: Array.isArray(images) ? images.length : 0,
          model: model || config.modelDefault,
          historyCount: history.length,
        },
      })
    : null
  result.traceId = recorder?.traceId ?? null

  let imageBlocks = []
  if (Array.isArray(images) && images.length) {
    try {
      imageBlocks = await buildImageAttachments(config.envId, config.tcbCredentials, images)
    } catch (e) {
      result.error = `图片附件构建失败: ${e?.message || e}`
      return result
    }
  }

  // 看门狗（与 chat.js 一致）
  let forceFinish = false
  let lastActivity = Date.now()
  const watchdog = setInterval(() => {
    if (forceFinish) return
    const now = Date.now()
    if (now - lastActivity > IDLE_TIMEOUT_MS) forceFinish = true
    else if (now - t0 > MAX_TOTAL_MS) forceFinish = true
  }, 3_000)
  const touch = () => { lastActivity = Date.now() }
  const stopWatchdog = () => clearInterval(watchdog)

  const nextWithTimeout = (iter) => {
    const remaining = Math.max(0, MAX_TOTAL_MS - (Date.now() - t0))
    const timeoutMs = Math.min(IDLE_TIMEOUT_MS, remaining)
    return Promise.race([
      iter.next(),
      new Promise((resolve) => setTimeout(() => resolve({ done: true, timedOut: true }), timeoutMs)),
    ])
  }

  const abortController = new AbortController()

  // telemetry generation 生命周期（对齐 chat.js）：懒开 / tool_call 收口
  let turnNo = 0
  let genOpen = false
  const openGeneration = () => {
    if (genOpen || !recorder) return
    genOpen = true
    recorder.startGeneration(`llm-turn-${++turnNo}`)
  }
  const closeGeneration = () => {
    if (!genOpen || !recorder) return
    genOpen = false
    recorder.endGeneration()
  }

  try {
    touch()
    const events = runAgentTurn({
      config,
      message,
      history,
      ctx,
      images: imageBlocks,
      model: model || config.modelDefault,
      abortController,
    })

    const iterator = events[Symbol.asyncIterator]()
    let lastToolSpan = null
    let lastToolStart = null
    while (!forceFinish) {
      const { value: ev, done, timedOut } = await nextWithTimeout(iterator)
      if (timedOut) { forceFinish = true; break }
      if (done) break
      result.eventCount++
      recorder?.countEvent()
      touch()

      if (ev.type === 'text') {
        openGeneration()
        result.answer += ev.text
        recorder?.appendGenerationText(ev.text)
      } else if (ev.type === 'tool_call') {
        closeGeneration()
        lastToolSpan = recorder?.startTool(ev.name, ev.input ?? {}) ?? null
        lastToolStart = Date.now()
        result.toolCalls.push({
          name: ev.name,
          input: ev.input ?? {},
          output: null,
          ms: null,
          allowed: ev.allowed,
        })
      } else if (ev.type === 'tool_result') {
        const rec = result.toolCalls[result.toolCalls.length - 1]
        if (rec && rec.name === ev.name && rec.output === null) {
          rec.output = ev.output
          rec.ms = lastToolStart ? Date.now() - lastToolStart : null
        }
        recorder?.endTool(lastToolSpan, ev.output, {
          level: ev.allowed ? 'DEFAULT' : 'WARNING',
          statusMessage: ev.allowed ? null : '工具调用次数达上限（循环防护），未执行',
        })
        lastToolSpan = null
      } else if (ev.type === 'usage') {
        openGeneration()
        recorder?.recordUsage(ev.totalTokens)
        closeGeneration()
      } else if (ev.type === 'done') {
        if (ev.isError) {
          console.warn(`[eval-runner] result is_error: ${String(ev.resultText).slice(0, 200)}`)
        }
        break
      } else if (ev.type === 'error') {
        result.error = ev.message
        break
      }
    }
    stopWatchdog()
    closeGeneration()

    // 等待话术兜底（对齐 chat.js 2026-09-03 修复）：模型偶发只留"请稍候"类
    // 短话术无正文，按无效回答处理，评测与线上行为一致
    if (
      result.answer.trim().length < 60 &&
      /稍等|正在查询|正在检索|正在返回|正在整理|等数据|整理好|请稍候/.test(result.answer)
    ) {
      result.answer = '抱歉，回答生成中断了，请再试一次～'
    }
    result.done = !forceFinish
    result.forceFinished = forceFinish
  } catch (e) {
    result.error = e?.message || String(e)
  } finally {
    stopWatchdog()
    abortController.abort()
    result.tDone = Date.now()
    result.ms = result.tDone - t0
    if (recorder) {
      if (forceFinish) recorder.markForceFinished()
      await recorder.finish({
        output: result.answer || null,
        status: forceFinish ? 'timeout' : result.error ? 'error' : 'completed',
        error: result.error || null,
      }).catch(() => {})
    }
  }
  return result
}
