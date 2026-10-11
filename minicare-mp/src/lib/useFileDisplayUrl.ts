/**
 * useFileDisplayUrl — fileID → 临时展示 URL（COS）
 *
 * 头像等「存 fileID、展示需临时 URL」的场景统一用本 hook：
 * fileID 为空返回 ''；fileID 变化时自动重新解析（如换头像后）。
 */
import { useEffect, useState } from 'react'
import { fetchTempUrls } from './uploadImage'

export function useFileDisplayUrl(fileID: string | null | undefined): string {
  const [url, setUrl] = useState('')

  useEffect(() => {
    if (!fileID) {
      setUrl('')
      return
    }
    let cancelled = false
    fetchTempUrls([fileID]).then((map) => {
      if (!cancelled) setUrl(map.get(fileID) ?? '')
    })
    return () => {
      cancelled = true
    }
  }, [fileID])

  return url
}
