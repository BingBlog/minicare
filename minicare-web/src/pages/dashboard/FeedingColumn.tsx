/**
 * 喂养记录列
 * 展示：母乳 / 配方奶 / 辅食（不含营养素）
 * 行布局：time | label | tags | summary
 * 对齐 Records 页面 getRecordListCompactParts + getRecordSummary
 */
import type { DashboardData } from './useDashboardData'
import type { TodayRecord } from '@/api'

// 奶粉类型简称（与 RecordContent.tsx MILK_TYPE_SHORT 一致）
const MILK_TYPE_SHORT: Record<string, string> = {
  aa: '氨基酸',
  eh_no_lactose: '深(无糖)',
  eh_lactose: '深(含糖)',
  ph: '适度水解',
  std: '普通奶粉',
}

function fmtDuration(min?: number | null): string {
  if (!min) return ''
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

/** 勺数格式化：整数直接显示，小数用分数 */
function formatScoop(n: number): string {
  if (Number.isInteger(n)) return String(n)
  const whole = Math.floor(n)
  const frac = n - whole
  // 常见分数
  const fracs: [number, string][] = [[1/3, '⅓'], [2/3, '⅔'], [1/4, '¼'], [3/4, '¾'], [1/2, '½']]
  for (const [v, s] of fracs) {
    if (Math.abs(frac - v) < 0.05) return whole > 0 ? `${whole}${s}` : s
  }
  return n.toFixed(1)
}

function formatHM(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

interface Props {
  data: DashboardData
  onAdd?: () => void
}

function renderFeedingRow(r: TodayRecord) {
  const detail = r.detail ?? {}
  const feedType = detail.feed_type as string | undefined
  const time = formatHM(r.time)

  // ── breast：label="母乳" tags=侧别 summary=时长 ──
  if (feedType === 'breast') {
    const side = detail.breast_side as string | undefined
    const dur = detail.duration_min as number | undefined
    const sideLabel = side === 'left' ? '左乳' : side === 'right' ? '右乳' : side === 'both' ? '双侧' : ''
    return (
      <div key={r.id} className="db-row">
        <span className="db-row-time">{time}</span>
        <span className="db-row-label">母乳</span>
        <span className="db-row-tags">
          {sideLabel && <span className="db-pill db-pill-pink">{sideLabel}</span>}
        </span>
        {dur ? (
          <span className="db-row-summary db-summary-pink">
            <span className="db-row-summary-value">{fmtDuration(dur)}</span>
          </span>
        ) : null}
      </div>
    )
  }

  // ── formula：label="配方奶" tags=奶粉类型+勺数 summary=ml ──
  if (feedType === 'formula') {
    const ml = detail.formula_ml as number | undefined
    const milkTypes = detail.milk_types as string[] | undefined
    const milkScoops = detail.milk_scoops as Record<string, number> | undefined
    return (
      <div key={r.id} className="db-row">
        <span className="db-row-time">{time}</span>
        <span className="db-row-label">配方奶</span>
        <span className="db-row-tags">
          {milkTypes && milkTypes.length > 0 && milkTypes.map((k, i) => {
            const label = MILK_TYPE_SHORT[k] ?? k
            const scoop = milkScoops?.[k]
            const text = scoop ? `${label} ${formatScoop(scoop)}勺` : label
            return <span key={i} className="db-pill">{text}</span>
          })}
        </span>
        {ml ? (
          <span className="db-row-summary db-summary-pink">
            <span className="db-row-summary-value">{ml}</span>
            <span className="db-row-summary-unit">ml</span>
          </span>
        ) : null}
      </div>
    )
  }

  // ── complementary：label="辅食" tags=食物名 summary=克数 ──
  if (feedType === 'complementary') {
    const food = detail.complementary_food as string | undefined
    const amountG = detail.amount_g as number | undefined
    return (
      <div key={r.id} className="db-row">
        <span className="db-row-time">{time}</span>
        <span className="db-row-label">辅食</span>
        <span className="db-row-tags">
          {food && <span className="db-pill db-pill-amber">{food}</span>}
        </span>
        {amountG ? (
          <span className="db-row-summary db-summary-gold">
            <span className="db-row-summary-value">{amountG}</span>
            <span className="db-row-summary-unit">g</span>
          </span>
        ) : null}
      </div>
    )
  }

  // ── fallback ──
  return (
    <div key={r.id} className="db-row">
      <span className="db-row-time">{time}</span>
      <span className="db-row-label">饮食</span>
      <span className="db-row-tags" />
    </div>
  )
}

export default function FeedingColumn({ data, onAdd }: Props) {
  const records = data.feeding

  return (
    <>
      <div className="db-col-header">
        <div className="db-col-title">
          <svg className="db-col-title-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2v6a6 6 0 0 0 12 0V2" /><line x1="6" y1="12" x2="6" y2="22" /><line x1="18" y1="12" x2="18" y2="22" /><line x1="6" y1="22" x2="18" y2="22" /></svg>
          喂养
          {onAdd && <button type="button" className="db-col-add-btn" onClick={onAdd}>+</button>}
        </div>
      </div>
      <div className="db-col-records">
        {records.length === 0 ? (
          <div className="db-empty">暂无记录</div>
        ) : (
          records.map((r) => renderFeedingRow(r))
        )}
      </div>
    </>
  )
}
