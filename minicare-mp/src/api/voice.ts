import Taro from '@tarojs/taro'
import { getToken } from './http'
import { API_BASE_URL } from './base'

export interface VoiceParseResult {
  recordType: string | null
  fields: Record<string, unknown>
  confidence: 'high' | 'low'
  transcript: string
  missingFields: string[] | null
}

export const voiceApi = {
  parse: (familyId: string, tempFilePath: string): Promise<VoiceParseResult> => {
    return new Promise((resolve, reject) => {
      const token = getToken()
      Taro.uploadFile({
        url: `${API_BASE_URL}/api/family/${familyId}/voice/parse`,
        filePath: tempFilePath,
        name: 'audio',
        header: {
          Authorization: token ? `Bearer ${token}` : '',
        },
        timeout: 12000,
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(res.data))
            } catch {
              reject(new Error('解析响应失败'))
            }
          } else {
            try {
              const errData = JSON.parse(res.data)
              reject(new Error(errData.message || `HTTP ${res.statusCode}`))
            } catch {
              reject(new Error(`HTTP ${res.statusCode}`))
            }
          }
        },
        fail: (err) => {
          reject(new Error(err.errMsg || '上传失败'))
        },
      })
    })
  },
}
