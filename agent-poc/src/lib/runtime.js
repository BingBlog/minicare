/**
 * Agent 运行时（lib/runtime.js，2026-09-04 直连 SDK 改造）
 *
 * 背景：OAK 0.1.1（@cloudbase/open-agent-kernel）存在三个实测确认的硬伤——
 *   1) ModelSpec.options 被静默忽略，thinking 无法关闭（每轮多 1-7s）；
 *   2) resume 不可用 → 每请求重建 agent（spawn 3-4s）；
 *   3) 26K prefill（preset claude_code CLI 系统提示 + 全量内置工具 schema）。
 * POC 验证（scripts/poc-direct-sdk.mjs / poc-wire-proxy.mjs）：直连 claude-agent-sdk
 * 后 prefill 21361→1090（-95%）、resume 可用、进程内反代注入 thinking 生效（-52%）。
 *
 * 本模块用 @anthropic-ai/claude-agent-sdk 的 query() 直连 DeepSeek（anthropic 端点），
 * 产出**归一化事件流**供 routes/chat.js 与 scripts/eval/lib/agent-runner.mjs 共同消费
 * （此前两处各自复刻一份 OAK 事件循环，已收敛）。
 *
 * 归一化事件：
 *   { type: 'text', text }                    — 助手文本（含准备语剔除策略，见下）
 *   { type: 'tool_call', name, input, allowed }     — 模型发起工具调用（allowed=循环防护判定）
 *   { type: 'tool_result', name, output, allowed, ms } — 工具执行结果
 *   { type: 'usage', totalTokens }            — 本轮 token 总量（result 消息汇总，含 cache）
 *   { type: 'done', resultText, isError }     — 正常收尾
 *   { type: 'error', message }                — 运行时异常
 *
 * 行为对齐（与 OAK 版 chat.js 2026-08-25/09-03 修复一致）：
 *   - 准备语剔除：首个工具调用前的文本缓存，遇工具调用即丢弃；工具已发生后的文本
 *     视为正式回答直接产出；结束点 flush 缓存（无工具轮=结束点整段产出，与原行为一致）。
 *   - 工具循环防护：同一工具 ≤2 次、总次数 ≤3 次，超限不执行、回传"已达上限"话术
 *     （在工具 execute 包装层实现——SDK 自动执行进程内 MCP 工具，无宿主介入点）。
 *   - 无 OAK client-tool 的主流/resume 双流拼接问题：SDK 单流天然无"续话"歧义。
 *
 * env 注入：SDK 子进程继承 process.env（ANTHROPIC_BASE_URL 指向 wire-proxy，
 * CLAUDE_CONFIG_DIR 指向隔离目录）——由 server.js 启动时设置，此处不传 options.env
 * （该选项会整体替换子进程环境变量）。
 */
import os from 'node:os'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { createSdkMcpServer, tool as sdkTool, query } from '@anthropic-ai/claude-agent-sdk'
import { TOOLS } from './tools/index.js'
import { buildSystemPrompt } from '../prompts/system.js'

/** 工具循环防护阈值（与 OAK 版一致） */
export const MAX_SAME_TOOL_CALLS = 2
export const MAX_TOTAL_TOOL_CALLS = 3

/** SDK 子进程隔离的 CLAUDE_CONFIG_DIR（transcript/debug 落在这里，不污染 ~/.claude） */
export const SDK_CONFIG_DIR = path.join(os.homedir(), '.minicare-agent', 'claude-config')

let configDirEnsured = false
function ensureConfigDir() {
  if (!configDirEnsured) {
    mkdirSync(SDK_CONFIG_DIR, { recursive: true })
    configDirEnsured = true
  }
}

// ── 运行时环境初始化（懒加载单例；server 与 eval 共用）──────────────────
// SDK 子进程继承 process.env：ANTHROPIC_BASE_URL 指向进程内 wire-proxy
// （注入 thinking / 可选抓 prompt），CLAUDE_CONFIG_DIR 隔离会话文件。
import { startWireProxy } from './wire-proxy.js'
import { ANTHROPIC_ENDPOINT } from './deepseek.js'

let envInitPromise = null
let envInitInfo = null

/**
 * 初始化 SDK 运行时环境（幂等）。返回 { baseUrl } 供日志展示。
 * @param {object} config loadConfig() 返回值
 */
