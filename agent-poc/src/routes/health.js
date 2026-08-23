/**
 * GET /health — 探活（M8 tech §6）
 * 缺 key 时 ready=false 不崩溃；FlexDB / DB 联通状态一并上报。
 */
export function healthRoute(config) {
  return (_req, res) => {
    res.json({
      status: 'ok',
      service: 'minicare-agent',
      ready: Boolean(config.deepSeekKey),
      model: config.modelDefault,
      vision: config.modelVision,
      flexdb: Boolean(config.tcbCredentials),
      db: false, // P2 接入 CynosDB 只读连接池后更新
      tokenAuth: Boolean(config.internalToken),
      ts: Date.now(),
    })
  }
}
