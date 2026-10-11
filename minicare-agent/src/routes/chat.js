/**
 * POST /chat — 对话（SSE，M1 tech §3 事件协议）
 *
 * body: { userId?, conversationId?, message, images?, model? }
 *  - userId 兜底取 x-agent-ctx.userId（生产由 minicare-server 注入 ctx）
 *  - conversationId 未传 → 服务端 randomUUID（UUID 严格校验，POC 踩坑 5）
 *  - images: [{ fileId, mimeType }] → 服务端拉取 → image block（lib/vision.js）
 *  - model: 可选覆盖，默认 config.modelDefault
 *
 * ⚠️ 2026-09-04 直连 SDK 改造：OAK 移除，agent 循环在 lib/runtime.js（runAgentTurn），
 *   本路由只负责 HTTP/SSE 适配 + 看门狗 + 历史回写 + 兜底话术。
 *   事件协议不变：meta / session / tool_call / tool_result / text / done / error。
 *
 * 行为对齐说明（与 OAK 版一致，详见 runtime.js 头注释）：
 *   - 准备语剔除：首个工具调用前的文本缓存丢弃，工具后的文本直发；
 *   - 工具循环防护：同一工具 ≤2 次、总次数 ≤3 次（runtime 工具包装层执行）；
 *   - 看门狗：30s 空闲 / 55s 总时长强制收尾（abort 中断 CLI 子进程）。
 */

import { randomUUID } from 'node:crypto'
import { buildImageAttachments } from '../lib/vision.js'
import { sse } from '../lib/sse.js'
import { getChatHistory, appendChatHistory } from '../lib/history.js'
import { createTraceRecorder } from '../lib/telemetry.js'
import { runAgentTurn } from '../agent.js'

