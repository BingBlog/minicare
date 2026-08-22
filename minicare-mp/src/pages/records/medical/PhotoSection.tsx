/**
 * 医疗记录 - 图片上传区（拍照或从相册上传病历/检查报告，原图留档，不做 OCR）
 *
 * 功能：
 * - 多图选择（最多 6 张），选中后立即直传 COS（storage/upload-url 拿预签名 URL + PUT 直传）
 * - 上传状态展示：上传中 / 成功 / 失败（点击重试）
 * - 编辑回显：根据已有 photo_ids 批量拉取临时下载 URL
 * - 支持删除、大图预览
 */
import { View, Text, Image, type ITouchEvent } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import { storageApi, type UploadUrlResult } from '@/api/storage'

const MAX_PHOTOS = 6

const ICON_CAMERA = `data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 24 24" fill="none" stroke="#F87098" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>')}`

type PhotoStatus = 'uploading' | 'done' | 'failed'

interface PhotoItem {
  fileID: string // 上传完成后的 fileID；上传中/失败为临时占位 id
  url: string // 展示地址：本地临时路径（未上传完）或 COS 临时 URL（编辑回显）
  tempPath?: string // 本地临时路径，失败重试时复用
  status: PhotoStatus
}

interface Props {
  babyId: string
  value: string[] // 受控：已上传成功的 fileID 列表（photo_ids）
  onChange: (fileIDs: string[]) => void
  showToast: (msg: string) => void
}

export default function PhotoSection({ babyId, value, onChange, showToast }: Props) {
  const [items, setItems] = useState<PhotoItem[]>([])
  // 最新 value 快照，避免并发上传时闭包过期丢失 fileID
  const valueRef = useRef(value)
  valueRef.current = value

  // 外部 value 变化（编辑回显 / 重置）→ 同步 items
  useEffect(() => {
    setItems((prev) => {
      const merged: PhotoItem[] = value.map((fid) => {
        const exist = prev.find((p) => p.fileID === fid)
        return exist ?? { fileID: fid, url: '', status: 'done' }
      })
      return merged
    })
  }, [value])

  // 为缺失展示地址的项批量拉取临时下载 URL（编辑回显）
  useEffect(() => {
    const needUrl = items.filter((p) => p.status === 'done' && !p.url).map((p) => p.fileID)
    if (needUrl.length === 0) return
    storageApi
      .getDownloadUrls(needUrl)
      .then((list) => {
        const urlMap = new Map(list.map((f) => [f.fileID, f.tempFileURL]))
        setItems((prev) => prev.map((p) => (urlMap.has(p.fileID) ? { ...p, url: urlMap.get(p.fileID)! } : p)))
      })
      .catch(() => {
        /* 拉取失败不阻塞表单，预览时以 fileID 兜底 */
      })
  }, [items])

  /**
   * PUT 直传 COS。
   * 注意：不能用 Taro.uploadFile（multipart 表单会污染文件内容），
   * 必须 readFile 读 ArrayBuffer 后走 Taro.request PUT，body 才是纯文件字节。
   * 签名 header 集合与 CloudBase Node SDK uploadFile 保持一致。
   */
  const uploadToCos = (uploadUrl: string, filePath: string, meta: UploadUrlResult, cloudPath: string) =>
    new Promise<void>((resolve, reject) => {
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

  /**
   * 上传前压缩（wx.compressImage）。
   * chooseImage 的 compressed 参数压缩力度有限（iPhone 原图压缩后仍可达 2-4M），
   * 医疗图片仅留档查看，统一压到 1280px 宽 + 80 质量（约 200-400KB）。
   * 压缩失败（个别格式/低版本基础库）则回退用原图。
   */
  const compress = (src: string) =>
    new Promise<string>((resolve) => {
      Taro.compressImage({
        src,
        quality: 80,
        compressedWidth: 1280,
        success: (res) => resolve(res.tempFilePath),
        fail: (err) => {
          console.warn('[PhotoSection] compressImage failed, use original', err)
          resolve(src)
        },
      })
    })

  const uploadOne = async (tempPath: string) => {
    const tmpId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`
    setItems((prev) => [...prev, { fileID: tmpId, url: tempPath, tempPath, status: 'uploading' }])
    try {
      const uploadPath = await compress(tempPath)
      const cloudPath = `medical/${babyId || 'pending'}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
      const meta = await storageApi.getUploadUrl(cloudPath)
      await uploadToCos(meta.uploadUrl, uploadPath, meta, cloudPath)
      setItems((prev) => prev.map((p) => (p.fileID === tmpId ? { fileID: meta.fileID, url: tempPath, status: 'done' } : p)))
      onChange([...valueRef.current, meta.fileID])
    } catch {
      setItems((prev) => prev.map((p) => (p.fileID === tmpId ? { ...p, status: 'failed' } : p)))
      showToast('图片上传失败，请重试')
    }
  }

  const handleChoose = () => {
    const remain = MAX_PHOTOS - items.length
    if (remain <= 0) {
      showToast(`最多上传 ${MAX_PHOTOS} 张图片`)
      return
    }
    Taro.chooseImage({
      count: remain,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        res.tempFilePaths.forEach((path) => uploadOne(path))
      },
    })
  }

  const handleRemove = (fileID: string) => {
    setItems((prev) => prev.filter((p) => p.fileID !== fileID))
    onChange(valueRef.current.filter((fid) => fid !== fileID))
  }

  const handlePreview = (item: PhotoItem) => {
    const urls = items.filter((p) => p.status === 'done').map((p) => p.url || p.fileID)
    const current = item.url || item.fileID
    if (urls.length > 0) Taro.previewImage({ urls, current })
  }

  const handleItemTap = (item: PhotoItem) => {
    if (item.status === 'failed') {
      if (item.tempPath) uploadOne(item.tempPath)
      return
    }
    if (item.status === 'done') handlePreview(item)
  }

  return (
    <View className='medical-photo'>
      <View className='medical-photo__grid'>
        {items.map((item) => (
          <View key={item.fileID} className='medical-photo__item' onClick={() => handleItemTap(item)}>
            <Image
              className={`medical-photo__thumb ${item.status !== 'done' ? 'medical-photo__thumb--muted' : ''}`}
              src={item.url}
              mode='aspectFill'
            />
            {item.status === 'uploading' && (
              <View className='medical-photo__mask'>
                <Text className='medical-photo__mask-text'>上传中…</Text>
              </View>
            )}
            {item.status === 'failed' && (
              <View className='medical-photo__mask'>
                <Text className='medical-photo__mask-text'>上传失败{'\n'}点击重试</Text>
              </View>
            )}
            <View
              className='medical-photo__remove'
              onClick={(e: ITouchEvent) => {
                e.stopPropagation()
                handleRemove(item.fileID)
              }}
            >
              <Text className='medical-photo__remove-icon'>×</Text>
            </View>
          </View>
        ))}

        {items.length < MAX_PHOTOS && (
          <View className='medical-photo__add' onClick={handleChoose}>
            <Image className='medical-photo__add-icon' src={ICON_CAMERA} />
            <Text className='medical-photo__add-text'>添加图片</Text>
          </View>
        )}
      </View>
      <Text className='medical-photo__hint'>
        支持拍照或从相册上传病历、检查报告等图片，原图留档保存（最多 {MAX_PHOTOS} 张）
      </Text>
    </View>
  )
}
