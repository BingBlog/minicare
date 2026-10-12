/**
 * POST /vision/parse-medical —— 就医记录·单据解析端点（PRD-017 / TECH-035）
 *
 * 入参: { fileIds: string[] }（1~6 张 cloud:// fileID；归属校验由 minicare-server 完成）
 * 出参: { results: [
 *          { fileId, ok:true, docType, confidence, lowConfidenceFields, data },
 *          { fileId, ok:false, error:{code,message} } ] }
 * 鉴权: x-agent-token —— 全局 internalToken 中间件已覆盖（server.js），本文件不处理。
 *
 * 边界：一次性工具型调用——不走对话 SDK 循环、不建会话、不写会话历史、不进 FlexDB trace。
 */
import { parseMedicalImages } from '../lib/parse-medical.js'

const MAX_FILES = 6

export function parseMedicalRoute(config) {
  return async (req, res) => {
    const { fileIds } = req.body || {}
    const valid = Array.isArray(fileIds) && fileIds.length > 0 && fileIds.length <= MAX_FILES &&
      fileIds.every((x) => typeof x === 'string' && x.startsWith('cloud://'))
    if (!valid) {
      return res.status(400).json({ error: `fileIds 必须为 1~${MAX_FILES} 个 cloud:// 开头的字符串` })
    }
    if (!config.deepSeekKey) {
      return res.status(503).json({ error: 'DEEPSEEK_API_KEY 未配置，解析不可用' })
    }
    const t0 = Date.now()
    try {
      const results = await parseMedicalImages(fileIds, { config })
      const okCount = results.filter((r) => r.ok).length
      console.log(`[parse-medical] ${okCount}/${fileIds.length} 成功，${Date.now() - t0}ms`)
      res.json({ results })
    } catch (e) {
      console.error('[parse-medical] unexpected:', e?.message || e)
      res.status(500).json({ error: String(e?.message || e) })
    }
  }
}
