/**
 * 用药记录表单页（F14）
 *
 * 与 feeding/sleep/diaper 等表单页一致：进入页面直接填写打卡表单。
 * 历史记录统一在首页今日时间线 / 记录列表页展示（均已支持 medication 类型）。
 *
 *  - 打卡表单：日期/时间 + 药品选择（清单）+ 实际剂量（可改/可空）+ 备注
 *  - 药品管理弹层：常用药库快速添加 + 自定义录入 + 编辑/删除（软删除）
 *  - 支持编辑模式（从时间线/记录列表点击记录进入）
 */
import { View, Text, Picker, Input, Textarea, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState, useEffect, useCallback } from 'react'
import { medicationApi, recordsApi } from '@/api'
import type { Medication, MedicationRecord } from '@/api'
import { nowDate, nowTime, isoToLocalDate, isoToLocalTime } from '@/lib/utils'
import { useRecordInit } from '@/lib/useRecordInit'
import { useRecordSubmit } from '@/lib/useRecordSubmit'
import RecordNavBar from '@/components/RecordNavBar'
import ConfirmSheet from '@/components/ConfirmSheet'
import SubmitBar from '@/components/SubmitBar'
import PageLoading from '@/components/PageLoading'
import { useIsIPad } from '@/lib/useIsIPad'
import './index.scss'

/** 常用药库（前端静态数据，不含剂量建议；营养素类归 F03 不在此列） */
const MEDICATION_PRESETS: { name: string; default_dose: string }[] = [
  { name: '西替利嗪滴剂', default_dose: '5ml' },
  { name: '氯雷他定糖浆', default_dose: '5ml' },
  { name: '布洛芬混悬液', default_dose: '5ml' },
  { name: '对乙酰氨基酚', default_dose: '1ml' },
  { name: '蒙脱石散', default_dose: '1袋' },
]

const ICON_PLUS = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%236C5CE7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>')}`
const ICON_X = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%23F05060" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>')}`

function showToast(title: string) {
  Taro.showToast({ title, icon: 'none', duration: 2000 })
}

