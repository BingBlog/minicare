/**
 * 生长记录表单页（MP 迁移）
 *
 * 与 Web pages/records/growth/index.tsx 保持业务逻辑对齐。
 * 差异：路由/Taro 组件/存储方案按平台适配。
 */
import { View, Text, Input, Picker, Textarea } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { useState } from 'react'
import dayjs from 'dayjs'
import { babyApi, familyApi, recordsApi } from '@/api'
import { getStatusBarHeight } from '@/lib/safeArea'
import './index.scss'

type MeasureKey = 'height' | 'weight' | 'head'

// ---------------------------------------------------------------------------
// 时间工具
// ---------------------------------------------------------------------------
function nowHhmm(): string { return dayjs().format('HH:mm') }
function nowDateStr(): string { return dayjs().format('YYYY-MM-DD') }

/** ISO 字符串 → 本地日期 YYYY-MM-DD */
function isoToLocalDate(raw: string): string {
  if (raw.includes('T') || raw.includes('Z')) return dayjs(raw).format('YYYY-MM-DD')
  return raw.slice(0, 10)
}

/** record_time 后端返回 "HH:mm:ss"，截取 HH:mm */
function toHHmm(raw: string): string {
  if (!raw) return nowHhmm()
  return raw.slice(0, 5)
}

// ---------------------------------------------------------------------------
// 常量（与 Web 完全一致）
// ---------------------------------------------------------------------------
const ORG_OPTIONS = ['儿保门诊', '家中自测', '社区卫生', '其他']

