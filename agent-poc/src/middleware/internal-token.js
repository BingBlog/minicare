/**
 * 内部鉴权中间件（middleware/internal-token.js，M8 tech §3）
 *
 * - 校验 x-agent-token（timingSafeEqual 防时序攻击）；
 * - 解析 x-agent-ctx（base64 { userId, familyId, babyId }）并做 UUID 结构校验；
 * - AGENT_INTERNAL_TOKEN 未配置时跳过鉴权并告警（开发兜底，生产必须配置）。
 */
import { timingSafeEqual } from 'node:crypto'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(s) {
  return typeof s === 'string' && UUID_RE.test(s)
}

export function internalToken(config) {
  return (req, res, next) => {
    // /health 放行（CloudRun 探活，M8 tech §3.1）
    if (req.path === '/health') return next()
    if (!config.internalToken) {
      console.warn('[middleware] AGENT_INTERNAL_TOKEN 未配置，已跳过鉴权（生产必须配置）')
      return next()
    }
    const token = req.get('x-agent-token')
    if (!token) {
      return res.status(401).json({ error: 'unauthorized' })
    }
    const a = Buffer.from(token)
    const b = Buffer.from(config.internalToken)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return res.status(401).json({ error: 'unauthorized' })
    }

    // ctx 可选：带了就校验结构（生产由 minicare-server 注入）
    const raw = req.get('x-agent-ctx')
    if (raw) {
      try {
        const ctx = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))
        if (ctx.userId && !isUuid(ctx.userId)) return res.status(400).json({ error: 'bad ctx: userId must be UUID' })
        if (ctx.familyId && !isUuid(ctx.familyId)) return res.status(400).json({ error: 'bad ctx: familyId must be UUID' })
        if (ctx.babyId && !isUuid(ctx.babyId)) return res.status(400).json({ error: 'bad ctx: babyId must be UUID' })
        req.ctx = ctx
      } catch {
        return res.status(400).json({ error: 'bad ctx: invalid base64 JSON' })
      }
    }
    next()
  }
}