export function initAgentRuntime(config) {
  if (!envInitPromise) {
    envInitPromise = (async () => {
      ensureConfigDir()
      process.env.CLAUDE_CONFIG_DIR = SDK_CONFIG_DIR
      process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1'
      process.env.ANTHROPIC_AUTH_TOKEN = config.deepSeekKey
      process.env.ANTHROPIC_API_KEY = ''
      try {
        const proxy = await startWireProxy({
          thinkingMode: config.thinkingMode || 'disabled',
          wireLog: !!config.wireLog,
        })
        process.env.ANTHROPIC_BASE_URL = proxy.baseUrl
        envInitInfo = {
          baseUrl: proxy.baseUrl,
          upstream: ANTHROPIC_ENDPOINT,
          thinking: config.thinkingMode || 'disabled',
        }
      } catch (e) {
        // 反代失败回退直连官方端点（thinking 不可控，仅降级不阻断）
        console.warn('[runtime] wire-proxy 启动失败，回退直连官方端点:', e?.message || e)
        process.env.ANTHROPIC_BASE_URL = ANTHROPIC_ENDPOINT
        envInitInfo = { baseUrl: ANTHROPIC_ENDPOINT, upstream: ANTHROPIC_ENDPOINT, thinking: 'passthrough(回退)' }
      }
      console.log(
        `[runtime] model endpoint ${envInitInfo.baseUrl} → ${envInitInfo.upstream} (thinking=${envInitInfo.thinking})`,
      )
      return envInitInfo
    })()
  }
  return envInitPromise
}

/**
 * 构建 SDK MCP 工具集（进程内执行，ctx 闭包注入）。
 * 循环防护计数器闭包在本次 turn 内。
 * @returns {{ mcpServer: object, wouldAllow: (name: string) => boolean }}
 *   wouldAllow：预判下一次调用是否会被放行（tool_call 事件发 allowed 标记用；
 *   事件序与执行序一致——计数器只在 execute 时递增，二者判定必然相同）。
 */
function buildMcpTools(ctx) {
  const toolCounts = {}
  let totalCalls = 0
  const wouldAllow = (name) => {
    if (totalCalls >= MAX_TOTAL_TOOL_CALLS) return false
    if ((toolCounts[name] || 0) >= MAX_SAME_TOOL_CALLS) return false
    return true
  }

  const tools = {}
  for (const t of TOOLS) {
    tools[t.def.name] = sdkTool(t.def.name, t.def.description, t.def.parameters.shape, async (input) => {
      const name = t.def.name
      let output
      if (!wouldAllow(name)) {
        output = JSON.stringify({
          ok: false,
          error: `工具 ${name} 调用次数已达上限，请直接基于已有信息回答用户问题，不要再调用任何工具`,
        })
      } else {
        toolCounts[name] = (toolCounts[name] || 0) + 1
        totalCalls++
        try {
          output = await t.execute(input ?? {}, ctx)
        } catch (e) {
          output = JSON.stringify({ ok: false, error: String(e?.message || e) })
        }
      }
      return { content: [{ type: 'text', text: output }] }
    })
  }
  return {
    mcpServer: createSdkMcpServer({
      name: 'minicare-tools',
      version: '1.0.0',
      tools: Object.values(tools), // Array<SdkMcpToolDefinition>
    }),
    wouldAllow,
  }
}

/** result 消息 usage → 总 token（含 cache 读写，与 OAK usage_update 口径对齐） */
function usageTotal(u) {
  if (!u) return null
  const total =
    (u.input_tokens || 0) +
    (u.output_tokens || 0) +
    (u.cache_read_input_tokens || 0) +
    (u.cache_creation_input_tokens || 0)
  return total > 0 ? total : null
}

/**
 * 执行一轮对话，返回归一化事件异步迭代器。
 *
 * @param {object} opts
 * @param {object} opts.config   loadConfig() 返回值（deepSeekKey/modelDefault）
 * @param {string} opts.message  用户消息
 * @param {Array}  [opts.history] [{role:'user'|'assistant',content}]（注入 systemPrompt）
 * @param {object} [opts.ctx]    {userId,familyId,babyId}（工具闭包注入，模型不可见）
 * @param {Array}  [opts.images] Anthropic content blocks（vision.js 产出，可为空）
 * @param {string} [opts.model]  模型覆盖
 * @param {AbortController} [opts.abortController] 看门狗 force finish 时 abort 中断 CLI
 * @returns {AsyncIterable<object>} 归一化事件流（自动 return，消费方中断安全）
 */
