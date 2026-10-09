import { useEffect, useState } from 'react'

export interface AsyncState<T> {
  loading: boolean
  error: Error | null
  data: T | null
}

/**
 * 极简数据加载 hook：把「加载中 / 出错 / 数据」三态收敛成一处，
 * 让 15 个页面不用各写一遍 useEffect + try/catch。
 *
 * `deps` 变化即重新拉取；组件卸载后不再 setState（避免竞态）。
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ loading: true, error: null, data: null })

  useEffect(() => {
    let alive = true
    setState({ loading: true, error: null, data: null })
    fn()
      .then((data) => {
        if (alive) setState({ loading: false, error: null, data })
      })
      .catch((e: unknown) => {
        if (alive) setState({ loading: false, error: e as Error, data: null })
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return state
}
