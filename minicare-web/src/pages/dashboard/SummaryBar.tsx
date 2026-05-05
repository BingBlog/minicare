/**
 * 今日小结汇总栏
 * 四格布局，与上方四列一一对齐
 */
import type { DashboardData } from './useDashboardData'

function formatDuration(min: number): string {
  if (min < 60) return `${min}分`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h${m}m` : `${h}h`
}

interface Props {
  data: DashboardData
}

export default function SummaryBar({ data }: Props) {
  // 喂养统计
  const breastCount = data.feeding.filter((r) => (r.detail?.feed_type as string) === 'breast').length
  const formulaCount = data.feeding.filter((r) => (r.detail?.feed_type as string) === 'formula').length
  const foodCount = data.feeding.filter((r) => (r.detail?.feed_type as string) === 'complementary').length

  const totalMl = data.feeding.reduce((sum, r) => {
    const ml = (r.detail?.formula_ml as number) ?? 0
    return sum + ml
  }, 0)

  const totalBreastMin = data.feeding.reduce((sum, r) => {
    if ((r.detail?.feed_type as string) !== 'breast') return sum
    return sum + ((r.detail?.duration_min as number) ?? 0)
  }, 0)

  // 睡眠总时长
  const totalSleepMin = data.sleep.reduce((sum, r) => {
    return sum + ((r.detail?.duration_min as number) ?? 0)
  }, 0)

  // 尿布统计
  const wetCount = data.diaper.filter((r) => (r.detail?.diaper_type as string) === 'wet').length
  const dirtyCount = data.diaper.filter((r) => {
    const t = r.detail?.diaper_type as string
    return t === 'dirty' || t === 'mixed'
  }).length

  // 补剂数
  const suppCount = data.supplement.length

  // 喂养汇总文本片段
  const feedingParts: string[] = []
  if (breastCount > 0) feedingParts.push(`母乳${breastCount}次${totalBreastMin > 0 ? ` ${formatDuration(totalBreastMin)}` : ''}`)
  if (formulaCount > 0) feedingParts.push(`奶粉${formulaCount}次${totalMl > 0 ? ` ${totalMl}ml` : ''}`)
  if (foodCount > 0) feedingParts.push(`辅食${foodCount}次`)

  return (
    <div className="db-summary">
      <div className="db-summary-cell db-summary-feeding">
        <span className="db-summary-title">喂养小结</span>
        <span className="db-summary-value">{feedingParts.join(' / ') || '--'}</span>
      </div>
      <div className="db-summary-cell db-summary-diaper">
        <span className="db-summary-title">尿布小结</span>
        <span className="db-summary-value">
          小便{wetCount}次 / 大便{dirtyCount}次
        </span>
      </div>
      <div className="db-summary-cell db-summary-sleep">
        <span className="db-summary-title">睡眠小结</span>
        <span className="db-summary-value">
          {data.sleep.length}次{totalSleepMin > 0 ? ` ${formatDuration(totalSleepMin)}` : ''}
        </span>
      </div>
      <div className="db-summary-cell db-summary-supplement">
        <span className="db-summary-title">补剂小结</span>
        <span className="db-summary-value">{suppCount > 0 ? `${suppCount}项` : '--'}</span>
      </div>
    </div>
  )
}
