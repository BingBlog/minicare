/**
 * BabyStats 宝宝生长指标迷你数据格
 *
 * 横向 4 格均等分布，展示：身高 / 体重 / 头围 / 稳定期（天数）。
 * 数据来源于最近一次 growth 记录，未有数据时显示"—"占位。
 *
 * 被引用：ProfilePage.tsx
 */

/** 单格统计数据结构 */
interface StatItem {
  /** 数值字符串（无数据时填"—"） */
  val: string
  /** 单位（如"cm"、"kg"、"天"） */
  unit: string
  /** 指标名称（如"身高"） */
  name: string
}

/** BabyStats 属性 */
interface BabyStatsProps {
  /**
   * 身高（cm），未知时传 null 或 undefined
   * 显示格式：数字 + cm，如 "68"
   */
  height?: number | null
  /**
   * 体重（kg），未知时传 null 或 undefined
   * 显示格式：保留一位小数，如 "7.5"
   */
  weight?: number | null
  /**
   * 头围（cm），未知时传 null 或 undefined
   */
  head?: number | null
  /**
   * 稳定期天数（自上次引入新食物/药物后的天数）
   * 未知时传 null 或 undefined
   */
  stableDays?: number | null
}

/**
 * 宝宝生长指标迷你数据格组件
 *
 * @example
 * <BabyStats height={68} weight={7.5} head={43} stableDays={18} />
 * <BabyStats /> // 全部显示"—"占位
 */
export default function BabyStats({ height, weight, head, stableDays }: BabyStatsProps) {
  /**
   * 将可能为 null/undefined 的数值格式化为字符串
   * - weight 保留一位小数
   * - 其他整数显示
   * - 无值时返回"—"
   */
  const fmt = (val: number | null | undefined, isWeight = false): string => {
    if (val == null) return '—'
    return isWeight ? val.toFixed(1) : String(Math.round(val))
  }

  const stats: StatItem[] = [
    { val: fmt(height),             unit: 'cm', name: '身高' },
    { val: fmt(weight, true),       unit: 'kg', name: '体重' },
    { val: fmt(head),               unit: 'cm', name: '头围' },
    { val: stableDays != null ? String(stableDays) : '—', unit: '天', name: '稳定期' },
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