export default function MedicationPage() {
  const isIPad = useIsIPad()
  const cls = (base: string) => (isIPad ? `${base} is-ipad` : base)

  // ── 表单状态 ──
  const [medications, setMedications] = useState<Medication[]>([])
  const [recordDate, setRecordDate] = useState(nowDate())
  const [recordTime, setRecordTime] = useState(nowTime())
  const [selectedMedId, setSelectedMedId] = useState('')
  const [dose, setDose] = useState('')
  const [medNote, setMedNote] = useState('')

  // ── 药品管理 ──
  const [manageOpen, setManageOpen] = useState(false)
  const [editingMed, setEditingMed] = useState<Medication | null>(null)
  const [medName, setMedName] = useState('')
  const [medDose, setMedDose] = useState('')
  const [medNote2, setMedNote2] = useState('')
  const [medSaving, setMedSaving] = useState(false)

  // ── 通用初始化（含编辑模式） ──
  const { loading, familyId, babyId, editRecordId, isEditMode } = useRecordInit<MedicationRecord>({
    loadRecord: (fid, rid) => recordsApi.medication.getOne(fid, rid),
    onRecord: (r) => {
      setRecordDate(isoToLocalDate(r.record_time))
      setRecordTime(isoToLocalTime(r.record_time))
      setSelectedMedId(r.medication_id ?? '')
      setDose(r.dose ?? '')
      setMedNote(r.note ?? '')
    },
  })

  // ── 通用提交/删除 ──
  const { submitting, deleteConfirmOpen, setDeleteConfirmOpen, handleSubmit, handleDelete } = useRecordSubmit()

  const refreshMedications = useCallback(async () => {
    if (!familyId || !babyId) return
    try {
      const items = await medicationApi.list(familyId, babyId)
      setMedications(items)
    } catch {
      showToast('加载药品清单失败')
    }
  }, [familyId, babyId])

  useEffect(() => {
    if (!familyId || !babyId) return
    refreshMedications()
  }, [familyId, babyId, refreshMedications])

  const selectedMed = medications.find((m) => m.id === selectedMedId) ?? null

  // ── 提交 ──
  const onSubmit = () => handleSubmit({
    validate: () => {
      if (!familyId || !babyId) return '请先完成宝宝建档'
      if (!selectedMed && !editRecordId) return '请选择药品'
      return true
    },
    execute: async () => {
      const payload = {
        medication_id: selectedMed?.id,
        medication_name: selectedMed?.name ?? '',
        dose: dose.trim() || undefined,
        record_time: `${recordDate}T${recordTime}:00`,
        note: medNote.trim() || undefined,
      }
      if (isEditMode) {
        await recordsApi.medication.update(familyId, editRecordId, payload)
        return '服药记录已更新'
      } else {
        await recordsApi.medication.create(familyId, { baby_id: babyId, ...payload })
        return '已记录服药'
      }
    },
  })

  // ── 删除（编辑模式） ──
  const onDelete = () => handleDelete({
    execute: () => recordsApi.medication.remove(familyId, editRecordId),
  })

  // ── 药品管理 ──
  const openCreateMed = () => {
    setEditingMed(null)
    setMedName('')
    setMedDose('')
    setMedNote2('')
  }

  const openEditMed = (m: Medication) => {
    setEditingMed(m)
    setMedName(m.name)
    setMedDose(m.default_dose ?? '')
    setMedNote2(m.note ?? '')
  }

  const handleSaveMed = async () => {
    if (!medName.trim()) {
      showToast('请填写药品名称')
      return
    }
    setMedSaving(true)
    try {
      if (editingMed) {
        await medicationApi.update(familyId, babyId, editingMed.id, {
          name: medName.trim(),
          default_dose: medDose.trim() || undefined,
          note: medNote2.trim() || undefined,
        })
        showToast('药品已更新')
      } else {
        await medicationApi.create(familyId, {
          baby_id: babyId,
          name: medName.trim(),
          default_dose: medDose.trim() || undefined,
          note: medNote2.trim() || undefined,
        })
        showToast('药品已添加')
      }
      setManageOpen(false)
      await refreshMedications()
    } catch (e) {
      showToast(e instanceof Error ? e.message : '保存失败')
    } finally {
      setMedSaving(false)
    }
  }

  const handleDeleteMed = async (m: Medication) => {
    Taro.showModal({
      title: '删除药品',
      content: `删除「${m.name}」后，历史服药记录仍会保留，确定删除吗？`,
      confirmText: '删除',
      confirmColor: '#F05060',
      cancelText: '取消',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await medicationApi.remove(familyId, m.id)
          showToast('药品已删除')
          if (selectedMedId === m.id) setSelectedMedId('')
          await refreshMedications()
        } catch (e) {
          showToast(e instanceof Error ? e.message : '删除失败')
        }
      },
    })
  }

  // ── Loading ──
  if (loading) {
    return (
      <View className={cls('medication-page')}>
        <RecordNavBar title='用药记录' isEditMode={false} />
        <PageLoading />
      </View>
    )
  }

  return (
    <View className={cls('medication-page')}>
      <RecordNavBar
        title='用药记录'
        isEditMode={isEditMode}
        onRightAction={isEditMode ? () => setDeleteConfirmOpen(true) : undefined}
      />

      {/* ── 表单主体 ── */}
      <View className='medication-body'>
        {/* 记录时间 */}
        <View className='medication-section-label'><Text>记录时间</Text></View>
        <View className='medication-card'>
          <View className='medication-row medication-row--border'>
            <Text className='medication-row__label'>记录日期</Text>
            <Picker
              mode='date'
              value={recordDate}
              onChange={(e) => setRecordDate(e.detail.value)}
              end={nowDate()}
              start='2020-01-01'
            >
              <View className='medication-row__picker'>
                <Text className='medication-row__picker-text'>{recordDate}</Text>
              </View>
            </Picker>
          </View>
          <View className='medication-row'>
            <Text className='medication-row__label'>记录时间</Text>
            <Picker mode='time' value={recordTime} onChange={(e) => setRecordTime(e.detail.value)}>
              <View className='medication-row__picker'>
                <Text className='medication-row__picker-text'>{recordTime}</Text>
              </View>
            </Picker>
          </View>
        </View>

        {/* 药品选择 */}
        <View className='medication-section-label'>
          <Text>药品</Text>
          <Text className='medication-section-label__hint' onClick={() => setManageOpen(true)}>
            管理药品清单 ›
          </Text>
        </View>
        <View className='medication-card'>
          {medications.length === 0 ? (
            <View className='medication-no-med' onClick={() => setManageOpen(true)}>
              <Text className='medication-no-med__text'>暂无药品，点此添加（常用药库/自定义）</Text>
            </View>
          ) : (
            <View className='medication-pick-grid'>
              {medications.map((m) => (
                <View
                  key={m.id}
                  className={`medication-pick-chip${selectedMedId === m.id ? ' medication-pick-chip--active' : ''}`}
                  onClick={() => {
                    setSelectedMedId(m.id)
                    setDose((prev) => (prev || !m.default_dose ? prev : m.default_dose))
                  }}
                >
                  <Text className='medication-pick-chip__name'>{m.name}</Text>
                  {m.default_dose ? (
                    <Text className='medication-pick-chip__dose'>{m.default_dose}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* 剂量 */}
        <View className='medication-section-label'><Text>剂量（可修改，留空=按需）</Text></View>
        <View className='medication-card'>
          <Input
            className='medication-dose__input'
            value={dose}
            onInput={(e) => setDose(e.detail.value)}
            placeholder='如 5ml / 1袋'
            maxlength={50}
          />
        </View>

        {/* 备注 */}
        <View className='medication-section-label'><Text>备注（可选）</Text></View>
        <View className='medication-card'>
          <Textarea
            className='medication-note__input'
            value={medNote}
            onInput={(e) => setMedNote(e.detail.value)}
            placeholder='如 午睡后服用'
            maxlength={200}
            autoHeight
          />
        </View>
      </View>

      {/* ── 底部提交栏 ── */}
      <SubmitBar
        submitting={submitting}
        isEditMode={isEditMode}
        onSubmit={onSubmit}
        onDelete={() => setDeleteConfirmOpen(true)}
      />

      {/* ── 药品管理弹层 ── */}
      {manageOpen ? (
        <View className='medication-overlay' onClick={() => setManageOpen(false)}>
          <View className='medication-sheet' onClick={(e) => e.stopPropagation()}>
            <View className='medication-sheet__handle'>
              <View className='medication-sheet__bar' />
            </View>
            <Text className='medication-sheet__title'>药品清单</Text>

            {/* 药品列表 */}
            <Text className='medication-sheet__section-label'>已添加（{medications.length}）</Text>
            <View className='medication-card'>
              {medications.length === 0 ? (
                <View className='medication-no-med'>
                  <Text className='medication-no-med__text'>暂无药品，从下方药库快速添加</Text>
                </View>
              ) : (
                medications.map((m, i) => (
                  <View
                    key={m.id}
                    className={`medication-manage-row${i > 0 ? ' medication-manage-row--bordered' : ''}`}
                  >
                    <View className='medication-manage-row__info' onClick={() => openEditMed(m)}>
                      <Text className='medication-manage-row__name'>{m.name}</Text>
                      {m.default_dose ? (
                        <Text className='medication-manage-row__dose'>{m.default_dose}</Text>
                      ) : null}
                    </View>
                    <View className='medication-manage-row__delete' onClick={() => handleDeleteMed(m)}>
                      <Image src={ICON_X} style={{ width: 12, height: 12 }} />
                      <Text className='medication-manage-row__delete-text'>删除</Text>
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* 常用药库 */}
            <Text className='medication-sheet__section-label'>常用药库（点击添加）</Text>
            <View className='medication-card'>
              <View className='medication-preset-grid'>
                {MEDICATION_PRESETS.map((p) => {
                  const exists = medications.some((m) => m.name === p.name)
                  return (
                    <View
                      key={p.name}
                      className={`medication-preset-chip${exists ? ' medication-preset-chip--added' : ''}`}
                      onClick={async () => {
                        if (exists) {
                          showToast('已在清单中')
                          return
                        }
                        try {
                          await medicationApi.create(familyId, { baby_id: babyId, ...p })
                          showToast('已添加')
                          await refreshMedications()
                        } catch (e) {
                          showToast(e instanceof Error ? e.message : '添加失败')
                        }
                      }}
                    >
                      <Text className='medication-preset-chip__name'>{p.name}</Text>
                      <Text className='medication-preset-chip__dose'>{exists ? '已添加' : p.default_dose}</Text>
                    </View>
                  )
                })}
              </View>
            </View>

            {/* 新建/编辑表单 */}
            <Text className='medication-sheet__section-label'>{editingMed ? '编辑药品' : '自定义添加药品'}</Text>
            <View className='medication-card'>
              <View className='medication-row medication-row--border'>
                <Text className='medication-row__label'>药品名称</Text>
                <Input
                  className='medication-manage__input'
                  value={medName}
                  onInput={(e) => setMedName(e.detail.value)}
                  placeholder='必填，≤50字'
                  maxlength={50}
                />
              </View>
              <View className='medication-row medication-row--border'>
                <Text className='medication-row__label'>默认剂量</Text>
                <Input
                  className='medication-manage__input'
                  value={medDose}
                  onInput={(e) => setMedDose(e.detail.value)}
                  placeholder='如 5ml / 1袋（可选）'
                  maxlength={50}
                />
              </View>
              <View className='medication-row'>
                <Text className='medication-row__label'>备注</Text>
                <Input
                  className='medication-manage__input'
                  value={medNote2}
                  onInput={(e) => setMedNote2(e.detail.value)}
                  placeholder='可选'
                  maxlength={200}
                />
              </View>
            </View>

            <View className='medication-sheet__actions'>
              <View
                className={`medication-sheet__btn medication-sheet__btn--save${medSaving ? ' medication-sheet__btn--disabled' : ''}`}
                onClick={medSaving ? undefined : handleSaveMed}
              >
                {medSaving ? '保存中...' : editingMed ? '保存修改' : '添加药品'}
              </View>
              <View className='medication-sheet__btn medication-sheet__btn--cancel' onClick={() => setManageOpen(false)}>
                关闭
              </View>
            </View>
            <View style={{ height: 24 }} />
          </View>
        </View>
      ) : null}

      {/* 删除确认 */}
      <ConfirmSheet
        open={deleteConfirmOpen}
        onConfirm={onDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </View>
  )
}
