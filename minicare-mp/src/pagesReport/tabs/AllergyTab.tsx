import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { FoodObservation } from '@/api'
import { OBSERVATION_STATUS_CFG } from '@/lib/constants'

interface AllergyTabProps {
  data: FoodObservation[] | null
  loading: boolean
}

const CARD: React.CSSProperties = { background: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, boxShadow: '0 1px 4px rgba(200,100,120,0.06)' }

export function AllergyTab({ data, loading }: AllergyTabProps) {
  if (loading) {
    return <View style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}><Text style={{ color: '#C0A8AD', fontSize: 13 }}>加载中...</Text></View>
  }

  if (!data || data.length === 0) {
    return (
      <View style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '50px 0' }}>
        <Text style={{ color: '#C0A8AD', fontSize: 13, marginBottom: 8 }}>暂无排敏数据</Text>
        <Text style={{ color: '#D8C8D0', fontSize: 11 }}>开始记录宝宝的辅食后，这里将展示排敏进展</Text>
      </View>
    )
  }

  const statusCounts: Record<string, number> = {}
  data.forEach((o) => { statusCounts[o.status] = (statusCounts[o.status] || 0) + 1 })

  const activeItems = data.filter((o) => o.status === 'observing')
  const completedItems = data.filter((o) => o.status === 'safe')
  const suspectedItems = data.filter((o) => o.status === 'suspected')
  const allergicItems = data.filter((o) => o.status === 'allergic')

  const renderStatusRow = (label: string, count: number, color: string) => (
    <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
      <View style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
        <Text style={{ fontSize: 13, color: '#4A3035' }}>{label}</Text>
      </View>
      <Text style={{ fontSize: 13, fontWeight: 600, color }}>{count}项</Text>
    </View>
  )

  const renderFoodItem = (obs: FoodObservation) => {
    const cfg = OBSERVATION_STATUS_CFG[obs.status]
    return (
      <View
        key={obs.id}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 14px', background: '#FDF7F5', borderRadius: 10, marginBottom: 8,
        }}
        onClick={() => Taro.navigateTo({ url: `/pages/records/food-observation/detail?id=${obs.id}` })}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 14, fontWeight: 500, color: '#3D2B2E', display: 'block' }}>{obs.food_name}</Text>
          <Text style={{ fontSize: 11, color: '#9A7E82', marginTop: 2, display: 'block' }}>
            {obs.status === 'observing' ? `Day${obs.current_day ?? 1}/${obs.observation_days}` : cfg?.label ?? obs.status}
          </Text>
        </View>
        <View style={{ display: 'flex', gap: 4 }}>
          {Array.from({ length: obs.observation_days }, (_, i) => {
            const dayNum = i + 1
            const isCompleted = obs.status === 'safe' || (obs.current_day != null && dayNum < obs.current_day)
            const isCurrent = obs.current_day != null && dayNum === obs.current_day && obs.status === 'observing'
            return (
              <View
                key={dayNum}
                style={{
                  width: 18, height: 18, borderRadius: '50%',
                  background: isCompleted ? (cfg?.color ?? '#DDB870') : isCurrent ? '#FFF8EC' : '#F5F0F2',
                  border: isCurrent ? `1.5px solid ${cfg?.color ?? '#DDB870'}` : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 9, color: isCompleted ? '#fff' : isCurrent ? (cfg?.color ?? '#DDB870') : '#C0A8AD' }}>
                  {dayNum}
                </Text>
              </View>
            )
          })}
        </View>
      </View>
    )
  }

  return (
    <View>
      <View style={CARD}>
        <Text style={{ fontSize: 13, fontWeight: 500, color: '#4A3035', marginBottom: 8 }}>排敏概览</Text>
        {renderStatusRow('观察中', statusCounts['observing'] ?? 0, '#DDB870')}
        {renderStatusRow('已耐受', statusCounts['safe'] ?? 0, '#2A9E70')}
        {renderStatusRow('疑似过敏', statusCounts['suspected'] ?? 0, '#E07A00')}
        {renderStatusRow('确认过敏', statusCounts['allergic'] ?? 0, '#E8305A')}
      </View>

      {activeItems.length > 0 && (
        <View style={CARD}>
          <Text style={{ fontSize: 13, fontWeight: 500, color: '#4A3035', marginBottom: 8 }}>进行中的观察</Text>
          {activeItems.map(renderFoodItem)}
        </View>
      )}

      {completedItems.length > 0 && (
        <View style={CARD}>
          <Text style={{ fontSize: 13, fontWeight: 500, color: '#2A9E70', marginBottom: 8 }}>已耐受</Text>
          {completedItems.map(renderFoodItem)}
        </View>
      )}

      {suspectedItems.length > 0 && (
        <View style={CARD}>
          <Text style={{ fontSize: 13, fontWeight: 500, color: '#E07A00', marginBottom: 8 }}>疑似过敏</Text>
          {suspectedItems.map(renderFoodItem)}
        </View>
      )}

      {allergicItems.length > 0 && (
        <View style={CARD}>
          <Text style={{ fontSize: 13, fontWeight: 500, color: '#E8305A', marginBottom: 8 }}>确认过敏</Text>
          {allergicItems.map(renderFoodItem)}
        </View>
      )}

      <View style={{ ...CARD, background: 'linear-gradient(135deg, #FFF8EC, #FFF0E0)' }}>
        <Text style={{ fontSize: 13, fontWeight: 500, color: '#4A3035', marginBottom: 8 }}>排敏小贴士</Text>
        <Text style={{ fontSize: 12, color: '#6B6070', lineHeight: 1.6, display: 'block' }}>
          {'\u2022'} 建议每次只引入一种新食物，观察3-5天
        </Text>
        <Text style={{ fontSize: 12, color: '#6B6070', lineHeight: 1.6, display: 'block' }}>
          {'\u2022'} 出现皮疹、呕吐、腹泻等反应时及时标记
        </Text>
        <Text style={{ fontSize: 12, color: '#6B6070', lineHeight: 1.6, display: 'block' }}>
          {'\u2022'} 严重反应请立即就医，不要自行判断
        </Text>
      </View>
    </View>
  )
}
