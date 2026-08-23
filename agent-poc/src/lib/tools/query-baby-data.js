/**
 * query_baby_data 工具（M3 数据查询）
 *
 * 查询宝宝健康记录（喂养/睡眠/尿布/生长/健康/表现/活动），按时间窗聚合。
 * babyId 由服务端 ctx 注入（模型不可见、不可改），越权由 minicare-server 代理层拦截。
 */
import { z } from 'zod'
import { queryMetric, METRICS } from '../query.js'

export const QUERY_BABY_DATA_TOOL = {
  name: 'query_baby_data',
  description:
    '查询宝宝健康记录（喂养/睡眠/尿布/生长/健康/表现/活动），支持最近 1-90 天，可按天聚合或取明细。回答"宝宝今天喝了多少奶/睡了多久/长了多少"等自家宝宝数据问题时必须调用，结果带统计口径。',
  parameters: z.object({
    metric: z.enum(METRICS).describe('查询维度'),
    days: z.number().int().min(1).max(90).optional().describe('时间窗天数，默认 7'),
    aggregate: z.enum(['list', 'sum', 'avg', 'count', 'trend']).optional().describe('list=明细 / sum=合计 / avg=平均 / count=条数 / trend=按天趋势'),
  }),
}

export async function executeQueryBabyData(input, ctx) {
  const babyId = ctx?.babyId
  if (!babyId) {
    return JSON.stringify({ ok: false, error: '缺少 babyId 上下文，无法查询宝宝数据' })
  }
  const res = await queryMetric(babyId, input.metric, input.days, input.aggregate)
  return JSON.stringify({
    ok: res.ok,
    metric: res.metric,
    days: res.days,
    aggregate: res.aggregate,
    hasData: res.hasData,
    count: res.count,
    rows: res.rows,
    summary: res.summary,
    note: res.note,
    error: res.error || undefined,
  })
}
