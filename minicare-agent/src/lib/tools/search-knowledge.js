/**
 * 知识库检索工具（search_knowledge，M2 知识问答 P1 版）
 *
 * 混合检索：FULLTEXT ngram（title/content/keywords）+ 向量余弦（embedding BLOB）+ RRF 融合。
 * 数据源：knowledge_base 表（迁移 017）。
 *
 * 降级链：
 *   DB 不可用 / 空库           → { found: false, message: '知识库未找到相关内容' }
 *   无 TOKENHUB_API_KEY        → 仅 FULLTEXT 路（向量路跳过）
 *   query embedding 失败       → 仅 FULLTEXT 路
 *   review 条目（[待复核]前缀）→ 两条路都过滤，不入检索
 *
 * 接口兼容 POC 版：OAK ToolDefinition.parameters 必须是 zod schema（POC 踩坑 4）。
 */
import { z } from 'zod'
import { getDb } from '../db.js'
import { embed, cosine } from '../embeddings.js'

const RRF_K = 60

/** 单条检索结果 content 截断上限（字符）。5 条全文可达 18KB，截到 800 字后整体 ~4KB */
const CONTENT_MAX_CHARS = 800

// ---------- FULLTEXT 路 ----------

/** review 条目过滤：MySQL LIKE 中 [..] 是字符类语法，必须用 REGEXP 匹配字面 [ */
const NOT_REVIEW = "content NOT REGEXP '^\\\\[待复核\\\\]'"

/** FULLTEXT ngram 检索，取 top 20（含过滤条件，SQL 端完成） */
async function fulltextSearch(db, query, filters) {
  const where = ['status=1', NOT_REVIEW]
  const params = []
  if (filters.riskLevel) {
    where.push('risk_level=?')
    params.push(filters.riskLevel)
  }
  if (filters.category) {
    where.push('category=?')
    params.push(filters.category)
  }
  const [rows] = await db.query(
    `SELECT id, kb_id, title, category, content, source, risk_level,
            MATCH(title,content,keywords) AGAINST(? IN NATURAL LANGUAGE MODE) AS score
     FROM knowledge_base
     WHERE ${where.join(' AND ')} AND MATCH(title,content,keywords) AGAINST(? IN NATURAL LANGUAGE MODE)
     ORDER BY score DESC LIMIT 20`,
    [...params, query, query],
  )
  return rows
}

// ---------- 向量路 ----------

// 进程级向量缓存：{ rows: [...], ts }，10 分钟 TTL（知识库离线导入，运行期基本不变）
// 2026-09-04 性能修复：TTL 过期改为 stale-while-revalidate —— 立即返回旧数据、
// 后台异步刷新。原来同步重拉全表（1584 行 / 6.5MB BLOB ≈ 6s）会把首个撞上的
// 知识库问题卡 6s+。另提供 preheatVectors() 供 server 启动时预热。
let vecCache = null
const VEC_TTL = 10 * 60 * 1000
let vecRefreshing = false

async function fetchVectors(db) {
  const [rows] = await db.query(
    `SELECT id, kb_id, title, category, content, source, risk_level, embedding
     FROM knowledge_base
     WHERE status=1 AND ${NOT_REVIEW} AND embedding IS NOT NULL`,
  )
  return rows
}

/** 后台刷新（fire-and-forget，失败沿用旧数据，同一时刻最多一个刷新在跑） */
function refreshVectorsInBackground(db) {
  if (vecRefreshing) return
  vecRefreshing = true
  const started = Date.now()
  fetchVectors(db)
    .then((rows) => {
      vecCache = { ts: Date.now(), rows }
      console.log(`[kb] 向量缓存后台刷新完成 rows=${rows.length} ms=${Date.now() - started}`)
    })
    .catch((e) => {
      console.error('[kb] 向量缓存后台刷新失败（沿用旧数据）:', e.message)
    })
    .finally(() => {
      vecRefreshing = false
    })
}

async function loadVectors(db) {
  if (vecCache) {
    if (Date.now() - vecCache.ts >= VEC_TTL) refreshVectorsInBackground(db)
    return vecCache.rows
  }
  const started = Date.now()
  const rows = await fetchVectors(db)
  vecCache = { ts: Date.now(), rows }
  console.log(`[kb] 向量缓存冷加载 rows=${rows.length} ms=${Date.now() - started}`)
  return rows
}

/** 启动预热：server 启动时后台拉一次全表向量，首个知识库问题不再付 6s 冷加载成本 */
export function preheatVectors() {
  const db = getDb()
  if (!db || vecCache || vecRefreshing) return
  const started = Date.now()
  fetchVectors(db)
    .then((rows) => {
      vecCache = { ts: Date.now(), rows }
      console.log(`[kb] 向量缓存预热完成 rows=${rows.length} ms=${Date.now() - started}`)
    })
    .catch((e) => {
      console.error('[kb] 向量缓存预热失败（首个问题将冷加载）:', e.message)
    })
}

