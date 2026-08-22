/**
 * 最小知识库：内存向量检索（POC 用）
 * 模拟"知识库 MCP 的检索服务"——真实环境这里会换成 PG pgvector / COS Vector + MCP server
 */
const KNOWLEDGE = [
  {
    id: 'kb-001',
    topic: '牛奶蛋白过敏',
    tags: ['CMPA', '牛奶过敏', '深度水解', '氨基酸'],
    content:
      '牛奶蛋白过敏（CMPA）婴幼儿首选深度水解配方（eHF）或氨基酸配方（AAF）。深度水解配方将乳清蛋白水解为小分子肽，适用于大多数轻中度 CMPA；氨基酸配方不含完整蛋白肽段，用于重度或对 eHF 不耐受者。治疗期间需严格回避牛奶及含乳制品至少 2-4 周观察症状改善。',
  },
  {
    id: 'kb-002',
    topic: '辅食添加时机',
    tags: ['辅食', '添加', '6个月', '排敏'],
    content:
      '世界卫生组织建议纯母乳喂养至 6 月龄，满 6 月龄后逐步添加辅食。敏宝添加新食物遵循"每次只加一种、少量开始、观察 3-5 天"原则，新食物安排在上午添加以便观察反应。',
  },
  {
    id: 'kb-003',
    topic: '便血与就医',
    tags: ['便血', '血丝便', '就医', '急诊'],
    content:
      '宝宝出现便血：若为少量血丝便且精神状态好、奶量正常，可先记录并观察，通常与食物蛋白过敏有关；若出现大量鲜血便、面色苍白、精神萎靡、持续哭闹或发热，需立即就医。',
  },
  {
    id: 'kb-004',
    topic: '深度水解配方口味',
    tags: ['口味', '深度水解', '苦味', '接受度'],
    content:
      '深度水解配方因蛋白水解产生苦味肽，口味较普通配方差，部分宝宝接受度低。可尝试少量多次适应、冷藏后喂养（减轻苦味）、与喂奶间隔配合，一般 1-2 周内多数宝宝可接受。',
  },
]

/**
 * 简单关键词检索（真实环境替换为向量检索）
 * @param {string} query
 * @returns {{id: string, topic: string, content: string, score: number}[]}
 */
export function searchKnowledge(query) {
  const q = query.toLowerCase()
  const scored = KNOWLEDGE.map((doc) => {
    const text = (doc.topic + ' ' + doc.tags.join(' ') + ' ' + doc.content).toLowerCase()
    let score = 0
    // 按关键词命中次数打分（中文按子串匹配）
    for (const kw of q.split(/[\s，。、？?！!：:；;,.]+/).filter(Boolean)) {
      if (kw.length < 2) continue
      if (text.includes(kw)) score += kw.length
    }
    // 补充主题词匹配
    for (const tag of doc.tags) {
      if (q.includes(tag)) score += 5
    }
    return { ...doc, score }
  })
  return scored
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
}

/** 给模型看的工具描述 */
// ⚠️ OAK 的 ToolDefinition.parameters 必须是 zod schema（源码直接透传 SDK 的 tool()）
import { z } from 'zod'

export const KNOWLEDGE_TOOL_DEF = {
  name: 'search_knowledge',
  description:
    '检索宝宝护理知识库（牛奶蛋白过敏、辅食、便血、深度水解配方等主题）。回答家长问题时必须先检索此知识库，基于检索结果作答。',
  parameters: z.object({
    query: z.string().describe('检索关键词，如"深度水解配方"'),
  }),
}

/** 工具执行函数（会被包装成 MCP server 注入 agent） */
export async function executeSearchKnowledge(input) {
  const results = searchKnowledge(input.query)
  if (results.length === 0) {
    return JSON.stringify({ found: false, message: '知识库未找到相关内容' })
  }
  return JSON.stringify(
    results.map((r) => ({ id: r.id, topic: r.topic, content: r.content })),
  )
}
