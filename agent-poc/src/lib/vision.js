/**
 * 图片素材 → OAK attachment（lib/vision.js，M6 tech §3/§5）
 *
 * P0 实测结论（2026-08-23）：
 *   - OAK session.send attachments 的 `file` 类型（本地路径/Uint8Array + mimeType）已被
 *     DeepSeek Anthropic 端点接受并正确解读（base64 image block），无需自组 Anthropic image block；
 *   - 模型用 deepseek-v4-flash-vision-exp（MODEL_VISION）直接路由，无白名单映射；
 *   - 生产链路：fileId → getTempFileURL → 拉取 → Uint8Array → attachment。
 *
 * 隐私：临时 URL 仅服务端持有，不进 SSE 事件。
 */
import { getTempDownloadUrl } from './storage.js'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 单图 10MB 上限（M6 tech §3）

/**
 * 按 fileId 列表拉取 COS 图片并组装 attachment
 * @param {{ fileId: string, mimeType?: string }[]} images
 * @returns {Promise<Array<{type:'file', source:Uint8Array, mimeType:string}|{type:'text', text:string}>>}
 *   拉取失败/超限的图降级为 {type:'text', text:'[image_error]'} 占位，模型仅基于文字回答。
 */
export async function buildImageAttachments(envId, credentials, images = []) {
  const out = []
  for (const img of images) {
    try {
      const item = await getTempDownloadUrl(envId, credentials, img.fileId)
      if (!item?.tempFileURL) {
        out.push({ type: 'text', text: '[image_error]' })
        continue
      }
      const resp = await fetch(item.tempFileURL)
      if (!resp.ok) {
        out.push({ type: 'text', text: '[image_error]' })
        continue
      }
      const buf = new Uint8Array(await resp.arrayBuffer())
      if (buf.byteLength > MAX_IMAGE_BYTES) {
        out.push({ type: 'text', text: '[image_error]' })
        continue
      }
      out.push({
        type: 'file',
        source: buf,
        mimeType: img.mimeType || 'image/jpeg',
      })
    } catch (e) {
      console.error('[vision] 拉取图片失败:', e?.message || e)
      out.push({ type: 'text', text: '[image_error]' })
    }
  }
  return out
}
