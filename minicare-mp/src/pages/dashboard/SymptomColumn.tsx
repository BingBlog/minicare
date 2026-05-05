/**
 * 表现/护理列（与 Web 端业务逻辑完全一致）
 * 合并展示：健康记录（体温/过敏/用药）+ 症状记录（精神/情绪）
 * 行布局：time | label | tags | summary
 */
import { View, Text } from '@tarojs/components'
import type { DashboardData } from './types'
import type { TodayRecord } from '@/api'

// 对齐后端 mood 枚举
const MOOD_LABEL: Record<string, string> = {
  happy: '开心',
  neutral: '平静',
  fussy: '烦躁',
  crying: '哭闹',
}

// 对齐后端 spiritLevel 枚举
const SPIRIT_LABEL: Record<string, string> = {
  active: '活跃',
  normal: '正常',
  tired: '疲倦',
  lethargic: '嗜睡',
}

function formatHM(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

interface Props {
  data: DashboardData
  onAdd: () => void
}

function renderHealthRow(r: TodayRecord) {
  const detail = r.detail ?? {}
  const temp = detail.temperature as number | undefined
  const allergySymptoms = detail.allergy_symptoms as string[] | undefined
  const medications = detail.medications as Array<{ name: string; dose?: string }> | undefined
  const time = formatHM(r.time)

  const isFever = temp != null && temp >= 37.5
  const tagPills: Array<{ text: string; cls: string }> = []
  if (isFever) tagPills.push({ text: '发热', cls: 'db-pill-red' })
  if (allergySymptoms && allergySymptoms.length > 0) tagPills.push({ text: '过敏', cls: 'db-pill-red' })
  if (medications && medications.length > 0) tagPills.push({ text: medications[0].name, cls: 'db-pill-lavender' })

  return (
    <View key={r.id} className='db-row'>
      <Text className='db-row-time'>{time}</Text>
      <Text className='db-row-label'>健康</Text>
      <View className='db-row-tags'>
        {tagPills.map((p, i) => (
          <Text key={i} className={`db-pill ${p.cls}`}>{p.text}</Text>
        ))}
      </View>
      {temp != null ? (
        <View className={`db-row-summary ${isFever ? 'db-summary-red' : 'db-summary-pink'}`}>
          <Text className='db-row-summary-value'>{temp.toFixed(1)}</Text>
          <Text className='db-row-summary-unit'>°C</Text>
        </View>
      ) : null}
    </View>
  )
}

function renderSymptomRow(r: TodayRecord) {
  const detail = r.detail ?? {}
  const mood = detail.mood as string | undefined
  const spirit = detail.spirit as string | undefined
  const time = formatHM(r.time)

  const tagPills: Array<{ text: string; cls: string }> = []
  if (mood) tagPills.push({ text: MOOD_LABEL[mood] ?? mood, cls: 'db-pill-pink' })
  if (spirit) tagPills.push({ text: SPIRIT_LABEL[spirit] ?? spirit, cls: 'db-pill-amber' })

  return (
    <View key={r.id} className='db-row'>
      <Text className='db-row-time'>{time}</Text>
      <Text className='db-row-label'>表现</Text>
      <View className='db-row-tags'>
        {tagPills.map((p, i) => (
          <Text key={i} className={`db-pill ${p.cls}`}>{p.text}</Text>
        ))}
      </View>
    </View>
  )
}

export default function SymptomColumn({ data, onAdd }: Props) {
  const healthRecords = data.health
  const symptomRecords = data.symptom ?? []
  const allRecords = [...healthRecords, ...symptomRecords]
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())

  return (
    <View className='db-col'>
      <View className='db-col-header'>
        <View className='db-col-title'>
          <Text className='db-col-title-text'>表现</Text>
          <Text className='db-col-add-btn' onClick={onAdd}>+记录</Text>
        </View>
      </View>
      <View className='db-col-records'>
        {allRecords.length === 0 ? (
          <Text className='db-empty'>暂无记录</Text>
        ) : (
          allRecords.map((r) => r.type === 'symptom' ? renderSymptomRow(r) : renderHealthRow(r))
        )}
      </View>
    </View>
  )
}
