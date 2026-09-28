/**
 * Agent 观测埋点（lib/telemetry.js，TECH-007）
 *
 * 职责：按 Langfuse 数据模型（trace / generation / span）旁路记录一次 /chat 请求的
 * 完整执行过程（用户问题、每轮 LLM 输出与 token 用量、每次工具调用的输入输出），
 * 异步写入 FlexDB 集合 `agent_traces`，供本地 Langfuse 导入（scripts/langfuse-import.mjs）。
 *
 * 设计约束：
 * - 纯旁路：任何埋点失败只 console.warn，绝不影响对话链路（与 history.js 同策略）
 * - 零新增运行时依赖：FlexDB 写入复用 @cloudbase/node-sdk；Langfuse 协议转换在导入端做
 * - 先写 status=running（进程崩溃也留有部分数据），finish() 时最终写
 * - TRACE_TELEMETRY=off 时所有方法为 no-op
 *
 * FlexDB 文档结构见 docs/tech/TECH-007-agent-observability-langfuse.md §2。
 */
import { randomUUID } from 'node:crypto'
import cloudbase from '@cloudbase/node-sdk'

const COLLECTION = 'agent_traces'

// 模块级单例（与 lib/history.js 同策略；凭证过期由 getCloudBaseCredentials 调用方兜底）
let app = null
let appKey = ''
let ensurePromise = null

function getApp(envId, credentials) {
  const key = `${envId}:${credentials?.secretId}`
  if (!app || appKey !== key) {
    app = cloudbase.init({
      env: envId,
      secretId: credentials.secretId,
      secretKey: credentials.secretKey,
      ...(credentials.sessionToken ? { sessionToken: credentials.sessionToken } : {}),
    })
    appKey = key
    ensurePromise = null
  }
  return app
}

async function getCol(envId, credentials) {
  const db = getApp(envId, credentials).database()
  if (!ensurePromise) {
    ensurePromise = db.createCollection(COLLECTION).catch(() => {})
  }
  await ensurePromise
  return db.collection(COLLECTION)
}

/**
 * 创建 trace recorder。
 *
 * @param {object} opts
 * @param {string} opts.envId          TCB 环境
 * @param {object|null} opts.credentials  TCB 凭证（null 时 no-op，仅内存记录）
 * @param {object} opts.req            { userId, conversationId, familyId, babyId, message, imageCount, model, historyCount }
 * @returns {Recorder} 带 disabled 标记的 recorder
 */
export function createTraceRecorder({ envId, credentials, req }) {
  const disabled = process.env.TRACE_TELEMETRY === 'off' || !credentials
  const traceId = randomUUID()
  const startedAt = Date.now()

  const state = {
    traceId,
    sessionId: req.conversationId,
    userId: req.userId,
    name: 'agent-chat',
    input: { message: req.message, ...(req.imageCount ? { images: req.imageCount } : {}) },
    output: null,
    metadata: {
      model: req.model,
      familyId: req.familyId || null,
      babyId: req.babyId || null,
      historyCount: req.historyCount ?? 0,
      totalMs: null,
      eventCount: 0,
      forceFinished: false,
      toolCalls: [], // [{name, count}] 汇总
      error: null,
    },
    tags: ['agent-chat', req.model].filter(Boolean),
    status: 'running',
    observations: [],
    startedAt,
    endedAt: null,
    importedAt: null,
  }
  const toolCounts = new Map()
  // 当前进行中的 generation（LLM 轮次）
  let currentGen = null

  /** 内部写 FlexDB；失败仅告警 */
  async function persist() {
    if (disabled) return
    try {
      const col = await getCol(envId, credentials)
      const { data } = await col.where({ traceId }).limit(1).get()
      if (data.length > 0) {
        await col.doc(data[0]._id).update(state)
      } else {
        await col.add({ ...state })
      }
    } catch (e) {
      console.warn('[telemetry] persist failed:', e?.message || e)
    }
  }

  const recorder = {
    traceId,
    disabled,

    /** 计数 OAK 流事件（观测用，与 SSE eventCount 同源） */
    countEvent() {
      state.metadata.eventCount++
    },

    /** 开始一轮 LLM 生成（主流一轮 / 每次 tool resume 一轮） */
    startGeneration(label) {
      if (currentGen) recorder.endGeneration()
      currentGen = {
        id: randomUUID(),
        type: 'generation',
        name: label,
        model: state.metadata.model,
        startTime: Date.now(),
        endTime: null,
        output: '',
        usage: null,
        level: 'DEFAULT',
        statusMessage: null,
      }
      state.observations.push(currentGen)
    },

    /** 记录当前 generation 的 token 用量（OAK usage_update：input+output 合计）
     *  ⚠️ 主流的 usage_update 在 send 流收尾时才发出，此时该轮 generation 可能已
     *  因工具调用提前结束——回退挂到最早的未记录用量 generation 上。 */
    recordUsage(totalTokens) {
      if (typeof totalTokens !== 'number') return
      let target = currentGen
      if (!target) {
        target = state.observations.find(
          (o) => o.type === 'generation' && o.usage === null,
        )
      }
      if (target) target.usage = { total_tokens: totalTokens }
    },

    /** 追加当前 generation 的输出文本 */
    appendGenerationText(text) {
      if (currentGen && typeof text === 'string') {
        // 上限保护：单轮 64KB，避免异常输出撑爆 FlexDB 文档
        if (currentGen.output.length < 65536) currentGen.output += text
      }
    },

    endGeneration() {
      if (!currentGen) return
      currentGen.endTime = Date.now()
      currentGen.output = currentGen.output || null
      currentGen = null
    },

    /** 开始一次工具调用 span */
    startTool(name, input) {
      recorder.endGeneration()
      const span = {
        id: randomUUID(),
        type: 'span',
        name,
        startTime: Date.now(),
        endTime: null,
        input: input ?? null,
        output: null,
        level: 'DEFAULT',
        statusMessage: null,
      }
      state.observations.push(span)
      toolCounts.set(name, (toolCounts.get(name) || 0) + 1)
      return span
    },

    /** 结束工具 span；level: DEFAULT | WARNING（超限未执行）| ERROR */
    endTool(span, output, { level = 'DEFAULT', statusMessage = null } = {}) {
      if (!span) return
      span.endTime = Date.now()
      // 上限保护：工具输出 128KB
      span.output =
        typeof output === 'string' && output.length > 131072
          ? output.slice(0, 131072) + '…[truncated]'
          : output
      span.level = level
      span.statusMessage = statusMessage
    },

    /** 标记强制收尾（看门狗 idle/总时长超限） */
    markForceFinished() {
      state.metadata.forceFinished = true
    },

    /** 结束 trace 并最终落库。status: completed | error | timeout */
    async finish({ output, status = 'completed', error = null } = {}) {
      recorder.endGeneration()
      state.output = output ?? null
      state.status = status
      state.metadata.totalMs = Date.now() - startedAt
      state.metadata.toolCalls = [...toolCounts.entries()].map(([name, count]) => ({ name, count }))
      state.metadata.error = error ? String(error).slice(0, 500) : null
      state.endedAt = Date.now()
      await persist()
      return traceId
    },
  }

  // 立即落一条 running，进程崩溃也留有部分痕迹
  persist()
  return recorder
}
