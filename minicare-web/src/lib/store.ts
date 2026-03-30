/**
 * 全局状态管理（Zustand）
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, Family, Baby } from './api'

interface AppState {
  // 用户
  user: User | null
  token: string | null
  setUser: (user: User, token: string) => void
  logout: () => void

  // 家庭（所有业务的根节点）
  currentFamily: Family | null
  setCurrentFamily: (family: Family) => void

  // 当前宝宝
  currentBaby: Baby | null
  setCurrentBaby: (baby: Baby) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      setUser: (user, token) => {
        localStorage.setItem('minicare_token', token)
        set({ user, token })
      },
      logout: () => {
        localStorage.removeItem('minicare_token')
        set({ user: null, token: null, currentFamily: null, currentBaby: null })
      },

      currentFamily: null,
      setCurrentFamily: (family) => set({ currentFamily: family }),

      currentBaby: null,
      setCurrentBaby: (baby) => set({ currentBaby: baby }),
    }),
    {
      name: 'minicare-store',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        currentFamily: state.currentFamily,
        currentBaby: state.currentBaby,
      }),
    }
  )
)
