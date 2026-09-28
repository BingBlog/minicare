/**
 * 敏宝助手（minicare-agent）API 层
 *
 * - chatStream：POST /api/agent/chat（SSE 流式，enableChunked + onChunkReceived 手写解析，
 *   完整响应降级走同一解析器；事件协议见 TECH-006 §2.2.2）
 * - agentDiaryApi：日记 REST（/api/agent/diary/*，JWT + FamilyMemberGuard + baby 归属由后端校验）
 */
import Taro from '@tarojs/taro'
import { request, getToken } from './http'
import { API_BASE_URL } from './base'

// ── SSE 事件类型（对齐 agent-poc/routes/chat.js）──────────────────────

export interface AgentSourceItem {
  id: string
  kbId: string
  title: string
  category: string
  source: string
  score?: number
}

export type AgentSSEEvent =
  | { event: 'meta'; data: { conversationId: string; familyId: string | null; babyId: string | null; model: string; historyCount: number } }
  | { event: 'session'; data: { started: boolean; t_ms: number } }
  | { event: 'tool_call'; data: { name: string; input: Record<string, unknown> } }
  | { event: 'tool_result'; data: { name: string; output: string } }
  | { event: 'text'; data: { delta: string } }
  | { event: 'sources'; data: { sources: AgentSourceItem[] } }
  | { event: 'done'; data: { events: number; ms: number; model: string } }
  | { event: 'error'; data: { message: string } }

export interface ChatImageInput {
  fileId: string
  mimeType?: string
}

export interface ChatStreamOptions {
  familyId: string
  babyId: string
  message: string
  conversationId?: string
  images?: ChatImageInput[]
  onEvent: (ev: AgentSSEEvent) => void
}

export interface ChatStreamResult {
  conversationId: string
  aborted?: boolean
}

/** 可中断句柄：abort() 停止生成，promise 在 done/error/abort 时 resolve */
export interface ChatStreamHandle {
  promise: Promise<ChatStreamResult>
  abort: () => void
}

// ── SSE 块解析（event: X\ndata: {...}\n\n，容忍 \r\n 与 chunk 乱切）────

function parseSseBlock(block: string): { event: string; data: unknown } | null {
  const lines = block.split('\n')
  let eventName = 'message'
  const dataLines: string[] = []
  for (const line of lines) {
    const trimmed = line.replace(/\r$/, '')
    if (trimmed.startsWith('event:')) {
      eventName = trimmed.slice(6).trim()
    } else if (trimmed.startsWith('data:')) {
      dataLines.push(trimmed.slice(5).trim())
    }
  }
  if (dataLines.length === 0) return null
  try {
    return { event: eventName, data: JSON.parse(dataLines.join('\n')) }
  } catch {
    return null
  }
}

/** ArrayBuffer → UTF-8 字符串（小程序无 TextDecoder，用 escape/decodeURIComponent 方案） */
function arrayBufferToStr(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  const CHUNK = 8192
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[])
  }
  try {
    return decodeURIComponent(escape(binary))
  } catch {
    return binary
  }
}

/**
 * SSE 流式对话（POST /api/agent/chat）—— 按平台分流
 *
 * - weapp：无 EventSource，enableChunked + requestTask.onChunkReceived 增量解析；
 *   降级：onChunkReceived 不可用/未触发时，success 的完整响应走同一解析器；
 * - h5：Taro H5 request 对 SSE 纯文本默认按 JSON 解析，失败后 res.data = null
 *   （2026-09-03 H5 兼容性测试发现"回复为空"的根因），且 XHR 无 onChunkReceived，
 *   改用原生 fetch + ReadableStream 增量解析；
 * - promise 在 done/error/连接结束/abort 时 resolve；网络/HTTP 错误 reject。
 */
export function chatStream(opts: ChatStreamOptions): ChatStreamHandle {
  if (process.env.TARO_ENV === 'h5') {
    return chatStreamViaFetch(opts)
  }
  return chatStreamViaTaroRequest(opts)
}

