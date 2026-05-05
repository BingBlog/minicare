/**
 * 喂养记录列（与 Web 端业务逻辑完全一致）
 * 展示：母乳 / 配方奶 / 辅食（不含营养素）
 * 行布局：time | label | tags | summary
 */
import { View, Text } from '@tarojs/components'
import type { DashboardData } from './types'
import type { TodayRecord } from '@/api'

// 奶粉类型简称（与 Web 端 MILK_TYPE_SHORT 一致）
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
      <View key={r.id} className='db-row'>
        <Text className='db-row-time'>{time}</Text>
        <Text className='db-row-label'>母乳</Text>
        <View className='db-row-tags'>
          {sideLabel ? <Text className='db-pill db-pill-pink'>{sideLabel}</Text> : null}
        </View>
        {dur ? (
          <View className='db-row-summary db-summary-pink'>
            <Text className='db-row-summary-value'>{fmtDuration(dur)}</Text>
          </View>
        ) : null}
      </View>
    )
  }

  // ── formula：label="配方奶" tags=奶粉类型+勺数 summary=ml ──
  if (feedType === 'formula') {
    const ml = detail.formula_ml as number | undefined
    const milkTypes = detail.milk_types as string[] | undefined
    const milkScoops = detail.milk_scoops as Record<string, number> | undefined
    return (
      <View key={r.id} className='db-row'>
        <Text className='db-row-time'>{time}</Text>
        <Text className='db-row-label'>配方奶</Text>
        <View className='db-row-tags'>
          {milkTypes && milkTypes.length > 0 && milkTypes.map((k, i) => {
            const label = MILK_TYPE_SHORT[k] ?? k
            const scoop = milkScoops?.[k]
            const text = scoop ? `${label} ${formatScoop(scoop)}勺` : label
            return <Text key={i} className='db-pill'>{text}</Text>
          })}
        </View>
        {ml ? (
          <View className='db-row-summary db-summary-pink'>
            <Text className='db-row-summary-value'>{ml}</Text>
            <Text className='db-row-summary-unit'>ml</Text>
          </View>
        ) : null}
      </View>
    )
  }

  // ── complementary：label="辅食" tags=食物名 summary=克数 ──
  if (feedType === 'complementary') {
    const food = detail.complementary_food as string | undefined
    const amountG = detail.amount_g as number | undefined
    return (
      <View key={r.id} className='db-row'>
        <Text className='db-row-time'>{time}</Text>
        <Text className='db-row-label'>辅食</Text>
        <View className='db-row-tags'>
          {food ? <Text className='db-pill db-pill-amber'>{food}</Text> : null}
        </View>
        {amountG ? (
          <View className='db-row-summary db-summary-gold'>
            <Text className='db-row-summary-value'>{amountG}</Text>
            <Text className='db-row-summary-unit'>g</Text>
          </View>
        ) : null}
      </View>
    )
  }

  // ── fallback ──
  return (
    <View key={r.id} className='db-row'>
      <Text className='db-row-time'>{time}</Text>
      <Text className='db-row-label'>饮食</Text>
      <View className='db-row-tags' />
    </View>
  )
}

export default function FeedingColumn({ data, onAdd }: Props) {
  const records = data.feeding

  return (
    <View className='db-col'>
      <View className='db-col-header'>
        <View className='db-col-title'>
          <Text className='db-col-title-text'>喂养</Text>
          {onAdd && <Text className='db-col-add-btn' onClick={onAdd}>+记录</Text>}
        </View>
      </View>
      <View className='db-col-records'>
        {records.length === 0 ? (
          <Text className='db-empty'>暂无记录</Text>
        ) : (
          records.map((r) => renderFeedingRow(r))
        )}
      </View>
    </View>
  )
}
