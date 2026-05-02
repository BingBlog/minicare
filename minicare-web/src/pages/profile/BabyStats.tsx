/**
 * BabyStats 宝宝生长指标迷你数据格
 *
 * 横向 4 格均等分布，展示：身高 / 体重 / 头围 / 稳定期（天数）。
 * 数据来源：自动请求 /records/growth 获取最近一条记录，未有数据时显示"—"占位。
 *
 * 被引用：ProfilePage.tsx
 */
import { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { useAppStore } from '@/lib/store'
import { recordsApi } from '@/api'

/** 单格统计数据结构 */
interface StatItem {
  /** 数值字符串（无数据时填"—"） */
  val: string
  /** 单位（如"cm"、"kg"、"天"） */
  unit: string
  /** 指标名称（如"身高"） */
  name: string
}

/**
 * 宝宝生长指标迷你数据格组件
 *
 * 无需传入任何 props，组件内部自动从 growth API 读取最新数据。
 *
 * @example
 * <BabyStats />
 */
export default function BabyStats() {
  const { currentFamily, currentBaby } = useAppStore()
  const location = useLocation()

  // 从最近一条 growth 记录中取出的数值（单位：mm/g）
  const [heightMm, setHeightMm] = useState<number | null>(null)
  const [weightG, setWeightG] = useState<number | null>(null)
  const [headMm, setHeadMm] = useState<number | null>(null)

  const familyId = currentFamily?.id
  const babyId = currentBaby?.id

  const fetchLatestGrowth = useCallback(() => {
    if (!familyId || !babyId) return
    recordsApi.growth
      .list(familyId, babyId, { limit: 1, offset: 0 })
      .then((records) => {
        const latest = records[0]
        if (!latest) return
        setHeightMm(latest.height_mm ?? null)
        setWeightG(latest.weight_g ?? null)
        setHeadMm(latest.head_mm ?? null)
      })
      .catch(() => {
        // 加载失败时保持"—"占位，不影响页面展示
      })
  }, [familyId, babyId])

  // 每次进入 profile 页面时重新请求最新生长数据
  // 依赖 location.key 确保路由切换（包括从其他页面返回）时都会刷新
  useEffect(() => {
    fetchLatestGrowth()
  }, [fetchLatestGrowth, location.key])

  /**
   * 将可能为 null/undefined 的数值格式化为字符串
   * - 身高/头围：mm → cm，保留一位小数
   * - 体重：g → kg，保留一位小数
   * - 无值时返回"—"
   */
  const fmtCm = (mm: number | null): string => {
    if (mm == null) return '—'
    return (mm / 10).toFixed(1)
  }
  const fmtKg = (g: number | null): string => {
    if (g == null) return '—'
    return (g / 1000).toFixed(1)
  }

  const stats: StatItem[] = [
    { val: fmtCm(heightMm), unit: heightMm != null ? 'cm' : '', name: '身高' },
    { val: fmtKg(weightG),  unit: weightG  != null ? 'kg' : '', name: '体重' },
    { val: fmtCm(headMm),   unit: headMm   != null ? 'cm' : '', name: '头围' },
    { val: '—',             unit: '',                            name: '稳定期' },
  ]

  return (
    <div
      className="mx-4 rounded-2xl grid grid-cols-4 overflow-hidden"
      style={{
        background: '#fff',
        boxShadow: '0 2px 10px rgba(200,100,120,0.08)',
        padding: 14,
      }}
    >
      {stats.map((stat, i) => {
        const isEmpty = stat.val === '—'
        return (
          <div
            key={stat.name}
            className="text-center"
            style={i < 3 ? { borderRight: '.5px solid #F5F0F2' } : {}}
          >
            {/* 数值 + 单位：无数据时整体降权 */}
            <div
              className="leading-none"
              style={isEmpty
                ? { fontSize: 15, fontWeight: 400, color: 'rgba(154,128,144,0.45)' }
                : { fontSize: 16, fontWeight: 800, color: '#4A3035' }
              }
            >
              {stat.val}
              {!isEmpty && (
                <span className="text-[11px] font-medium" style={{ color: '#9A8090' }}>{stat.unit}</span>
              )}
            </div>
            {/* 指标名称：无数据时同步降权 */}
            <div
              className="text-[10px] mt-1"
              style={{ color: isEmpty ? 'rgba(154,128,144,0.45)' : '#9A8090' }}
            >
              {stat.name}
            </div>
          </div>
        )
      })}
    </div>
  )
}