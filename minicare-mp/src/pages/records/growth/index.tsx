/**
 * 生长记录表单页（MP 迁移）
 *
 * 与 Web pages/records/growth/index.tsx 保持业务逻辑对齐。
 */
import { View, Text, Input, Picker, Textarea } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import { recordsApi } from '@/api'
import type { GrowthRecord } from '@/api/growth'
import { nowTime, nowDate, isoToLocalDate } from '@/lib/utils'
import { useRecordInit } from '@/lib/useRecordInit'
import { useRecordSubmit } from '@/lib/useRecordSubmit'
import RecordNavBar from '@/components/RecordNavBar'
import SubmitBar from '@/components/SubmitBar'
import PageLoading from '@/components/PageLoading'
import { useIsIPad } from '@/lib/useIsIPad'
import './index.scss'

type MeasureKey = 'height' | 'weight' | 'head'

/** record_time 后端返回 "HH:mm:ss"，截取 HH:mm */
function toHHmm(raw: string): string {
  if (!raw) return nowTime()
  return raw.slice(0, 5)
}

const ORG_OPTIONS = ['儿保门诊', '家中自测', '社区卫生', '其他']

export default function GrowthFormPage() {
  const isIPad = useIsIPad()
  const cls = (base: string) => isIPad ? `${base} is-ipad` : base
  // ── 表单状态 ──
  const [recordDate, setRecordDate] = useState(nowDate())
  const [recordTime, setRecordTime] = useState(nowTime())
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [head, setHead] = useState('')
  const [orgChip, setOrgChip] = useState<string | null>('儿保门诊')
  const [note, setNote] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  // ── 通用初始化 ──
  const { loading, familyId, babyId, editRecordId, isEditMode } = useRecordInit<GrowthRecord>({
    loadRecord: async (fid, rid) => {
      setRefreshing(true)
      try {
        return await recordsApi.growth.getOne(fid, rid)
      } finally {
        setRefreshing(false)
      }
    },
    onRecord: (rec) => {
      if (rec.record_date) setRecordDate(isoToLocalDate(rec.record_date))
      if (rec.record_time) setRecordTime(toHHmm(rec.record_time))
      if (rec.height_mm != null) setHeight((rec.height_mm / 10).toFixed(1))
      if (rec.weight_g != null) setWeight((rec.weight_g / 1000).toFixed(2))
      if (rec.head_mm != null) setHead((rec.head_mm / 10).toFixed(1))
      if (rec.note != null) {
        const match = rec.note.match(/^机构：([^/]+?)(?:\s*\/\s*(.*))?$/)
        if (match) {
          const org = match[1].trim()
          if (ORG_OPTIONS.includes(org)) setOrgChip(org)
          setNote((match[2] ?? '').trim())
        } else {
          setNote(rec.note)
        }
      }
    },
  })

  // ── 通用提交/删除 ──
  const { submitting, handleSubmit, handleDelete } = useRecordSubmit()

  // ── 输入处理 ──
  const handleMeasureInput = (key: MeasureKey, raw: string) => {
    const filtered = raw.replace(/[^0-9.]/g, '')
    if (key === 'height') setHeight(filtered)
    if (key === 'weight') setWeight(filtered)
    if (key === 'head') setHead(filtered)
  }

  const handleMeasureBlur = (key: MeasureKey, raw: string) => {
    const n = parseFloat(raw)
    if (Number.isNaN(n)) return
    const decimals = key === 'weight' ? 2 : 1
    const formatted = n.toFixed(decimals)
    if (key === 'height') setHeight(formatted)
    if (key === 'weight') setWeight(formatted)
    if (key === 'head') setHead(formatted)
  }

  const valueMap: Record<MeasureKey, string> = { height, weight, head }

  // ── 提交 ──
  const onSubmit = () => handleSubmit({
    validate: () => {
      if (!familyId || !babyId) return '请先完成宝宝建档'
      if (!height && !weight && !head) return '请至少填写一项测量数据'
      return true
    },
    execute: async () => {
      const heightMm = height ? Math.round(parseFloat(height) * 10) : undefined
      const weightG = weight ? Math.round(parseFloat(weight) * 1000) : undefined
      const headMm = head ? Math.round(parseFloat(head) * 10) : undefined
      const noteArr: string[] = []
      if (orgChip) noteArr.push('机构：' + orgChip)
      if (note) noteArr.push(note)

      const payload = {
        record_date: recordDate,
        record_time: recordTime || undefined,
        height_mm: heightMm,
        weight_g: weightG,
        head_mm: headMm,
        note: noteArr.length > 0 ? noteArr.join(' / ') : undefined,
      }
      if (isEditMode) {
        await recordsApi.growth.update(familyId, editRecordId, payload)
        return '记录已更新'
      } else {
        await recordsApi.growth.create(familyId, { baby_id: babyId, ...payload })
        return '记录已保存'
      }
    },
  })

  // ── 删除（growth 使用 Taro.showModal 而非 ConfirmSheet） ──
  const onDeleteClick = async () => {
    if (!familyId || !editRecordId) return
    const { confirm } = await Taro.showModal({
      title: '确定删除这条记录吗？',
      content: '删除后无法恢复',
      confirmText: '确认删除',
      confirmColor: '#F05060',
    })
    if (!confirm) return
    handleDelete({
      execute: () => recordsApi.growth.remove(familyId, editRecordId),
    })
  }

  // ── Loading ──
  if (loading) {
    return (
      <View className={cls('growth-page')}>
        <RecordNavBar title='生长记录' isEditMode={false} />
        <PageLoading />
      </View>
    )
  }

  return (
    <View className={cls('growth-page')}>
      <RecordNavBar
        title='生长记录'
        isEditMode={isEditMode}
        onRightAction={isEditMode ? onDeleteClick : undefined}
      />

      {/* 编辑模式刷新提示 */}
      {refreshing && (
        <View className='growth-refreshing'><Text>正在加载最新数据...</Text></View>
      )}

      <View className='growth-body'>
        {/* 填写数值 */}
        <View className='growth-section-label'><Text>填写数值</Text></View>
        <View className='growth-card-box'>
          {([
            { key: 'height' as const, label: '身高', unit: 'cm', placeholder: '如 68.0' },
            { key: 'weight' as const, label: '体重', unit: 'kg', placeholder: '如 7.28' },
            { key: 'head' as const, label: '头围', unit: 'cm', placeholder: '如 43.0' },
          ]).map(({ key, label, unit, placeholder }, idx) => (
            <View key={key} className={`growth-row ${idx < 2 ? 'growth-row--border' : ''}`}>
              <Text className='growth-row__label'>{label}</Text>
              <View className='growth-row__input-group'>
                <Input
                  className='growth-row__input'
                  type='digit'
                  value={valueMap[key]}
                  onInput={(e) => handleMeasureInput(key, e.detail.value)}
                  onBlur={(e) => handleMeasureBlur(key, e.detail.value)}
                  placeholder={placeholder}
                />
                <Text className='growth-row__unit'>{unit}</Text>
              </View>
            </View>
          ))}
          <View className='growth-row growth-row--border-top'>
            <Text className='growth-row__label'>测量日期</Text>
            <Picker mode='date' value={recordDate} end={nowDate()} onChange={(e) => setRecordDate(e.detail.value)}>
              <View className='growth-row__picker'><Text>{recordDate}</Text></View>
            </Picker>
          </View>
          <View className='growth-row growth-row--border-top'>
            <Text className='growth-row__label'>测量时间</Text>
            <Picker mode='time' value={recordTime} onChange={(e) => setRecordTime(e.detail.value)}>
              <View className='growth-row__picker'><Text>{recordTime}</Text></View>
            </Picker>
          </View>
        </View>

        {/* 测量机构 */}
        <View className='growth-section-label'><Text>测量机构（可选）</Text></View>
        <View className='growth-card-box'>
          <View className='growth-org-chips'>
            {ORG_OPTIONS.map((org) => (
              <View
                key={org}
                className={`growth-org-chip ${orgChip === org ? 'growth-org-chip--active' : ''}`}
                onClick={() => setOrgChip(orgChip === org ? null : org)}
              >
                <Text>{org}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 上传测量单 */}
        <View className='growth-section-label'><Text>上传测量单（可选）</Text></View>
        <View className='growth-card-box'>
          <View className='growth-photo-btn' onClick={() => Taro.showToast({ title: '拍照上传（功能开发中）', icon: 'none' })}>
            <View className='growth-photo-btn__icon'>
              <Text className='growth-photo-btn__icon-text'>+</Text>
            </View>
            <View>
              <Text className='growth-photo-btn__title'>拍照或上传测量报告</Text>
              <Text className='growth-photo-btn__desc'>JPG / PNG，与结构化数据一并保存</Text>
            </View>
          </View>
        </View>

        {/* 备注 */}
        <View className='growth-section-label'><Text>备注（可选）</Text></View>
        <View className='growth-card-box'>
          <Textarea
            className='growth-note-input'
            placeholder='测量机构、备注等...'
            value={note}
            onInput={(e) => setNote(e.detail.value)}
            style={{ minHeight: '44px', padding: '14px' }}
          />
        </View>

        {/* 提示文字 */}
        {!isEditMode && (
          <View className='growth-hint'><Text>同一天只能记录一次，如已有记录将覆盖</Text></View>
        )}
      </View>

      {/* 提交 */}
      <SubmitBar submitting={submitting} isEditMode={isEditMode} onSubmit={onSubmit} />
    </View>
  )
}