export function runAgentTurn(opts) {
  const {
    config,
    message,
    history = [],
    ctx = {},
    images = [],
    model,
    abortController,
  } = opts

  ensureConfigDir()
  const systemPrompt = buildSystemPrompt(ctx, history)
  const { mcpServer, wouldAllow } = buildMcpTools(ctx)

  async function* gen() {
    await initAgentRuntime(config) // 幂等：eval 直跑时也完成 env/代理初始化
    // tool_use_id → { name, startedAt }（assistant 块与 user tool_result 分属两条消息）
    const pendingTools = new Map()

    // 用户消息 content：文本 + 图片 blocks（与 Anthropic Messages API 同构）
    const content = [{ type: 'text', text: message }, ...images]

    let pendingText = ''
    let seenTool = false // 是否已发生工具调用（准备语剔除分界线）
    function* flushPending() {
      if (pendingText) {
        const text = pendingText
        pendingText = ''
        yield { type: 'text', text }
      }
    }

    try {
      // SDK prompt 只接受 string | AsyncIterable<SDKUserMessage>；
      // 图片走 content blocks，因此用单消息异步生成器（一次性会话，结束即退出）
      async function* userPrompt() {
        yield {
          type: 'user',
          message: { role: 'user', content },
          parent_tool_use_id: null,
          timestamp: new Date().toISOString(),
        }
      }
      const q = query({
        prompt: userPrompt(),
        options: {
          model: model || config.modelDefault,
          maxTurns: 12,
          permissionMode: 'bypassPermissions',
          settingSources: [], // 不加载项目/用户级文件系统配置，system prompt 完全自持
          systemPrompt,
          tools: [], // 关闭全部内置工具，仅保留业务工具（prefill 降 95% 的关键）
          mcpServers: { minicare: mcpServer },
          ...(abortController ? { abortController } : {}),
        },
      })

      for await (const msg of q) {
        if (msg.type === 'assistant') {
          for (const block of msg.message?.content || []) {
            if (block.type === 'text') {
              if (seenTool) {
                // 工具已发生：正式回答，直接产出（对齐 OAK resume 流直发行为）
                yield { type: 'text', text: block.text }
              } else {
                pendingText += block.text
              }
            } else if (block.type === 'tool_use') {
              seenTool = true
              pendingText = '' // 丢弃工具调用前的准备语（2026-08-25 行为对齐）
              // SDK 经进程内 MCP server 暴露，wire 名为 mcp__minicare__<name>；
              // 剥前缀保持 SSE 工具名与 OAK 版一致（客户端按裸名匹配）
              const name = block.name.replace(/^mcp__minicare__/, '')
              const allowed = wouldAllow(name)
              pendingTools.set(block.id, { name, startedAt: Date.now() })
              yield { type: 'tool_call', name, input: block.input ?? {}, allowed }
            }
            // thinking 块：不产出（与 OAK 版一致，思维链不上客户端）
          }
        } else if (msg.type === 'user') {
          // SDK 自动执行进程内 MCP 工具后，结果以 user 消息（tool_result block）回流
          const arr = Array.isArray(msg.message?.content) ? msg.message.content : []
          for (const block of arr) {
            if (block.type === 'tool_result') {
              const meta = pendingTools.get(block.tool_use_id) || { name: 'unknown_tool', startedAt: null }
              pendingTools.delete(block.tool_use_id)
              const output =
                typeof block.content === 'string'
                  ? block.content
                  : Array.isArray(block.content)
                    ? block.content.map((c) => c?.text || '').join('')
                    : ''
              // 循环防护拒绝时 is_error=true 且内容为"已达上限"话术
              const allowed = !(block.is_error && output.includes('调用次数已达上限'))
              yield {
                type: 'tool_result',
                name: meta.name,
                output,
                allowed,
                ms: meta.startedAt ? Date.now() - meta.startedAt : null,
              }
            }
          }
        } else if (msg.type === 'result') {
          const total = usageTotal(msg.usage)
          if (total) yield { type: 'usage', totalTokens: total }
          yield* flushPending()
          yield {
            type: 'done',
            resultText: msg.result || '',
            isError: !!msg.is_error,
          }
        }
      }
      yield* flushPending()
    } catch (e) {
      // abortController.abort() 会令迭代抛 AbortError——force finish 场景按正常中断处理
      if (e?.name === 'AbortError') {
        yield* flushPending()
        return
      }
      yield* flushPending()
      yield { type: 'error', message: String(e?.message || e) }
    }
  }

  return gen()
}
