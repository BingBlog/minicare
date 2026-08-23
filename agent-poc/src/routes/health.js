/**
 * GET /health — 探活（M8 tech §6）
 * 缺 key 时 ready=false 不崩溃；FlexDB / DB 联通状态一并上报。
 */
import { pingDb } from '../lib/db.js'

export function healthRoute(config) {
  return async (_req, res) => {
    const db = config.db ? await pingDb() : false
    res.json({
      status: 'ok',
      service: 'minicare-agent',
      ready: Boolean(config.deepSeekKey),
      model: config.modelDefault,
      vision: config.modelVision,
      flexdb: Boolean(config.tcbCredentials),
      db, // 知识库只读连接（P1）：SELECT 1 探测
      embedding: Boolean(config.tokenHubKey),
      tokenAuth: Boolean(config.internalToken),
      ts: Date.now(),
    })
  }
}
