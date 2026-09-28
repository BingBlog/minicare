/**
 * 工具注册表（lib/tools/index.js）
 *
 * 统一管理全部工具的定义与执行函数。execute 签名统一为 (input, ctx)，
 * ctx 由服务端注入（{ userId, familyId, babyId }，模型不可见）。
 */
import { KNOWLEDGE_TOOL_DEF, executeSearchKnowledge } from './search-knowledge.js'
import { QUERY_BABY_DATA_TOOL, executeQueryBabyData } from './query-baby-data.js'
import { ANALYZE_BABY_DATA_TOOL, executeAnalyzeBabyData } from './analyze-baby-data.js'
import { GENERATE_DIARY_TOOL, executeGenerateDiary } from './generate-diary.js'

export const TOOLS = [
  { def: KNOWLEDGE_TOOL_DEF, execute: executeSearchKnowledge },
  { def: QUERY_BABY_DATA_TOOL, execute: executeQueryBabyData },
  { def: ANALYZE_BABY_DATA_TOOL, execute: executeAnalyzeBabyData },
  { def: GENERATE_DIARY_TOOL, execute: executeGenerateDiary },
]

export const TOOL_NAMES = TOOLS.map((t) => t.def.name)

/** 按工具名取执行函数（chat.js 分发用）；未知工具返回 null */
export function getToolExecutor(name) {
  const t = TOOLS.find((t) => t.def.name === name)
  return t ? t.execute : null
}
