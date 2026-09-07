/**
 * 医疗记录 - 疫苗分区（PRD-005 US-02 / TECH-011 §4.3）
 *
 * - 疫苗名联想：内置参考程序库（getVaccineSchedule）输入即搜；无匹配可自定义录入（不入程序进度）
 * - 剂次：程序内疫苗自动建议「下一剂」（getVaccineBook 状态机），可改（回填历史针次）
 * - 部位/批号选填；反应多选（无异常与其他互斥）+ 文字说明
 */
import { View, Text, Input, Textarea, Picker } from '@tarojs/components'
import { useState } from 'react'
import { recordsApi } from '@/api'
import type { VaccineScheduleRow, VaccineBook } from '@/api/medical'
import { VACCINE_REACTION_LABELS, VACCINE_SITE_LABELS, VACCINE_CATEGORY_LABELS } from '@/lib/constants'

export interface VaccineFormState {
  name: string
  scheduleKey: string // '' = 自定义/未匹配
  doseSeq: number
  site: string // '' = 未选
  batch: string
  reactions: string[]
  reactionNote: string
}

export const EMPTY_VACCINE: VaccineFormState = {
  name: '',
  scheduleKey: '',
  doseSeq: 1,
  site: '',
  batch: '',
  reactions: [],
  reactionNote: '',
}

const DOSE_SEQS = Array.from({ length: 20 }, (_, i) => i + 1)

interface Props {
  familyId: string
  babyId: string
  value: VaccineFormState
  onChange: (patch: Partial<VaccineFormState>) => void
  /** 编辑态标记（列表隐藏用） */
  showAutoHint?: boolean
}

