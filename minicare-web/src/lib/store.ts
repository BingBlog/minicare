/**
 * 全局状态管理（Zustand）
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, Family, Baby } from './api'

/** 切换宝宝弹层数据：激活的新家庭 + 对应宝宝 */
export interface SwitchBabyOption {
  family: Family
  baby: Baby | null
}

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

  /**
   * 切换宝宝引导弹层数据
   * 登录激活 pending 邀请后，若用户已有其他家庭，则将新激活的家庭+宝宝存入此处，
   * AppLayout 中监听并展示引导弹层。
   */
  pendingSwitchOptions: SwitchBabyOption[]
  setPendingSwitchOptions: (options: SwitchBabyOption[]) => void
  clearPendingSwitchOptions: () => void
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
        set({ user: null, token: null, currentFamily: null, currentBaby: null, pendingSwitchOptions: [] })
      },

      currentFamily: null,
      setCurrentFamily: (family) => set({ currentFamily: family }),

      currentBaby: null,
      setCurrentBaby: (baby) => set({ currentBaby: baby }),

      pendingSwitchOptions: [],
      setPendingSwitchOptions: (options) => set({ pendingSwitchOptions: options }),
      clearPendingSwitchOptions: () => set({ pendingSwitchOptions: [] }),
    }),
    {
      name: 'minicare-store',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        currentFamily: state.currentFamily,
        currentBaby: state.currentBaby,
        // pendingSwitchOptions 不持久化（仅内存状态）
      }),
    }
  )
)