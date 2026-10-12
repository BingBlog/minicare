/**
 * 单据卡片（只读渲染，PRD-017 共用视图）
 *
 * DocumentParseSheet（识别确认层，可带操作）与 DocumentArchiveCard（详情档案，只读）共用。
 * 合并后的 DocGroup → 卡片：类型 + 页数 + 置信徽标 + 标量行 + 诊断 chips + 长文本折叠 + 药品 + 化验表。
 */
import { View, Text } from '@tarojs/components'
import { useState } from 'react'
import { DOC_TYPE_LABELS, DOC_FIELD_LABELS } from '@/lib/constants'
import { type DocGroup, labIsAbnormal, formatMedSummary } from './docUtils'

export interface DocCardActions {
  onChangeType: () => void
  onRemove: () => void
}

interface Props {
  group: DocGroup
  /** 编辑模式（确认层）传操作；只读模式（档案卡）不传 */
  actions?: DocCardActions
}

export default function DocCardView({ group, actions }: Props) {
  const [longOpen, setLongOpen] = useState<Set<string>>(new Set())
  const [labOpen, setLabOpen] = useState(false)
  const low = new Set(group.lowConfidenceFields)
  const abnItems = group.labItems.filter(labIsAbnormal)
  const showLabItems = labOpen ? group.labItems : abnItems

  const toggleLong = (key: string) => {
    setLongOpen((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <View className='doc-card'>
      <View className='doc-card__head'>
        <Text className='doc-card__type'>{DOC_TYPE_LABELS[group.docType] ?? group.docType}</Text>
        {group.pageCount > 1 ? <Text className='doc-card__pages'>{group.pageCount} 页</Text> : null}
        <Text className={`doc-badge ${group.confidence === 'low' ? 'doc-badge--low' : 'doc-badge--ok'}`}>
          {group.confidence === 'low' ? '请重点核对' : '识别良好'}
        </Text>
        {actions ? (
          <View className='doc-card__ops'>
            <Text className='doc-op' onClick={actions.onChangeType}>换类型</Text>
            <Text className='doc-op doc-op--danger' onClick={actions.onRemove}>移除</Text>
          </View>
        ) : null}
      </View>

      <View className='doc-card__fields'>
        {/* 标量行（医院/日期/医师等，取首非空） */}
        {(['hospital', 'visitDate', 'visitTime', 'doctor', 'department', 'sampleType', 'reportedAt', 'examName'] as const).map((key) => {
          const value = group.scalar[key]
          if (!value) return null
          const label = DOC_FIELD_LABELS[key] ?? key
          const isLow = low.has(key)
          return (
            <View className='doc-row' key={key}>
              <Text className='doc-row__label'>
                {label}
                {isLow ? <Text className='doc-lowmark'>请核对</Text> : null}
              </Text>
              <Text className={`doc-row__value ${isLow ? 'doc-row__value--low' : ''}`}>{value}</Text>
            </View>
          )
        })}

        {/* 诊断 chips */}
        {group.diagnosis.length > 0 ? (
          <View className='doc-row'>
            <Text className='doc-row__label'>
              诊断
              {low.has('diagnosis') ? <Text className='doc-lowmark'>请核对</Text> : null}
            </Text>
            <View className='doc-diag'>
              {group.diagnosis.map((d) => (
                <Text className='doc-diag__chip' key={d}>{d}</Text>
              ))}
            </View>
          </View>
        ) : null}

        {/* 长文本（折叠 2 行） */}
        {group.longTexts.map((t) => {
          const open = longOpen.has(t.key)
          const isLow = low.has(t.key)
          return (
            <View className='doc-long' key={t.key}>
              <Text className='doc-long__label'>
                {t.label}
                {isLow ? <Text className='doc-lowmark'>请核对</Text> : null}
              </Text>
              <Text className={`doc-long__text ${open ? '' : 'doc-long__text--clamp'}`}>{t.text}</Text>
              <Text className='doc-long__toggle' onClick={() => toggleLong(t.key)}>{open ? '收起' : '展开'}</Text>
            </View>
          )
        })}

        {/* 药品明细 */}
        {group.medications.length > 0 ? (
          <View className='doc-long'>
            <Text className='doc-long__label'>
              药品（{group.medications.length}）
              {low.has('medications') ? <Text className='doc-lowmark'>请核对</Text> : null}
            </Text>
            {group.medications.map((m, i) => (
              <View className='doc-med' key={`${m.name}-${i}`}>
                <Text className='doc-med__name'>{m.name}</Text>
                {formatMedSummary(m) ? <Text className='doc-med__meta'>{formatMedSummary(m)}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}

        {/* 化验指标表（默认只列异常项） */}
        {group.labItems.length > 0 ? (
          <View className='doc-long'>
            <Text className='doc-long__label'>
              检验项目（{group.labItems.length} 项{abnItems.length > 0 ? `，异常 ${abnItems.length}` : ''}）
            </Text>
            <View className='doc-lab'>
              <View className='doc-lab__head'>
                <Text className='doc-lab__c1'>项目</Text>
                <Text className='doc-lab__c2'>结果</Text>
                <Text className='doc-lab__c3'>参考范围</Text>
              </View>
              {showLabItems.map((it, i) => (
                <View className={`doc-lab__row ${labIsAbnormal(it) ? 'doc-lab__row--abn' : ''}`} key={`${it.name}-${i}`}>
                  <Text className='doc-lab__c1'>{it.name}{it.unit ? `（${it.unit}）` : ''}</Text>
                  <Text className='doc-lab__c2'>{it.value}{it.flag === 'high' ? ' ↑' : it.flag === 'low' ? ' ↓' : ''}</Text>
                  <Text className='doc-lab__c3'>{it.refRange ?? ''}</Text>
                </View>
              ))}
            </View>
            {group.labItems.length > abnItems.length ? (
              <Text className='doc-lab__toggle' onClick={() => setLabOpen((v) => !v)}>
                {labOpen ? '收起，仅看异常项' : `展开全部 ${group.labItems.length} 项`}
              </Text>
            ) : null}
          </View>
        ) : null}

        {group.diagnosis.length === 0 && group.medications.length === 0 && group.labItems.length === 0 &&
        group.longTexts.length === 0 && Object.keys(group.scalar).length === 0 ? (
          <Text className='doc-card__empty'>未识别到有效内容</Text>
        ) : null}
      </View>
    </View>
  )
}

