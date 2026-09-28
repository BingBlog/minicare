/**
 * 图片压缩 + COS 直传 —— H5 端实现（多端文件，构建时替换 uploadImage.ts）
 *
 * 与 weapp 版（uploadImage.ts）导出签名完全一致：
 *   - compressImage：H5 用 canvas 缩放 + JPEG 编码（Taro.compressImage 为 weapp-only）
 *   - uploadToCos：H5 无 FileSystemManager，fetch(blob:/data: URL) → Blob → fetch PUT
 * 签名 header 集合与 weapp 版保持一致（缺任一 → 403 SignatureDoesNotMatch）。
 *
 * 前置条件：COS 桶需允许 H5 站点来源的跨域 PUT（浏览器环境强制 CORS，weapp 无此限制）。
 */
import Taro from '@tarojs/taro'
import { storageApi, type UploadUrlResult } from '@/api/storage'

const DEFAULT_QUALITY = 80
const DEFAULT_WIDTH = 1280

/** 压缩（失败回退原图，不阻塞上传）。返回 data: URL（作为后续上传的 tempPath）。 */
export function compressImage(src: string, quality = DEFAULT_QUALITY, width = DEFAULT_WIDTH): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const scale = Math.min(1, width / (img.naturalWidth || width))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('canvas 2d context unavailable')
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality / 100))
      } catch (err) {
        // 画布被跨域内容污染等场景：回退原图
        console.warn('[uploadImage.h5] compress failed, use original', err)
        resolve(src)
      }
    }
    img.onerror = (err) => {
      console.warn('[uploadImage.h5] image load failed, use original', err)
      resolve(src)
    }
    img.src = src
  })
}

/** PUT 直传 COS（5 个签名 header，缺任一 → 403 SignatureDoesNotMatch） */
export function uploadToCos(uploadUrl: string, filePath: string, meta: UploadUrlResult, cloudPath: string): Promise<void> {
  const headers: Record<string, string> = {
    Signature: meta.signature,
    authorization: meta.signature,
    'x-cos-security-token': meta.cosToken,
    'x-cos-meta-fileid': meta.cosFileId,
    key: encodeURIComponent(cloudPath),
    'Content-Type': 'application/octet-stream',
  }
  return fetch(filePath) // blob: / data: URL 浏览器原生支持
    .then((res) => {
      if (!res.ok) throw new Error(`读取本地图片失败: HTTP ${res.status}`)
      return res.blob()
    })
    .then((blob) =>
      fetch(uploadUrl, { method: 'PUT', headers, body: blob }).then((res) => {
        if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`)
      }),
    )
}

/**
 * 选择图片 → 压缩 → COS 直传，返回 fileID 列表（顺序与选择一致）
 *
 * @param cloudDir COS 目录前缀（如 'chat' / 'diary'），实际路径 cloudDir/{babyId}/{ts}-{rand}.jpg
 * @param babyId   归属宝宝（防越权引用）
 * @param count    最多选图数
 */
export async function chooseAndUploadImages(
  cloudDir: string,
  babyId: string,
  count: number,
  opts?: { quality?: number; width?: number },
): Promise<string[]> {
  const res = await Taro.chooseImage({
    count,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
  })
  const fileIDs: string[] = []
  for (const path of res.tempFilePaths) {
    const fileID = await uploadOne(cloudDir, babyId, path, opts)
    fileIDs.push(fileID)
  }
  return fileIDs
}

/** 单张压缩上传，返回 fileID */
export async function uploadOne(
  cloudDir: string,
  babyId: string,
  tempPath: string,
  opts?: { quality?: number; width?: number },
): Promise<string> {
  const uploadPath = await compressImage(tempPath, opts?.quality, opts?.width)
  const cloudPath = `${cloudDir}/${babyId || 'pending'}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
  const meta = await storageApi.getUploadUrl(cloudPath)
  await uploadToCos(meta.uploadUrl, uploadPath, meta, cloudPath)
  return meta.fileID
}

/** fileID 列表 → 临时下载 URL Map（展示用，失效自动刷新） */
export async function fetchTempUrls(fileIDs: string[]): Promise<Map<string, string>> {
  if (fileIDs.length === 0) return new Map()
  try {
    const list = await storageApi.getDownloadUrls(fileIDs)
    return new Map(list.map((f) => [f.fileID, f.tempFileURL]))
  } catch {
    return new Map()
  }
}
