import Taro from '@tarojs/taro'

export function extractVoiceFields(): Record<string, string> {
  const instance = Taro.getCurrentInstance()
  const params = instance.router?.params ?? {}
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    if (key.startsWith('voice_') && value) {
      result[key.replace('voice_', '')] = value
    }
  }
  return result
}

export function hasVoiceFields(): boolean {
  return Object.keys(extractVoiceFields()).length > 0
}
