/**
 * AuthGuard
 *
 * 1. 未登录 → /login
 * 2. 已登录但无家庭/宝宝档案 → /onboarding（onboarding 页本身豁免）
 * 3. 已登录且有档案 → 正常渲染
 */
import { Navigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAppStore } from '@/lib/store'
import { familyApi, babyApi } from '@/lib/api'
import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
}

type Status = 'checking' | 'ready' | 'onboarding' | 'unauthed'

export default function AuthGuard({ children }: Props) {
  const { token, currentFamily, currentBaby, setCurrentFamily, setCurrentBaby } = useAppStore()
  const location = useLocation()
  const isOnboarding = location.pathname === '/onboarding'

  const [status, setStatus] = useState<Status>(() => {
    // 如果 store 里已有缓存，直接 ready（快速路径）
    if (!token) return 'unauthed'
    if (currentFamily && currentBaby) return 'ready'
    return 'checking'
  })

  useEffect(() => {
    if (status !== 'checking') return

    async function check() {
      try {
        const families = await familyApi.getMine()
        if (families.length === 0) {
          setStatus('onboarding')
          return
        }
        const family = families[0]
        setCurrentFamily(family)
        try {
          const baby = await babyApi.get(family.id)
          setCurrentBaby(baby)
          setStatus('ready')
        } catch {
          setStatus('onboarding')
        }
      } catch {
        // 接口报错（如 401）
        setStatus('unauthed')
      }
    }

    check()
  }, [status])

  if (status === 'unauthed') return <Navigate to="/login" replace />

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