/** weapp 路径：Taro.request（enableChunked + onChunkReceived，success 降级） */
function chatStreamViaTaroRequest(opts: ChatStreamOptions): ChatStreamHandle {
  let task: Taro.RequestTask<any> | null = null
  let aborted = false

  const promise = new Promise<ChatStreamResult>((resolve, reject) => {
    const token = getToken()
    let buffer = ''
    let conversationId = ''
    let settled = false

    const settle = (result: ChatStreamResult) => {
      if (settled) return
      settled = true
      clearInterval(idleTimer)
      resolve(result)
    }

    // 空闲兜底（2026-08-23 修复"回复结束但卡片残留工具状态"）：
    // agent 端看门狗 30s 强制收尾；此处再兜两层——
    // ① 45s 无任何 SSE 事件且已收到过内容时主动 settle；
    // ② 总时长 100s 强制 settle（模型"回答完再调工具"循环时事件不断，idle 永不触发）。
    let lastEventAt = Date.now()
    const startedAt = Date.now()
    const IDLE_FALLBACK_MS = 45_000
    const MAX_TOTAL_MS = 100_000
    const idleTimer = setInterval(() => {
      if (settled) return
      const now = Date.now()
      if (now - lastEventAt > IDLE_FALLBACK_MS || now - startedAt > MAX_TOTAL_MS) {
        console.warn(`[agent] chatStream force settle (idle=${now - lastEventAt}ms, total=${now - startedAt}ms)`)
        settle({ conversationId, aborted })
      }
    }, 5_000)

    /** 消费累积 buffer 中的完整 SSE 块 */
    const drain = () => {
      for (;;) {
        const sep = buffer.indexOf('\n\n')
        if (sep < 0) break
        const block = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        if (!block.trim()) continue
        const parsed = parseSseBlock(block)
        if (!parsed) continue
        lastEventAt = Date.now()
        if (parsed.event === 'meta') {
          conversationId = (parsed.data as { conversationId?: string }).conversationId || conversationId
        }
        opts.onEvent(parsed as AgentSSEEvent)
        if (parsed.event === 'done' || parsed.event === 'error') {
          settle({ conversationId, aborted })
          return
        }
      }
    }

    task = Taro.request({
      url: `${API_BASE_URL}/api/agent/chat`,
      method: 'POST',
      data: {
        family_id: opts.familyId,
        baby_id: opts.babyId,
        ...(opts.conversationId ? { conversation_id: opts.conversationId } : {}),
        message: opts.message,
        ...(opts.images?.length ? { images: opts.images } : {}),
      },
      header: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      enableChunked: true,
      timeout: 60000,
      success: (res) => {
        // 已通过 chunk 流解析完成（含 done/error）→ 忽略完整响应
        if (settled) return
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // 降级路径：完整 SSE 文本一次解析（模拟器/低版本基础库）
          const raw = typeof res.data === 'string' ? res.data : JSON.stringify(res.data ?? '')
          buffer += raw
          drain()
          if (!settled) settle({ conversationId, aborted })
        } else {
          const msg =
            (res.data as { message?: string })?.message ||
            (res.data as { error?: string })?.error ||
            `HTTP ${res.statusCode}`
          if (!settled) reject(new Error(msg))
        }
      },
      fail: (err) => {
        const errMsg = err?.errMsg ?? ''
        if (errMsg.includes('abort')) {
          aborted = true
          settle({ conversationId, aborted: true })
          return
        }
        if (!settled) {
          reject(new Error(errMsg.includes('timeout') ? `请求超时（>60s）：${errMsg}` : `网络请求失败：${errMsg}`))
        }
      },
    })

    // 增量 chunk 解析（基础库 2.20.1+ / 开发者工具支持）
    const taskWithChunk = task as Taro.RequestTask<any> & {
      onChunkReceived?: (cb: (res: { data: ArrayBuffer }) => void) => void
    }
    if (typeof taskWithChunk.onChunkReceived === 'function') {
      taskWithChunk.onChunkReceived((res) => {
        buffer += arrayBufferToStr(res.data)
        drain()
      })
    }
  })

  return {
    promise,
    abort: () => {
      try {
        task?.abort()
      } catch {
        /* task 已结束 */
      }
    },
  }
}

/**
 * h5 路径：原生 fetch + ReadableStream 流式解析 SSE
 *
 * 与 weapp 路径语义对齐：
 * - 同一套 parseSseBlock 解析、同一套空闲兜底（45s idle / 100s 总时长）；
 * - abort() 通过 AbortController 中断，promise 以 { aborted: true } resolve；
 * - HTTP 非 2xx 时尝试读 JSON 错误信息并 reject；
 * - 极老浏览器无 ReadableStream 时退化为 response.text() 一次性解析。
 */
