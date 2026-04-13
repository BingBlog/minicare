import { useState, useEffect, useContext, createContext } from 'react'
import { fetchAppConfig, type AppConfig, type EnumOption } from '@/api/appConfig'

// ── 缓存 key ─────────────────────────────────────────────────────
const CACHE_KEY = 'minicare_app_config'

function loadCached(): AppConfig | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AppConfig
  } catch {
    return null
  }
}

function saveCache(config: AppConfig): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(config))
  } catch {
    // 存储空间不足时静默忽略
  }
}

// ── Context ───────────────────────────────────────────────────────

export interface AppConfigContextValue {
  config: AppConfig | null
  loading: boolean
  /** 按枚举 key 和 value 取中文 label，取不到时返回 value 原值 */
  getLabel: (enumKey: keyof AppConfig['enums'], value: string) => string
  /** 按枚举 key 获取完整选项列表 */
  getOptions: (enumKey: keyof AppConfig['enums']) => EnumOption[]
}

export const AppConfigContext = createContext<AppConfigContextValue>({
  config: null,
  loading: true,
  getLabel: (_enumKey, value) => value,
  getOptions: () => [],
})

// ── Provider 数据逻辑（供 App.tsx 使用） ──────────────────────────

/**
 * 在 App 根节点调用，负责预加载配置并提供给全局 Context。
 * 采用"缓存优先 + 后台刷新"策略：
 *   1. 立即读取 localStorage 缓存，立即渲染（避免闪白）
 *   2. 在后台发请求，若版本更新则刷新状态并写入新缓存
 */
export function useAppConfigProvider(): AppConfigContextValue {
  const [config, setConfig] = useState<AppConfig | null>(loadCached)
  const [loading, setLoading] = useState<boolean>(() => !loadCached())

  useEffect(() => {
    let cancelled = false

    fetchAppConfig()
      .then((fresh) => {
        if (cancelled) return
        // 仅当版本发生变化（或首次加载）时更新状态
        setConfig((prev) => {
          if (!prev || prev.version !== fresh.version) {
            saveCache(fresh)
            return fresh
          }
          return prev
        })
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const getLabel = (enumKey: keyof AppConfig['enums'], value: string): string => {
    const options = (config?.enums[enumKey] ?? []) as EnumOption[]
    return options.find((o) => o.value === value)?.label ?? value
  }

  const getOptions = (enumKey: keyof AppConfig['enums']): EnumOption[] => {
    return (config?.enums[enumKey] ?? []) as EnumOption[]
  }

  return { config, loading, getLabel, getOptions }
}

// ── Consumer Hook ─────────────────────────────────────────────────

/**
 * 在任意组件中消费全局配置
 * @example
 *   const { getLabel, getOptions, config } = useAppConfig()
 *   getLabel('sleepPeriod', 'night')       // → '夜觉'
 *   getOptions('feedType')                  // → [{ value: 'breast', label: '母乳', int: 1 }, ...]
 *   config?.limits.feverThreshold          // → 37.5
 */
export function useAppConfig(): AppConfigContextValue {
  return useContext(AppConfigContext)
}
