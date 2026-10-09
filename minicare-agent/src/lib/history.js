/**
 * 对话历史存储（lib/history.js）
 *
 * ⚠️ 背景（2026-08-23 P0 实测）：OAK 0.1.1 的会话恢复（resume）在
 * DeepSeek Anthropic 端点 + Claude CLI 组合下不可用（新一轮 send 返回空流，
 * 0.1.2-beta.0 亦复现）。因此**不依赖 OAK 的 FlexDB transcript 恢复**，
 * 改为自管历史：每次请求新建 agent session，历史从本集合读取并注入 systemPrompt。
 *
 * 存储：CloudBase FlexDB 集合 `agent_chat_history`
 *   文档：{ conversationId, userId, familyId, babyId, messages: [{role,content}], updatedAt }
 * 保留策略：存最近 40 条，读给模型最近 20 条（对齐 M1 tech §2.2）。
 *
 * ⚠️ 并发限制：同一 conversationId 并行写会互相覆盖（P0 单实例串行，可接受）。
 */
import cloudbase from '@cloudbase/node-sdk'

const COLLECTION = 'agent_chat_history'
const MAX_STORE = 40
const MAX_READ = 20

let app = null
let ensurePromise = null

function getApp(envId, credentials) {
  if (!app) {
    app = cloudbase.init({
      env: envId,
      secretId: credentials.secretId,
      secretKey: credentials.secretKey,
      ...(credentials.sessionToken ? { sessionToken: credentials.sessionToken } : {}),
    })
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

/** 读取会话历史（最近 MAX_READ 条）；无凭证/异常返回 [] */
export async function getChatHistory(envId, credentials, conversationId) {
  if (!credentials || !conversationId) return []
  try {
    const col = await getCol(envId, credentials)
    const { data } = await col.where({ conversationId }).limit(1).get()
    const messages = data?.[0]?.messages || []
    return messages.slice(-MAX_READ)
  } catch (e) {
    console.warn('[history] get failed:', e?.message || e)
    return []
  }
}

/** 追加一轮问答到会话历史（不存在的会话自动创建） */
export async function appendChatHistory(
  envId,
  credentials,
  { conversationId, userId, familyId, babyId },
  userMsg,
  asstMsg,
) {
  if (!credentials || !conversationId) return
  try {
    const col = await getCol(envId, credentials)
    const { data } = await col.where({ conversationId }).limit(1).get()
    const now = Date.now()
    const next = (data?.[0]?.messages || [])
      .concat([
        { role: 'user', content: userMsg },
        { role: 'assistant', content: asstMsg },
      ])
      .slice(-MAX_STORE)
    if (data.length > 0) {
      await col.doc(data[0]._id).update({ messages: next, userId, familyId, babyId, updatedAt: now })
    } else {
      await col.add({ conversationId, userId, familyId, babyId, messages: next, updatedAt: now })
    }
  } catch (e) {
    console.warn('[history] append failed:', e?.message || e)
  }
}
