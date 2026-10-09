/**
 * CloudBase Storage 封装（图片素材拉取）
 *
 * 用途：M6 图片问诊链路中，agent 服务按 fileId 拉取 COS 图片 → base64 组装 attachment。
 * 与 minicare-server storage.service 同款用法（@cloudbase/node-sdk getTempFileURL）。
 */
import cloudbase from '@cloudbase/node-sdk'

let app = null

/** 惰性初始化（凭证缺失时返回 null，调用方降级） */
export function getStorageApp(envId, credentials) {
  if (!credentials) return null
  if (!app) {
    app = cloudbase.init({
      env: envId,
      secretId: credentials.secretId,
      secretKey: credentials.secretKey,
      ...(credentials.sessionToken ? { sessionToken: credentials.sessionToken } : {}),
    })
  }
  return app
}

/**
 * 获取临时下载 URL
 * @returns {Promise<{ fileID: string; tempFileURL: string } | null>}
 */
export async function getTempDownloadUrl(envId, credentials, fileID) {
  const tcb = getStorageApp(envId, credentials)
  if (!tcb) return null
  try {
    const result = await tcb.getTempFileURL({
      fileList: [{ fileID, maxAge: 3600 }],
    })
    return result?.fileList?.[0] ?? null
  } catch (e) {
    console.error('[storage] getTempFileURL failed:', e?.message || e)
    return null
  }
}
