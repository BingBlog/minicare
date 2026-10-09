import Taro from '@tarojs/taro'
import { useState, useEffect } from 'react'
import { fetchAppConfig } from '@/api'
import type { ScheduleItemTypeConfig } from '@/lib/schedule'

interface EnumOption {
  value: string
  label: string
}

interface AppConfig {
  version?: string
  enums: Record<string, EnumOption[]>
  limits?: Record<string, unknown>
  supplements?: Array<{ key: string; label: string; unit: string; hint: string; group: string }>
  /** 日程项类型清单（PRD-009） */
  scheduleItemTypes?: ScheduleItemTypeConfig
}

const CACHE_KEY = 'minicare_app_config'

let cachedConfig: AppConfig | null = null
let fetchPromise: Promise<AppConfig> | null = null

function loadFromCache(): AppConfig | null {
  if (cachedConfig) return cachedConfig
  try {
    const raw = Taro.getStorageSync(CACHE_KEY)
    if (raw) {
      cachedConfig = raw as AppConfig
      return cachedConfig
    }
  } catch { /* ignore */ }
  return null
}

function saveToCache(config: AppConfig): void {
  try {
    Taro.setStorageSync(CACHE_KEY, config)
    cachedConfig = config
  } catch { /* ignore */ }
}

async function loadConfig(): Promise<AppConfig> {
  if (!fetchPromise) {
    fetchPromise = fetchAppConfig().then((fresh) => {
      const cfg = fresh as unknown as AppConfig
      saveToCache(cfg)
      return cfg
    })
  }
  return fetchPromise
}

export function useAppConfig() {
  const [config, setConfig] = useState<AppConfig | null>(loadFromCache)
  const [loading, setLoading] = useState(!loadFromCache())

  useEffect(() => {
    let cancelled = false
    loadConfig()
      .then((fresh) => {
        if (!cancelled) {
          setConfig(fresh)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const getLabel = (enumKey: string, value: string): string => {
    const options = config?.enums[enumKey] ?? []
    return options.find((o) => o.value === value)?.label ?? value
  }

  const getOptions = (enumKey: string): EnumOption[] => {
    return config?.enums[enumKey] ?? []
  }

  return { config, loading, getLabel, getOptions }
}
