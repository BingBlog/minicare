/**
 * 最小 demo：OAK + DeepSeek（Anthropic 兼容端点）+ 知识库工具 + 多用户会话
 *
 * 运行：node src/demo.js
 * 依赖：.env.local 中 DEEPSEEK_API_KEY；tcb login 已登录（FlexDB 会话持久化用）
 *
 * 验证点：
 *   1. OAK + DeepSeek 出流（实际模型 = deepseek-v4-flash / deepseek-v4-pro）
 *   2. client-tool 协议：模型调用 search_knowledge → 宿主执行 → respondToolUse 回传 → 基于知识库作答
 *   3. FlexDB 会话持久化（credentials 注入 → 默认启用）
 *   4. 多用户隔离（userId + conversationId，conversationId 需 UUID 格式）
 *
 * ⚠️ POC 实测踩坑回顾（详见 README）：
 *   - 模型名必须用 Claude CLI 白名单内 id（claude-sonnet-4-20250514），
 *     apiBaseUrl 指向 DeepSeek Anthropic 端点后实际路由到 deepseek 模型
 *   - client-tool 依赖 session store（patchSentinelToolResult 需持久化 transcript）
 *   - ToolDefinition.parameters 必须是 zod schema
 *   - conversationId 必须是 UUID 格式（Claude CLI 校验，非 UUID 直接报 Invalid session ID）
 */
import { randomUUID } from 'node:crypto'
import { createAgent } from '@cloudbase/open-agent-kernel'
import { getDeepSeekKey, buildDeepSeekModelSpec, getCloudBaseCredentials } from './lib/cloudbase-auth.js'
import { KNOWLEDGE_TOOL_DEF, executeSearchKnowledge } from './lib/knowledge-base.js'

// ① 凭证
const apiKey = getDeepSeekKey()
const credentials = getCloudBaseCredentials()
console.log('[1/5] DeepSeek API Key 就绪, FlexDB 凭证就绪')

// ② 创建 Agent（模型走 DeepSeek）
const agent = createAgent({
  envId: 'minicare-cloud-6gqledlle0132cbe',
  credentials, // FlexDB 会话持久化（client-tool 必需）
  model: buildDeepSeekModelSpec(apiKey),
  systemPrompt:
    '你是"敏宝护理助手"，一名严谨温和的宝宝护理顾问。回答家长问题时：' +
    '1) 必须先调用 search_knowledge 检索知识库，基于检索结果回答；' +
    '2) 工具结果返回后，直接基于结果内容给出完整回答，不要说"正在检索/请稍候"；' +
    '3) 知识库没有的内容，明确说"知识库未收录，建议咨询医生"；' +
    '4) 涉及医疗判断时提醒"本回答仅供参考，不能替代专业医疗建议"；' +
    '5) 用简体中文，语气亲切但专业。',
  tools: [
    {
      name: KNOWLEDGE_TOOL_DEF.name,
      description: KNOWLEDGE_TOOL_DEF.description,
      parameters: KNOWLEDGE_TOOL_DEF.parameters, // zod schema
      execute: executeSearchKnowledge,
    },
  ],
  cwd: process.cwd(),
})
console.log('[2/5] Agent 创建完成, id:', agent.id)

/**
 * ③ 宿主循环：send → 消费事件流 → client/<tool> 请求执行 → respondToolUse 回传
 */
async function chat(userId, conversationId, question) {
  const session = await agent.startSession({ userId, conversationId })
  console.log(`\n[3/5] 用户 ${userId} (会话 ${conversationId.slice(0, 8)}…) 提问: "${question}"`)
  let answer = ''

  for await (const event of session.send(question)) {
    // client/<toolName> JSON-RPC REQUEST：模型请求调用客户端工具
    if (event.jsonrpc && typeof event.method === 'string' && event.method.startsWith('client/')) {
      const toolCallId = event._meta?.toolCallId
      console.log(`  ⚙️ [client-tool] ${event.method.slice(7)}(${JSON.stringify(event.params)})`)
      const output = await executeSearchKnowledge(event.params ?? {})
      console.log(`  ✅ [client-tool] 执行完成, ${String(output).length} 字符`)

      // 回传结果恢复 turn
      const resumeStream = session.respondToolUse({ toolUseId: toolCallId, output })
      for await (const ev2 of resumeStream) {
        const u2 = ev2.params?.update
        if (u2?.sessionUpdate === 'agent_message_chunk') {
          process.stdout.write(u2.content.text)
          answer += u2.content.text
        }
      }
      continue
    }

    // 流式文本增量
    const u = event.params?.update
    if (u?.sessionUpdate === 'agent_message_chunk') {
      process.stdout.write(u.content.text)
      answer += u.content.text
    }
  }
  console.log('')
  return answer
}

// ④ 双用户对话（隔离演示）：conversationId 模拟"threadId=具体孩子/会话"（UUID）
await chat('userA', randomUUID(), '宝宝确诊牛奶蛋白过敏，应该喝什么配方奶？')
await chat('userB', randomUUID(), '什么是深度水解配方？和普通奶粉有什么区别？')

console.log('\n[4/5] 会话隔离验证（两个用户各用独立会话，此处跳过历史恢复）')
console.log('\n[5/5] POC 验证完成')
process.exit(0)
