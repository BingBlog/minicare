/**
 * 文本向量化（lib/embeddings.js，P1 知识库）
 *
 * 运行时对 query 现算 embedding（TokenHub，OpenAI 兼容 /v1/embeddings），
 * 与 minicare-platform/api/embed/hunyuan.py 使用同一模型 kinfra-text-embedding-0.6b（1024 维），
 * 保证离线入库向量与在线 query 向量同空间。
 *
 * 环境变量：TOKENHUB_API_KEY（sk- 开头）。缺 key 时 embed() 返回 null，
 * 由 hybridSearch 降级为仅 FULLTEXT 检索。
 *
 * 可替换性：embed() 是本模块唯一出口，换 embedding 服务（bge-m3 自托管等）只改这里
 * （M02 §8.3）。LRU 缓存避免同一 query 重复调用（~100ms/次）。
 */
const BASE_URL = 'https://tokenhub.tencentmaas.com/v1'
const MODEL = 'kinfra-text-embedding-0.6b' // 1024 维，与入库一致
const DIM = 1024

// 简单 LRU（Map 保持插入序）
const cache = new Map()
const CACHE_MAX = 128

export function hasEmbedding() {
  return Boolean(process.env.TOKENHUB_API_KEY)
}

/**
 * 单条文本 → float32 向量。失败返回 null（调用方降级，不抛异常）。
 * @param {string} text
 * @returns {Promise<Float32Array|null>}
 */
export async function embed(text) {
  const key = text.trim().slice(0, 200) // 缓存键截断，避免超长 query 撑爆内存
  if (cache.has(key)) {
    // 命中后刷新到末尾（LRU）
    const v = cache.get(key)
    cache.delete(key)
    cache.set(key, v)
    return v
  }
  const apiKey = process.env.TOKENHUB_API_KEY
  if (!apiKey) return null

  let vec = null
  try {
    const r = await fetch(`${BASE_URL}/embeddings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, input: [text] }),
      signal: AbortSignal.timeout(15000),
    })
    if (!r.ok) {
      console.error(`[embed] TokenHub ${r.status}: ${(await r.text()).slice(0, 200)}`)
      return null
    }
    const body = await r.json()
    const arr = body?.data?.[0]?.embedding
    if (!Array.isArray(arr)) return null
    vec = Float32Array.from(arr)
  } catch (e) {
    console.error('[embed] 调用失败:', e.message)
    return null
  }

  if (cache.size >= CACHE_MAX) {
    // 淘汰最早插入的
    const oldest = cache.keys().next().value
    cache.delete(oldest)
  }
  cache.set(key, vec)
  return vec
}

/** 向量余弦相似度（归一化向量点积） */
export function cosine(a, b) {
  let dot = 0
  let na = 0
  let nb = 0
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}

export { DIM }
