/**
 * 图片压缩 + COS 直传公共函数（复用 medical PhotoSection 已验证链路）
 *
 * 注意：不能用 Taro.uploadFile（multipart 表单会污染 COS 文件内容），
 * 必须 readFile 读 ArrayBuffer 后走 Taro.request PUT，body 才是纯文件字节。
 * 签名 header 集合与 CloudBase Node SDK uploadFile 保持一致（2026-08-22 踩坑总结）。
 */
import Taro from '@tarojs/taro'
import { storageApi, type UploadUrlResult } from '@/api/storage'

const DEFAULT_QUALITY = 80
const DEFAULT_WIDTH = 1280

/** 压缩（失败回退原图，不阻塞上传） */
export function compressImage(src: string, quality = DEFAULT_QUALITY, width = DEFAULT_WIDTH): Promise<string> {
  return new Promise((resolve) => {
    Taro.compressImage({
      src,
      quality,
      compressedWidth: width,
      success: (res) => resolve(res.tempFilePath),
      fail: (err) => {
        console.warn('[uploadImage] compressImage failed, use original', err)
        resolve(src)
      },
    })
  })
}

/** PUT 直传 COS（5 个签名 header，缺任一 → 403 SignatureDoesNotMatch） */
export function uploadToCos(uploadUrl: string, filePath: string, meta: UploadUrlResult, cloudPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    Taro.getFileSystemManager().readFile({
      filePath,
      success: (fsRes) => {
        Taro.request({
          url: uploadUrl,
          method: 'PUT',
          data: fsRes.data,
          header: {
            Signature: meta.signature,
            authorization: meta.signature,
            'x-cos-security-token': meta.cosToken,
            'x-cos-meta-fileid': meta.cosFileId,
            key: encodeURIComponent(cloudPath),
            'Content-Type': 'application/octet-stream',
          },
          timeout: 30000,
          success: (res) => {
            if (res.statusCode >= 200 && res.statusCode < 300) resolve()
            else reject(new Error(`HTTP ${res.statusCode}`))
          },
          fail: (err) => reject(new Error(err.errMsg || '上传失败')),
        })
      },
      fail: (err) => reject(new Error(err.errMsg || '读取文件失败')),
    })
  })
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