export default function VaccineSection({ familyId, babyId, value, onChange }: Props) {
  const [schedule, setSchedule] = useState<VaccineScheduleRow[]>([])
  const [book, setBook] = useState<VaccineBook | null>(null)
  const [matched, setMatched] = useState<VaccineScheduleRow[]>([])
  const [showMatch, setShowMatch] = useState(false)
  const [listLoaded, setListLoaded] = useState(false)

  /** 首次聚焦联想时才拉取（参考库低频只读 + 宝宝疫苗本各一次） */
  const ensureLoaded = async () => {
    if (listLoaded) return
    setListLoaded(true)
    try {
      const [sched, bk] = await Promise.all([
        recordsApi.medical.getVaccineSchedule(familyId),
        recordsApi.medical.getVaccineBook(familyId, babyId),
      ])
      setSchedule(sched)
      setBook(bk)
    } catch {
      /* 联想失败不阻断手动输入 */
    }
  }

  /** 输入即搜：命中参考库显示联想；未命中=自定义 */
  const onNameInput = (name: string) => {
    onChange({ name, scheduleKey: name.trim() ? '' : value.scheduleKey })
    if (!name.trim()) {
      setMatched([])
      setShowMatch(false)
      return
    }
    const kw = name.trim().toLowerCase()
    const hits = schedule.filter((s) => s.name.toLowerCase().includes(kw))
    setMatched(hits.slice(0, 8))
    setShowMatch(hits.length > 0)
  }

  /** 点选参考库疫苗：记录 key + 名称，并自动带出「下一剂」建议 */
  const pickSchedule = (row: VaccineScheduleRow) => {
    setShowMatch(false)
    const patch: Partial<VaccineFormState> = { name: row.name, scheduleKey: row.vkey }
    if (book) {
      const card = book.vaccines.find((v) => v.vkey === row.vkey)
      if (card) {
        const firstTodo = card.doses.find((d) => d.status !== 'done')
        if (firstTodo) patch.doseSeq = firstTodo.dose_seq
        else {
          const maxSeq = Math.max(...card.doses.map((d) => d.dose_seq), 0)
          patch.doseSeq = maxSeq + 1
        }
      }
    }
    onChange(patch)
  }

  const toggleReaction = (key: string) => {
    const set = new Set(value.reactions)
    if (key === 'none') {
      // 无异常 → 清空其余
      onChange({ reactions: set.has('none') ? [] : ['none'] })
      return
    }
    if (set.has('none')) set.delete('none')
    if (set.has(key)) set.delete(key)
    else set.add(key)
    onChange({ reactions: Array.from(set) })
  }

  const isCustom = value.scheduleKey === '' && value.name.trim() !== ''
  const siteKeys = Object.keys(VACCINE_SITE_LABELS).filter((k) => k !== 'unknown')

  return (
    <View className='medical-card'>
      {/* 疫苗名称（联想） */}
      <View className='medical-card__block medical-card__block--border'>
        <Text className='medical-card__textarea-label'>疫苗名称 *</Text>
        <Input
          className='medical-card__input'
          value={value.name}
          focus={false}
          onFocus={() => ensureLoaded()}
          onInput={(e) => onNameInput(e.detail.value)}
          placeholder='输入名称检索参考程序（乙肝、五联…）'
          placeholderClass='medical-card__placeholder'
        />
        {showMatch && matched.length > 0 ? (
          <View className='vax-match'>
            {matched.map((row) => {
              const isHitKey = value.scheduleKey === row.vkey
              return (
                <View
                  key={`${row.vkey}-${row.dose_seq}`}
                  className={`vax-match__item ${isHitKey ? 'vax-match__item--active' : ''}`}
                  onClick={() => pickSchedule(row)}
                >
                  <Text className='vax-match__name'>
                    {row.name} {VACCINE_CATEGORY_LABELS[row.category]}
                  </Text>
                  <Text className='vax-match__meta'>
                    第{row.dose_seq}剂 · 建议月龄 {row.month_rec} 月
                  </Text>
                </View>
              )
            })}
          </View>
        ) : null}
        {isCustom ? <Text className='medical-card__hint'>自定义疫苗将存入历史记录，不计入疫苗本程序进度</Text> : null}
      </View>

      {/* 剂次 */}
      <View className='medical-card__row medical-card__row--border'>
        <Text className='medical-card__label'>本次剂次</Text>
        <View className='medical-card__picker'>
          <Picker
            mode='selector'
            range={DOSE_SEQS}
            value={Math.min(Math.max(value.doseSeq - 1, 0), DOSE_SEQS.length - 1)}
            onChange={(e) => onChange({ doseSeq: DOSE_SEQS[Number(e.detail.value)] })}
          >
            <Text className='medical-card__picker-text'>第 {value.doseSeq} 剂</Text>
          </Picker>
        </View>
      </View>

      {/* 接种部位 */}
      <View className='medical-card__row medical-card__row--border'>
        <Text className='medical-card__label'>接种部位</Text>
        <View className='medical-card__picker'>
          <Picker
            mode='selector'
            range={siteKeys.map((k) => VACCINE_SITE_LABELS[k])}
            value={Math.max(siteKeys.indexOf(value.site), 0)}
            onChange={(e) => onChange({ site: siteKeys[Number(e.detail.value)] })}
          >
            <Text className={`medical-card__picker-text ${!value.site ? 'medical-card__picker-text--placeholder' : ''}`}>
              {value.site ? VACCINE_SITE_LABELS[value.site] : '选择部位（可选）'}
            </Text>
          </Picker>
        </View>
      </View>

      {/* 疫苗批号 */}
      <View className='medical-card__row medical-card__row--border'>
        <Text className='medical-card__label'>疫苗批号</Text>
        <Input
          className='medical-card__input'
          value={value.batch}
          onInput={(e) => onChange({ batch: e.detail.value })}
          placeholder='选填（接种证批号）'
          placeholderClass='medical-card__placeholder'
        />
      </View>

      {/* 接种后反应 */}
      <View className='medical-card__block'>
        <Text className='medical-card__textarea-label'>接种后反应</Text>
        <View className='chip-row'>
          {Object.entries(VACCINE_REACTION_LABELS).map(([key, label]) => (
            <View
              key={key}
              className={`chip ${value.reactions.includes(key) ? 'chip--active' : ''}`}
              onClick={() => toggleReaction(key)}
            >
              <Text className={value.reactions.includes(key) ? 'chip__text chip__text--active' : 'chip__text'}>{label}</Text>
            </View>
          ))}
        </View>
        {value.reactions.includes('other') ? (
          <Textarea
            className='medical-card__textarea'
            value={value.reactionNote}
            onInput={(e) => onChange({ reactionNote: e.detail.value })}
            placeholder='其他反应说明（可选）'
            maxlength={200}
            autoHeight
          />
        ) : null}
      </View>
    </View>
  )
}
