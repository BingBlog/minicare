/**
 * BabyStats 宝宝生长指标迷你数据格
 *
 * 横向 4 格均等分布，展示：身高 / 体重 / 头围 / 稳定期（天数）。
 * 数据来源：自动请求 /records/growth 获取最近一条记录，未有数据时显示"—"占位。
 *
 * 被引用：ProfilePage.tsx
 */
import { useState, useEffect } from 'react'
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

  // 从最近一条 growth 记录中取出的数值（单位：mm/g）
  const [heightMm, setHeightMm] = useState<number | null>(null)
  const [weightG, setWeightG] = useState<number | null>(null)
  const [headMm, setHeadMm] = useState<number | null>(null)

  useEffect(() => {
    if (!currentFamily || !currentBaby) return
    recordsApi.growth
      .list(currentFamily.id, currentBaby.id, { limit: 1, offset: 0 })
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
  }, [currentFamily, currentBaby])

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
    { val: fmtCm(heightMm), unit: 'cm', name: '身高' },
    { val: fmtKg(weightG),  unit: 'kg', name: '体重' },
    { val: fmtCm(headMm),   unit: 'cm', name: '头围' },
    { val: '—',             unit: '天', name: '稳定期' },
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
      {stats.map((stat, i) => (
        <div
          key={stat.name}
          className="text-center"
          // 非最后一格右侧增加分割线
          style={i < 3 ? { borderRight: '.5px solid #F5F0F2' } : {}}
        >
          {/* 数值 + 单位（单位字号更小） */}
          <div className="text-[16px] font-extrabold text-[#4A3035] leading-none">
            {stat.val}
            <span className="text-[11px] font-medium text-[#9A8090]">{stat.unit}</span>
          </div>
          {/* 指标名称 */}
          <div className="text-[10px] text-[#9A8090] mt-1">{stat.name}</div>
        </div>
      ))}
    </div>
  )
}