/** query embedding → 余弦 top 20；embedding 不可用时返回 null（仅 FULLTEXT） */
async function vectorSearch(query, filters) {
  const db = getDb()
  if (!db) return null
  const qVec = await embed(query)
  if (!qVec) return null
  const rows = await loadVectors(db)
  if (rows.length === 0) return null

  const scored = []
  for (const r of rows) {
    if (filters.riskLevel && r.risk_level !== filters.riskLevel) continue
    if (filters.category && r.category !== filters.category) continue
    const blob = r.embedding
    if (!blob) continue
    const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob)
    if (buf.length % 4 !== 0) continue
    // mysql2 返回的 BLOB Buffer 可能带非对齐 byteOffset，拷贝到对齐的新 buffer 再转 Float32Array
    const aligned = new Uint8Array(buf.length)
    aligned.set(buf)
    const vec = new Float32Array(aligned.buffer, 0, buf.length / 4)
    scored.push({ ...r, vecScore: cosine(qVec, vec) })
  }
  return scored
    .sort((a, b) => b.vecScore - a.vecScore)
    .slice(0, 20)
    .map((r) => ({ ...r, vector_score: r.vecScore }))
}

// ---------- RRF 融合 ----------

function rrfFuse(ftsRows, vecRows, filters, topK) {
  const scores = new Map() // id -> { item, rrf }
  const addRank = (rows, key) => {
    rows.forEach((row, idx) => {
      const id = row.id
      const rank = idx + 1
      const cur = scores.get(id)
      if (cur) {
        cur.rrf += 1 / (RRF_K + rank)
      } else {
        scores.set(id, {
          item: {
            id,
            kb_id: row.kb_id,
            title: row.title,
            category: row.category,
            content: row.content,
            source: row.source,
            risk_level: row.risk_level,
            score: Number(row.score || 0),
          },
          rrf: 1 / (RRF_K + rank),
        })
      }
    })
  }
  if (ftsRows?.length) addRank(ftsRows, 'fts')
  if (vecRows?.length) addRank(vecRows, 'vec')

  return [...scores.values()]
    .sort((a, b) => b.rrf - a.rrf)
    .slice(0, topK)
    .map(({ item }) => item)
}

// ---------- 对外接口 ----------

/**
 * 混合检索（对外唯一入口，M02 §8.3 可替换性设计）
 * @param {string} query
 * @param {number} [topK=5]
 * @param {{riskLevel?: string, category?: string}} [filters]
 */
export async function hybridSearch(query, topK = 5, filters = {}) {
  const db = getDb()
  if (!db) return []

  const [ftsRows, vecRows] = await Promise.allSettled([
    fulltextSearch(db, query, filters),
    vectorSearch(query, filters),
  ])
  const fts = ftsRows.status === 'fulfilled' ? ftsRows.value : []
  const vec = vecRows.status === 'fulfilled' ? vecRows.value : null
  if (vecRows.status === 'rejected') {
    console.error('[search] 向量路失败（降级 FULLTEXT）:', vecRows.reason?.message)
  }
  return rrfFuse(fts, vec, filters, topK)
}

/** OAK ToolDefinition：parameters 必须是 zod schema（POC 踩坑 4） */
export const KNOWLEDGE_TOOL_DEF = {
  name: 'search_knowledge',
  description:
    '检索宝宝护理知识库（牛奶蛋白过敏、辅食、便血、深度水解配方等主题）。回答家长问题时必须先检索此知识库，基于检索结果作答。',
  parameters: z.object({
    query: z.string().describe('检索关键词或自然问题，如"深度水解配方怎么选"'),
    riskLevel: z.enum(['low', 'caution', 'emergency']).optional().describe('按风险等级过滤'),
    category: z.string().optional().describe('按条目类别过滤，如 section/table'),
  }),
}

/** 工具执行函数（宿主侧，返回 M02 §4 格式） */
export async function executeSearchKnowledge(input) {
  const query = String(input?.query || '').trim()
  if (!query) {
    return JSON.stringify({ found: false, message: '知识库未找到相关内容' })
  }
  const items = await hybridSearch(query, 5, {
    riskLevel: input?.riskLevel,
    category: input?.category,
  })
  if (items.length === 0) {
    return JSON.stringify({ found: false, message: '知识库未找到相关内容' })
  }
  return JSON.stringify({
    found: true,
    items: items.map((it) => ({
      id: it.id,
      kb_id: it.kb_id,
      title: it.title,
      // 2026-09-04 性能修复：截断单条 content（800 字），避免 5 条全文撑到 18KB+
      // 导致下一轮 LLM prefill 暴涨（实测 in=9144 tokens / 回答生成 3.9s）
      content: it.content.length > CONTENT_MAX_CHARS
        ? it.content.slice(0, CONTENT_MAX_CHARS) + '…（已截断，可缩小范围重查）'
        : it.content,
      content_truncated: it.content.length > CONTENT_MAX_CHARS,
      source: it.source,
      risk_level: it.risk_level,
    })),
    topK: 5,
  })
}
