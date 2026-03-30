import { Navigate } from 'react-router-dom'
import { useAppStore } from '@/lib/store'
import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
}

export default function AuthGuard({ children }: Props) {
  const token = useAppStore((s) => s.token)

  if (!token) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
