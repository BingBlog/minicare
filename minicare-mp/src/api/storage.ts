import { request } from './http'

export interface UploadUrlResult {
  fileID: string
  uploadUrl: string
  cosToken: string
  /** COS 签名（PUT 直传时作为 Signature / authorization header） */
  signature: string
  /** COS 文件 ID（PUT 直传时作为 x-cos-meta-fileid header） */
  cosFileId: string
}

export interface DownloadUrlItem {
  fileID: string
  tempFileURL: string
}

/**
 * 云存储 API（客户端直传 COS）
 *
 * - getUploadUrl：获取预签名上传 URL + fileID，客户端 PUT 直传
 * - getDownloadUrls：批量获取临时下载 URL（有效期 1 小时），用于列表/编辑回显
 */
export const storageApi = {
  getUploadUrl: (cloudPath: string): Promise<UploadUrlResult> =>
    request<UploadUrlResult>('/api/storage/upload-url', {
      method: 'POST',
      data: { cloudPath },
    }),

  getDownloadUrls: (fileIDs: string[]): Promise<DownloadUrlItem[]> =>
    request<DownloadUrlItem[]>('/api/storage/download-urls', {
      method: 'POST',
      data: { fileIDs },
    }),
}