// ---------------------------------------------------------------------------
// 页面入口
// ---------------------------------------------------------------------------
export default function GrowthFormPage() {
  const [loading, setLoading] = useState(true)
  const [familyId, setFamilyId] = useState('')
  const [babyId, setBabyId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editRecordId, setEditRecordId] = useState('')
  const isEditMode = editRecordId !== ''
  const [refreshing, setRefreshing] = useState(false)

  const [recordDate, setRecordDate] = useState(nowDateStr())
  const [recordTime, setRecordTime] = useState(nowHhmm())
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [head, setHead] = useState('')
  const [orgChip, setOrgChip] = useState<string | null>('儿保门诊')
  const [note, setNote] = useState('')

  // ---------------------------------------------------------------------------
  // 初始化
  // ---------------------------------------------------------------------------
  useLoad((options) => {
    const initRecordId = (options?.recordId as string | undefined) ?? ''
    init(initRecordId)
  })

  const init = async (initRecordId: string) => {
    setEditRecordId(initRecordId)
    try {
      const families = await familyApi.getMine()
      if (!families.length) {
        Taro.showToast({ title: '请先完成建档', icon: 'none' })
        Taro.reLaunch({ url: '/pages/home/index' })
        return
      }
      const fid = families[0].id
      const baby = await babyApi.get(fid)
      setFamilyId(fid)
      setBabyId(baby.id)

      if (initRecordId) {
        setRefreshing(true)
        try {
          const fresh = await recordsApi.growth.getOne(fid, initRecordId)
          populateEditForm(fresh as Record<string, unknown>)
        } catch {
          Taro.showToast({ title: '加载记录失败', icon: 'none' })
        } finally {
          setRefreshing(false)
        }
      }
    } catch {
      Taro.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const populateEditForm = (rec: Record<string, unknown>) => {
    if (rec.record_date) setRecordDate(isoToLocalDate(rec.record_date as string))
    if (rec.record_time) setRecordTime(toHHmm(rec.record_time as string))
    // 编辑时从 mm/g 反推回 cm/kg（身高/头围精度 0.1 cm，体重精度 0.01 kg）
    if (rec.height_mm != null) setHeight(((rec.height_mm as number) / 10).toFixed(1))
    if (rec.weight_g != null) setWeight(((rec.weight_g as number) / 1000).toFixed(2))
    if (rec.head_mm != null) setHead(((rec.head_mm as number) / 10).toFixed(1))
    // 从 note 中解析机构前缀和用户备注（格式："机构：XXX / 备注内容"）
    if (rec.note != null) {
      const noteStr = rec.note as string
      const match = noteStr.match(/^机构：([^/]+?)(?:\s*\/\s*(.*))?$/)
      if (match) {
        const org = match[1].trim()
        if (ORG_OPTIONS.includes(org)) setOrgChip(org)
        setNote((match[2] ?? '').trim())
      } else {
        setNote(noteStr)
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 输入处理（与 Web 规则一致：仅允许数字和点，blur 时格式化精度）
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // 提交
  // ---------------------------------------------------------------------------
  const handleSubmit = async () => {
    if (!familyId || !babyId) {
      Taro.showToast({ title: '请先完成宝宝建档', icon: 'none' })
      return
    }
    if (!height && !weight && !head) {
      Taro.showToast({ title: '请至少填写一项测量数据', icon: 'none' })
      return
    }
    setSubmitting(true)
    try {
      const heightMm = height ? Math.round(parseFloat(height) * 10) : undefined
      const weightG = weight ? Math.round(parseFloat(weight) * 1000) : undefined
      const headMm = head ? Math.round(parseFloat(head) * 10) : undefined
      const noteArr: string[] = []
      if (orgChip) noteArr.push('机构：' + orgChip)
      if (note) noteArr.push(note)

      const payload: Record<string, unknown> = {
        record_date: recordDate,
        record_time: recordTime || undefined,
        height_mm: heightMm,
        weight_g: weightG,
        head_mm: headMm,
        note: noteArr.length > 0 ? noteArr.join(' / ') : undefined,
      }

      if (isEditMode) {
        await recordsApi.growth.update(familyId, editRecordId, payload)
        Taro.showToast({ title: '记录已更新', icon: 'success' })
      } else {
        await recordsApi.growth.create(familyId, { baby_id: babyId, ...payload })
        Taro.showToast({ title: '记录已保存', icon: 'success' })
      }
      setTimeout(() => Taro.navigateBack(), 1000)
    } catch (err) {
      Taro.showToast({
        title: err instanceof Error ? err.message : '保存失败（同日只可记录一次）',
        icon: 'none',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!familyId || !editRecordId) return
    const { confirm } = await Taro.showModal({
      title: '确定删除这条记录吗？',
      content: '删除后无法恢复',
      confirmText: '确认删除',
      confirmColor: '#F05060',
    })
    if (!confirm) return
    try {
      await recordsApi.growth.remove(familyId, editRecordId)
      Taro.showToast({ title: '记录已删除', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 800)
    } catch {
      Taro.showToast({ title: '删除失败，请重试', icon: 'none' })
    }
  }

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <View className='growth-page'>
        <View className='growth-loading'><Text>加载中...</Text></View>
      </View>
    )
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <View className='growth-page'>
      {/* 导航栏 */}
      <View className='growth-nav' style={{ paddingTop: `${getStatusBarHeight() + 10}px` }}>
        <View className='growth-nav__back' onClick={() => Taro.navigateBack()}>
          <Text className='growth-nav__back-arrow'>{'<'}</Text>
        </View>
        <Text className='growth-nav__title'>{isEditMode ? '编辑生长记录' : '生长记录'}</Text>
        {isEditMode ? (
          <View className='growth-nav__delete' onClick={handleDelete}>
            <Text className='growth-nav__delete-text'>删除</Text>
          </View>
        ) : (
          <View className='growth-nav__spacer' />
        )}
      </View>

      {/* 编辑模式刷新提示 */}
      {refreshing && (
        <View className='growth-refreshing'>
          <Text>正在加载最新数据...</Text>
        </View>
      )}

      <View className='growth-body'>
        {/* 填写数值 */}
        <View className='growth-section-label'>
          <Text>填写数值</Text>
        </View>
        <View className='growth-card-box'>
          {([
            { key: 'height' as const, label: '身高', unit: 'cm', placeholder: '如 68.0', decimals: 1 },
            { key: 'weight' as const, label: '体重', unit: 'kg', placeholder: '如 7.28', decimals: 2 },
            { key: 'head' as const, label: '头围', unit: 'cm', placeholder: '如 43.0', decimals: 1 },
          ]).map(({ key, label, unit, placeholder, decimals }, idx) => (
            <View
              key={key}
              className={`growth-row ${idx < 2 ? 'growth-row--border' : ''}`}
            >
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
            <Picker mode='date' value={recordDate} end={nowDateStr()} onChange={(e) => setRecordDate(e.detail.value)}>
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

        {/* 测量机构（可选） */}
        <View className='growth-section-label'>
          <Text>测量机构（可选）</Text>
        </View>
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

        {/* 上传测量单（可选） */}
        <View className='growth-section-label'>
          <Text>上传测量单（可选）</Text>
        </View>
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
        <View className='growth-section-label'>
          <Text>备注（可选）</Text>
        </View>
        <View className='growth-card-box'>
          <Textarea
            className='growth-note-input'
            placeholder='测量机构、备注等...'
            value={note}
            onInput={(e) => setNote(e.detail.value)}
            style={{ minHeight: '44px', padding: '14px' }}
          />
        </View>

        {/* 提示文字（仅新建模式） */}
        {!isEditMode && (
          <View className='growth-hint'>
            <Text>同一天只能记录一次，如已有记录将覆盖</Text>
          </View>
        )}
      </View>

      {/* 提交 */}
      <View className='growth-submit'>
        <View
          className={`growth-submit__btn ${submitting ? 'growth-submit__btn--loading' : ''}`}
          onClick={submitting ? undefined : handleSubmit}
        >
          <Text className='growth-submit__text'>
            {submitting ? '提交中...' : isEditMode ? '更新记录' : '保存记录'}
          </Text>
        </View>
      </View>
    </View>
  )
}
