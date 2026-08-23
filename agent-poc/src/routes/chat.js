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
 * SSE 事件：meta / session / tool_call / tool_result / text / done / error
 */
import { randomUUID } from 'node:crypto'
import { buildImageAttachments } from '../lib/vision.js'
import { sse } from '../lib/sse.js'
import { executeSearchKnowledge } from '../lib/tools/search-knowledge.js'
import { getChatHistory, appendChatHistory } from '../lib/history.js'
import { buildAgent } from '../agent.js'

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
    const agent = buildAgent(config, history)

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
    try {
      const session = await agent.startSession({ userId, conversationId: randomUUID() })
      sse(res, 'session', { started: true, t_ms: Date.now() - t0 })

      const input = attachments.length
        ? { type: 'message', content: message, attachments }
        : message

      for await (const event of session.send(input)) {
        eventCount++
        // client/<toolName> 请求 → 宿主执行 → respondToolUse 回传
        if (event.jsonrpc && typeof event.method === 'string' && event.method.startsWith('client/')) {
          lastEventType = 'client/' + event.method.slice(7)
          const toolCallId = event._meta?.toolCallId
          sse(res, 'tool_call', { name: event.method.slice(7), input: event.params })
          const output = await executeSearchKnowledge(event.params ?? {})
          sse(res, 'tool_result', { name: event.method.slice(7), output })
          const resumeStream = session.respondToolUse({ toolUseId: toolCallId, output })
          for await (const ev2 of resumeStream) {
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
      })
    } catch (e) {
      console.error(`[chat] ERROR userId=${userId} ms=${Date.now() - t0}`, e?.stack || e)
      sse(res, 'error', { message: (e?.message || String(e)).slice(0, 500) })
    } finally {
      res.end()
    }
  }
}
