/**
 * 图片素材 → Anthropic content blocks（lib/vision.js，2026-09-04 SDK 直连改造）
 *
 * P0 实测结论（2026-08-23，OAK 时期）：
 *   - DeepSeek Anthropic 端点接受 base64 image block 并正确解读（vision-exp 模型）；
 *   - 生产链路：fileId → getTempFileURL → 拉取 → base64 → image block。
 *
 * 直连 SDK 后附件不再走 OAK attachment 格式，直接产出 Anthropic Messages API 的
 * content blocks（与 SDKUserMessage.message.content 同构）。
 *
 * 隐私：图片内容仅服务端持有，不进 SSE 事件。
 */
import { getTempDownloadUrl } from './storage.js'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 单图 10MB 上限（M6 tech §3）

/**
 * 按 fileId 列表拉取 COS 图片并组装 image content blocks
 * @param {{ fileId: string, mimeType?: string }[]} images
 * @returns {Promise<Array<{type:'text',text:string}|{type:'image',source:{type:'base64',media_type:string,data:string}}>>}
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
      const buf = Buffer.from(await resp.arrayBuffer())
      if (buf.byteLength > MAX_IMAGE_BYTES) {
        out.push({ type: 'text', text: '[image_error]' })
        continue
      }
      out.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: img.mimeType || 'image/jpeg',
          data: buf.toString('base64'),
        },
      })
    } catch (e) {
      console.error('[vision] 拉取图片失败:', e?.message || e)
      out.push({ type: 'text', text: '[image_error]' })
    }
  }
  return out
}