export function chatRoute(config) {
  return async (req, res) => {
    if (!config.deepSeekKey) {
      res.status(503).json({ error: 'Agent not ready: DEEPSEEK_API_KEY not configured' })
      return
    }
    const ctx = req.ctx || {}
    const { userId = ctx.userId, conversationId, message, images, model } = req.body || {}
    if (!userId || !message) {
      res.status(400).json({ error: 'userId and message are required' })
      return
    }
    const cid = conversationId || randomUUID()
    if (!/^[0-9a-f-]{36}$/i.test(cid)) {
      res.status(400).json({ error: 'conversationId must be a UUID' })
      return
    }

    // 读取历史（最近 20 条）→ 注入 systemPrompt（多轮上下文方案，见 agent.js 头注释）
    const history = await getChatHistory(config.envId, config.tcbCredentials, cid)

    // 观测埋点（TECH-007）：旁路记录用户问题 / LLM 轮次 / 工具调用，失败不影响对话
    const trace = createTraceRecorder({
      envId: config.envId,
      credentials: config.tcbCredentials,
      req: {
        userId,
        conversationId: cid,
        familyId: ctx.familyId || null,
        babyId: ctx.babyId || null,
        message,
        imageCount: Array.isArray(images) ? images.length : 0,
        model: model || config.modelDefault,
        historyCount: history.length,
      },
    })

    // 图片 → Anthropic image content blocks（P0 实测：base64 block 被 vision 模型直接解读）
    let imageBlocks = []
    if (Array.isArray(images) && images.length) {
      imageBlocks = await buildImageAttachments(config.envId, config.tcbCredentials, images)
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    sse(res, 'meta', {
      conversationId: cid,
      userId,
      familyId: ctx.familyId || null,
      babyId: ctx.babyId || null,
      model: model || config.modelDefault,
      historyCount: history.length,
    })

    const t0 = Date.now()
    let eventCount = 0
    let lastEventType = 'none'
    let answer = ''

    // 看门狗（2026-08-23 引入，行为不变）：30s 无事件 / 55s 总时长 → 强制收尾。
    // SDK 流挂起时 await iter.next() 可能永不返回，仍需 nextWithTimeout 兜底；
    // forceFinish 时 abort 中断 CLI 子进程（比 OAK 时期多了真实中断手段）。
    const IDLE_TIMEOUT_MS = 30_000
    const MAX_TOTAL_MS = 55_000 // 需 < 代理层 60s 超时，确保 done 能透传
    let forceFinish = false
    let lastActivity = Date.now()
    const watchdog = setInterval(() => {
      if (forceFinish) return
      const now = Date.now()
      if (now - lastActivity > IDLE_TIMEOUT_MS) {
        forceFinish = true
        trace.markForceFinished()
        console.warn(`[chat] idle ${IDLE_TIMEOUT_MS}ms, force finish userId=${userId}`)
      } else if (now - t0 > MAX_TOTAL_MS) {
        forceFinish = true
        trace.markForceFinished()
        console.warn(`[chat] total ${MAX_TOTAL_MS}ms exceeded, force finish userId=${userId}`)
      }
    }, 3_000)
    const touch = () => {
      lastActivity = Date.now()
    }
    const stopWatchdog = () => clearInterval(watchdog)

    const nextWithTimeout = (iter) => {
      const remaining = Math.max(0, MAX_TOTAL_MS - (Date.now() - t0))
      const timeoutMs = Math.min(IDLE_TIMEOUT_MS, remaining)
      return Promise.race([
        iter.next(),
        new Promise((resolve) =>
          setTimeout(() => resolve({ done: true, timedOut: true }), timeoutMs),
        ),
      ])
    }

    const abortController = new AbortController()

    try {
      sse(res, 'session', { started: true, t_ms: Date.now() - t0 })
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

      // telemetry generation 生命周期：懒开（首个 text/tool_call）；
      // tool_call 处收口（该轮以工具调用结束），tool_result 后的文本懒开新一轮
      let turnNo = 0
      let genOpen = false
      const openGeneration = () => {
        if (genOpen) return
        genOpen = true
        trace.startGeneration(`llm-turn-${++turnNo}`)
      }
      const closeGeneration = () => {
        if (!genOpen) return
        genOpen = false
        trace.endGeneration()
      }

      const iterator = events[Symbol.asyncIterator]()
      let lastToolSpan = null // tool_call/tool_result 配对回填 telemetry
      while (!forceFinish) {
        const { value: ev, done, timedOut } = await nextWithTimeout(iterator)
        if (timedOut) {
          console.warn(`[chat] stream timeout ${IDLE_TIMEOUT_MS}ms, breaking userId=${userId}`)
          forceFinish = true
          break
        }
        if (done) break
        eventCount++
        trace.countEvent()
        touch()

        if (ev.type === 'text') {
          openGeneration()
          lastEventType = 'text'
          answer += ev.text
          trace.appendGenerationText(ev.text)
          sse(res, 'text', { delta: ev.text })
        } else if (ev.type === 'tool_call') {
          closeGeneration() // 产出自该轮的文本（若有）随工具调用收口
          lastEventType = 'tool/' + ev.name
          sse(res, 'tool_call', { name: ev.name, input: ev.input })
          lastToolSpan = trace.startTool(ev.name, ev.input ?? {})
        } else if (ev.type === 'tool_result') {
          sse(res, 'tool_result', { name: ev.name, output: ev.output })
          trace.endTool(lastToolSpan, ev.output, {
            level: ev.allowed ? 'DEFAULT' : 'WARNING',
            statusMessage: ev.allowed ? null : '工具调用次数达上限（循环防护），未执行',
          })
          lastToolSpan = null
        } else if (ev.type === 'chart') {
          // 图表块（TECH-028）：结构化块事件，前端渲染为消息内通栏图卡；
          // 旧版客户端对未知事件天然忽略，文字不受影响（向后兼容）
          sse(res, 'block', { block: ev.chart })
        } else if (ev.type === 'usage') {
          // usage 事件可能在 gen 已收口后到达 → telemetry 内部回退挂到最早未记录的 gen
          openGeneration()
          trace.recordUsage(ev.totalTokens)
          closeGeneration()
        } else if (ev.type === 'done') {
          lastEventType = 'done'
          if (ev.isError) {
            console.warn(`[chat] result is_error userId=${userId}: ${String(ev.resultText).slice(0, 200)}`)
          }
          break
        } else if (ev.type === 'error') {
          throw new Error(ev.message)
        }
      }
      stopWatchdog()
      closeGeneration()

      // 兜底 1：模型只输出了准备语且正文未产出时，给出明确反馈而非静默空白
      // 兜底 2（2026-09-03）：DeepSeek 偶发在工具回传后不再产出正文、只留下
      // "请稍候/正在查询"类等待话术（线上实测"体重发育"场景两次稳定复现）——
      // 这类"短等待话术"的 answer 非空，绕过了兜底 1，按无效回答处理。
      const isWaitingOnly =
        answer.trim().length < 60 &&
        /稍等|正在查询|正在检索|正在返回|正在整理|等数据|整理好|请稍候/.test(answer)
      if (!answer.trim() || isWaitingOnly) {
        const hint = '抱歉，回答生成中断了，请再试一次～'
        lastEventType = 'text'
        answer = hint
        sse(res, 'text', { delta: hint })
      }

      // 写回历史（仅记录最终问答，工具调用过程不入历史）
      if (answer.trim()) {
        await appendChatHistory(
          config.envId,
          config.tcbCredentials,
          { conversationId: cid, userId, familyId: ctx.familyId || null, babyId: ctx.babyId || null },
          message,
          answer.trim(),
        )
      }

      sse(res, 'done', {
        events: eventCount,
        ms: Date.now() - t0,
        model: model || config.modelDefault,
        lastEventType,
        forceFinished: forceFinish,
      })
      // 观测埋点收尾（TECH-007）
      await trace.finish({
        output: answer.trim(),
        status: forceFinish ? 'timeout' : 'completed',
      })
    } catch (e) {
      console.error(`[chat] ERROR userId=${userId} ms=${Date.now() - t0}`, e?.stack || e)
      sse(res, 'error', { message: (e?.message || String(e)).slice(0, 500) })
      await trace.finish({ status: 'error', error: e?.message || String(e) })
    } finally {
      stopWatchdog()
      abortController.abort() // 中断残留的 CLI 子进程（正常收尾时为 no-op）
      res.end()
    }
  }
}
