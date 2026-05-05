/**
 * AuthGuard
 *
 * 1. 未登录 → 根据 allowGuest 决定是否放行：
 *    - allowGuest=true: 正常渲染子组件（页面内自行判断游客状态）
 *    - allowGuest=false: → /login
 * 2. 已登录但无家庭/宝宝档案 → /onboarding（onboarding 页本身豁免）
 * 3. 已登录且有档案 → 正常渲染
 */
import { Navigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAppStore } from '@/lib/store'
import { familyApi, babyApi } from '@/api'
import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** 是否允许未登录用户访问（游客模式），默认 false */
  allowGuest?: boolean
}

type Status = 'checking' | 'ready' | 'onboarding' | 'unauthed' | 'guest'

export default function AuthGuard({ children, allowGuest = false }: Props) {
  const { token, currentFamily, currentBaby, setCurrentFamily, setCurrentBaby } = useAppStore()
  const location = useLocation()
  const isOnboarding = location.pathname === '/onboarding'

  const [status, setStatus] = useState<Status>(() => {
    if (!token) return allowGuest ? 'guest' : 'unauthed'
    if (currentFamily && currentBaby) return 'ready'
    return 'checking'
  })

  useEffect(() => {
    if (status === 'checking' && currentFamily && currentBaby) {
      setStatus('ready')
      return
    }

    if (status !== 'checking') return

    let cancelled = false

    async function check() {
      try {
        const families = await familyApi.getMine()
        if (cancelled) return
        if (families.length === 0) {
          setStatus('onboarding')
          return
        }
        const family = families[0]
        setCurrentFamily(family)
        try {
          const baby = await babyApi.get(family.id)
          if (cancelled) return
          setCurrentBaby(baby)
          setStatus('ready')
        } catch {
          if (cancelled) return
          setStatus('onboarding')
        }
      } catch {
        if (cancelled) return
        setStatus(allowGuest ? 'guest' : 'unauthed')
      }
    }

    check()

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, currentFamily, currentBaby])

  // store 里的 family/baby 被外部更新（如 onboarding 创建完成），
  // 把 status 也同步升为 ready
  useEffect(() => {
    if (currentFamily && currentBaby && status === 'onboarding') {
      setStatus('ready')
    }
  }, [currentFamily, currentBaby, status])

  if (status === 'unauthed') return <Navigate to="/login" replace />

  // 游客模式：直接渲染子组件，页面内自行判断
  if (status === 'guest') return <>{children}</>

  if (status === 'checking') {
    return (
      <div className="flex items-center justify-center h-screen bg-bg">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // 需要建档但当前不在 onboarding 页 → 跳转
  if (status === 'onboarding' && !isOnboarding) {
    return <Navigate to="/onboarding" replace />
  }

  return <>{children}</>
}
