/**
 * POST /chat — 对话（SSE，M1 tech §3 事件协议）
 *
 * body: { userId?, conversationId?, message, images?, model? }
 *  - userId 兜底取 x-agent-ctx.userId（生产由 minicare-server 注入 ctx）
 *  - conversationId 未传 → 服务端 randomUUID（UUID 严格校验，POC 踩坑 5）
 *  - images: [{ fileId, mimeType }] → 服务端拉取 → attachment（lib/vision.js）
 *  - model: 可选覆盖，默认 config.modelDefault
 *
 * 会话恢复：OAK resume 不可用（lib/history.js 背景），改为每次请求
 *   读历史 → 注入 systemPrompt（buildAgent）→ 新 session 对话 → 写回历史。
 *
 * 工具循环防护（2026-08-23 修复）：DeepSeek 偶发"回答完成后再次调用工具"
 * 导致 SSE 流迟迟不结束——每轮限制：同一工具 ≤2 次、总次数 ≤3 次，
 * 超限后不再执行，respondToolUse 返回"已达上限，直接回答"，模型即收敛。
 *
 * SSE 事件：meta / session / tool_call / tool_result / text / done / error
 */

import { randomUUID } from 'node:crypto'
import { buildImageAttachments } from '../lib/vision.js'
import { sse } from '../lib/sse.js'
import { getToolExecutor } from '../lib/tools/index.js'
import { getChatHistory, appendChatHistory } from '../lib/history.js'
import { buildAgent } from '../agent.js'

/** 工具循环防护阈值：同一工具最多调用次数 / 单轮总工具调用次数 */
const MAX_SAME_TOOL_CALLS = 2
const MAX_TOTAL_TOOL_CALLS = 3

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

    // 读取历史（最近 20 条）→ 构建带历史的 agent（每次请求重建，避开 OAK resume bug）
    const history = await getChatHistory(config.envId, config.tcbCredentials, cid)
    const agent = buildAgent(config, history, ctx)

    // 图片 → attachments（P0 实测：file 类型 + vision-exp 模型可直接解读）
    let attachments = []
    if (Array.isArray(images) && images.length) {
      attachments = await buildImageAttachments(config.envId, config.tcbCredentials, images)
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
    // 工具循环防护计数（每轮 /chat 请求独立）
    const toolCalls = {}
    let totalToolCalls = 0
    // 空闲看门狗（2026-08-23 修复"回复结束但卡片残留工具状态"）：
    // DeepSeek 偶发在工具回传后不再输出 → OAK send 流挂起（不产出事件也不结束），
    // done 永远发不出 → 前端 status 停留 streaming。30s 无任何事件 → 强制收尾发 done。
    // 另加总时长上限：模型"回答完再调工具"循环时事件不断、idle 永不触发，
    // 90s 总时长一到同样强制收尾（事件循环每 3s 检查一次）。
    const IDLE_TIMEOUT_MS = 30_000
    const MAX_TOTAL_MS = 55_000 // 需 < 代理层 60s 超时，确保 done 能透传
    let forceFinish = false
    let lastActivity = Date.now()
    const watchdog = setInterval(() => {
      if (forceFinish) return
      const now = Date.now()
      if (now - lastActivity > IDLE_TIMEOUT_MS) {
        forceFinish = true
        console.warn(`[chat] idle ${IDLE_TIMEOUT_MS}ms, force finish userId=${userId}`)
      } else if (now - t0 > MAX_TOTAL_MS) {
        forceFinish = true
        console.warn(`[chat] total ${MAX_TOTAL_MS}ms exceeded, force finish userId=${userId}`)
      }
    }, 3_000)
    const touch = () => {
      lastActivity = Date.now()
    }
    const stopWatchdog = () => clearInterval(watchdog)

    /**
     * 带超时的 async iterator next()（2026-08-23 核心修复）：
     * OAK send 流挂起时 await iter.next() 永不返回，while(!forceFinish) 形同虚设。
     * 超时返回 { done: true, timedOut: true } 让循环退出，随后正常发 done。
     * 超时 = min(空闲 30s, 剩余总时长)：模型"回答完再调工具"循环时事件不断
     * （idle 永不触发），总时长一到仍会超时返回（watchdog 的 forceFinish 无法
     * 中断挂起的 await，只能靠 next 自身超时）。
     */
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

    /** 是否允许执行该工具（超限返回 false） */
    const allowToolCall = (name) => {
      if (totalToolCalls >= MAX_TOTAL_TOOL_CALLS) return false
      if ((toolCalls[name] || 0) >= MAX_SAME_TOOL_CALLS) return false
      return true
    }

    try {
      const session = await agent.startSession({ userId, conversationId: randomUUID() })
      sse(res, 'session', { started: true, t_ms: Date.now() - t0 })
      touch()

      const input = attachments.length
        ? { type: 'message', content: message, attachments }
        : message

      const iterator = session.send(input)[Symbol.asyncIterator]()
      while (!forceFinish) {
        const { value: event, done, timedOut } = await nextWithTimeout(iterator)
        if (timedOut) {
          console.warn(`[chat] send stream timeout ${IDLE_TIMEOUT_MS}ms, breaking userId=${userId}`)
          forceFinish = true
          break
        }
        if (done) break
        eventCount++
        touch()
        // client/<toolName> 请求 → 宿主执行 → respondToolUse 回传
        if (event.jsonrpc && typeof event.method === 'string' && event.method.startsWith('client/')) {
          lastEventType = 'client/' + event.method.slice(7)
          const toolCallId = event._meta?.toolCallId
          const toolName = event.method.slice(7)
          sse(res, 'tool_call', { name: toolName, input: event.params })

          let output
          if (!allowToolCall(toolName)) {
            // 循环防护：不再执行，让模型直接收敛回答
            output = JSON.stringify({
              ok: false,
              error: `工具 ${toolName} 调用次数已达上限，请直接基于已有信息回答用户问题，不要再调用任何工具`,
            })
          } else {
            toolCalls[toolName] = (toolCalls[toolName] || 0) + 1
            totalToolCalls++
            const exec = getToolExecutor(toolName)
            output = exec
              ? await exec(event.params ?? {}, ctx)
              : JSON.stringify({ ok: false, error: `未知工具: ${toolName}` })
          }
          sse(res, 'tool_result', { name: toolName, output })
          touch()
          const resumeStream = session.respondToolUse({ toolUseId: toolCallId, output })
          const resumeIter = resumeStream[Symbol.asyncIterator]()
          while (!forceFinish) {
            const { value: ev2, done: d2, timedOut: t2 } = await nextWithTimeout(resumeIter)
            if (t2) {
              console.warn(`[chat] resume stream timeout ${IDLE_TIMEOUT_MS}ms, breaking userId=${userId}`)
              forceFinish = true
              break
            }
            if (d2) break
            touch()
            const u2 = ev2.params?.update
            if (u2?.sessionUpdate === 'agent_message_chunk') {
              answer += u2.content.text
              sse(res, 'text', { delta: u2.content.text })
            }
          }
          continue
        }
        const u = event.params?.update
        if (u?.sessionUpdate === 'agent_message_chunk') {
          lastEventType = 'text'
          answer += u.content.text
          sse(res, 'text', { delta: u.content.text })
        }
      }
      stopWatchdog()

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
    } catch (e) {
      console.error(`[chat] ERROR userId=${userId} ms=${Date.now() - t0}`, e?.stack || e)
      sse(res, 'error', { message: (e?.message || String(e)).slice(0, 500) })
    } finally {
      stopWatchdog()
      res.end()
    }
  }
}