function chatStreamViaFetch(opts: ChatStreamOptions): ChatStreamHandle {
  let controller: AbortController | null = new AbortController()
  let aborted = false

  const promise = new Promise<ChatStreamResult>((resolve, reject) => {
    const token = getToken()
    let buffer = ''
    let conversationId = ''
    let settled = false

    const settle = (result: ChatStreamResult) => {
      if (settled) return
      settled = true
      clearInterval(idleTimer)
      resolve(result)
    }

    // 空闲兜底（与 weapp 路径一致）：45s 无事件或总时长 100s 强制收尾，并中断底层连接
    let lastEventAt = Date.now()
    const startedAt = Date.now()
    const IDLE_FALLBACK_MS = 45_000
    const MAX_TOTAL_MS = 100_000
    const idleTimer = setInterval(() => {
      if (settled) return
      const now = Date.now()
      if (now - lastEventAt > IDLE_FALLBACK_MS || now - startedAt > MAX_TOTAL_MS) {
        console.warn(`[agent] chatStream(h5) force settle (idle=${now - lastEventAt}ms, total=${now - startedAt}ms)`)
        try {
          controller?.abort()
        } catch {
          /* 已结束 */
        }
        settle({ conversationId, aborted })
      }
    }, 5_000)

    /** 消费累积 buffer 中的完整 SSE 块（与 weapp 路径同一解析器） */
    const drain = () => {
      for (;;) {
        const sep = buffer.indexOf('\n\n')
        if (sep < 0) break
        const block = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        if (!block.trim()) continue
        const parsed = parseSseBlock(block)
        if (!parsed) continue
        lastEventAt = Date.now()
        if (parsed.event === 'meta') {
          conversationId = (parsed.data as { conversationId?: string }).conversationId || conversationId
        }
        opts.onEvent(parsed as AgentSSEEvent)
        if (parsed.event === 'done' || parsed.event === 'error') {
          settle({ conversationId, aborted })
          return
        }
      }
    }

    fetch(`${API_BASE_URL}/api/agent/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        family_id: opts.familyId,
        baby_id: opts.babyId,
        ...(opts.conversationId ? { conversation_id: opts.conversationId } : {}),
        message: opts.message,
        ...(opts.images?.length ? { images: opts.images } : {}),
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          let msg = `HTTP ${response.status}`
          try {
            const data = await response.json()
            msg = (data as { message?: string })?.message || (data as { error?: string })?.error || msg
          } catch {
            /* 非 JSON 错误体，用状态码信息 */
          }
          throw new Error(msg)
        }
        const body = response.body
        if (body && typeof body.getReader === 'function') {
          const reader = body.getReader()
          const decoder = new TextDecoder('utf-8')
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            drain()
          }
          buffer += decoder.decode()
          drain()
        } else {
          // 无 ReadableStream：整包读取后一次性解析（无流式效果但内容正确）
          buffer += await response.text()
          drain()
        }
        if (!settled) settle({ conversationId, aborted })
      })
      .catch((err) => {
        if (settled) return
        if (aborted || (err && err.name === 'AbortError')) {
          aborted = true
          settle({ conversationId, aborted: true })
          return
        }
        reject(new Error(err?.message ? `网络请求失败：${err.message}` : '网络请求失败'))
      })
  })

  return {
    promise,
    abort: () => {
      aborted = true
      try {
        controller?.abort()
      } catch {
        /* 已结束 */
      }
      controller = null
    },
  }
}

// ── 日记 REST ────────────────────────────────────────────────────────

export interface DiaryItem {
  id: string
  baby_id: string
  diary_date: string
  excerpt: string
  first_photo: string | null
  photo_count: number
  created_at?: string
  updated_at?: string
}

export interface DiaryDetail {
  id: string
  baby_id: string
  family_id: string
  diary_date: string
  author_id: string
  content: string
  photo_ids: string[]
  created_at?: string
  updated_at?: string
}

export const agentDiaryApi = {
  /** 保存/覆盖当天日记（每天一篇 upsert，覆盖前前端需确认） */
  save: (data: { family_id: string; baby_id: string; diary_date: string; content: string; photo_ids?: string[] }) =>
    request<{ id: string }>('/api/agent/diary/save', { method: 'POST', data }),

  /** 某天日记（无 → null） */
  detail: (familyId: string, babyId: string, date: string) =>
    request<DiaryDetail | null>(
      `/api/agent/diary/detail?family_id=${encodeURIComponent(familyId)}&baby_id=${encodeURIComponent(babyId)}&date=${encodeURIComponent(date)}`,
    ),

  /** 按月列表（倒序） */
  list: (familyId: string, babyId: string, month: string) =>
    request<DiaryItem[]>(
      `/api/agent/diary/list?family_id=${encodeURIComponent(familyId)}&baby_id=${encodeURIComponent(babyId)}&month=${encodeURIComponent(month)}`,
    ),

  /** 编辑日记（content / photo_ids 覆盖） */
  update: (id: string, data: { family_id: string; content?: string; photo_ids?: string[] }) =>
    request<{ id: string }>(`/api/agent/diary/${id}`, { method: 'PUT', data }),

  /** 追加照片（去重） */
  appendPhotos: (id: string, data: { family_id: string; photo_ids: string[] }) =>
    request<{ id: string; photo_ids: string[] }>(`/api/agent/diary/${id}/photos`, { method: 'POST', data }),
}
