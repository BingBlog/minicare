/**
 * 用药记录表单页（F14）
 *
 * 与 feeding/sleep/diaper 等表单页一致：进入页面直接填写打卡表单。
 * 历史记录统一在首页今日时间线 / 记录列表页展示（已支持 medication 类型）。
 *
 *  - 打卡表单：日期/时间 + 药品多选（清单）+ 每种药独立剂量 + 备注
 *  - 多药同服（迁移 025）：一次可选多种药，保存为一个「服药批次」；
 *    编辑时整批回填（可增删药行），保存走整批 diff（保留行更新/新增行插入/删行软删）
 *  - 药品管理弹层：常用药库快速添加 + 自定义录入 + 编辑/删除（软删除）+ 药品拍照
 */
import { View, Text, Picker, Input, Textarea, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { medicationApi } from '@/api'
import type { Medication, MedicationRecord } from '@/api'
import { nowDate, nowTime, isoToLocalDate, isoToLocalTime } from '@/lib/utils'
import { uploadOne, fetchTempUrls } from '@/lib/uploadImage'
import { useRecordInit } from '@/lib/useRecordInit'
import { useRecordSubmit } from '@/lib/useRecordSubmit'
import RecordNavBar from '@/components/RecordNavBar'
import ConfirmSheet from '@/components/ConfirmSheet'
import SubmitBar from '@/components/SubmitBar'
import PageLoading from '@/components/PageLoading'
import { useIsIPad } from '@/lib/useIsIPad'
import { ICON_MED_PILL, ICON_CLOSE_RED, ICON_CAMERA_PURPLE } from '@/assets/icons/svgDataUris'
import './index.scss'

/** 常用药库（前端静态数据，不含剂量建议；营养素类归 F03 不在此列） */
const MEDICATION_PRESETS: { name: string; default_dose: string }[] = [
  { name: '西替利嗪滴剂', default_dose: '5ml' },
  { name: '氯雷他定糖浆', default_dose: '5ml' },
  { name: '布洛芬混悬液', default_dose: '5ml' },
  { name: '对乙酰氨基酚', default_dose: '1ml' },
  { name: '蒙脱石散', default_dose: '1袋' },
]

/** 一次服药中的单行药品（打卡表单用） */
interface DrugRow {
  key: string
  /** 既有记录 id（编辑模式保留行；新建行为空） */
  record_id?: string
  medication_id: string
  medication_name: string
  dose: string
}

function showToast(title: string) {
  Taro.showToast({ title, icon: 'none', duration: 2000 })
}

export default function MedicationPage() {
  const isIPad = useIsIPad()
  const cls = (base: string) => (isIPad ? `${base} is-ipad` : base)

  // ── 表单状态 ──
  const [medications, setMedications] = useState<Medication[]>([])
  const [photoUrlMap, setPhotoUrlMap] = useState<Record<string, string>>({})
  const [recordDate, setRecordDate] = useState(nowDate())
  const [recordTime, setRecordTime] = useState(nowTime())
  const [drugRows, setDrugRows] = useState<DrugRow[]>([])
  const [medNote, setMedNote] = useState('')

  // ── 药品管理 ──
  const [manageOpen, setManageOpen] = useState(false)
  const [editingMed, setEditingMed] = useState<Medication | null>(null)
  const [medName, setMedName] = useState('')
  const [medDose, setMedDose] = useState('')
  const [medNote2, setMedNote2] = useState('')
  const [medPhotoId, setMedPhotoId] = useState('')
  const [medPhotoPreview, setMedPhotoPreview] = useState('')
  const [medPhotoUploading, setMedPhotoUploading] = useState(false)
  const [medSaving, setMedSaving] = useState(false)

  // ── 通用初始化（含编辑模式：整批加载） ──
  const { loading, familyId, babyId, editRecordId, isEditMode } = useRecordInit<MedicationRecord[]>({
    loadRecord: (fid, rid) => medicationApi.getBatch(fid, rid),
    onRecord: (records) => {
      const first = records[0]
      if (!first) return
      setRecordDate(isoToLocalDate(first.record_time))
      setRecordTime(isoToLocalTime(first.record_time))
      setMedNote(first.note ?? '')
      setDrugRows(
        records.map((r) => ({
          key: r.id,
          record_id: r.id,
          medication_id: r.medication_id ?? '',
          medication_name: r.medication_name,
          dose: r.dose ?? '',
        })),
      )
    },
    // PRD-009 US-04：今日日程「用药 → 去记录」→ 预填记录时间
    onInitTime: (hm) => setRecordTime(hm),
  })

  // ── 通用提交/删除 ──
  const { submitting, deleteConfirmOpen, setDeleteConfirmOpen, handleSubmit, handleDelete } = useRecordSubmit()

  const refreshMedications = useCallback(async () => {
    if (!familyId || !babyId) return
    try {
      const items = await medicationApi.list(familyId, babyId)
      setMedications(items)
      // 药品照片 fileID → 临时下载 URL（批量拉取，进页面一次）
      const fids = items.map((m) => m.photo_id).filter((x): x is string => !!x)
      if (fids.length > 0) {
        const map = await fetchTempUrls(fids)
        setPhotoUrlMap((prev) => {
          const next = { ...prev }
          map.forEach((url, fid) => {
            if (url) next[fid] = url
          })
          return next
        })
      }
    } catch {
      showToast('加载药品清单失败')
    }
  }, [familyId, babyId])

  useEffect(() => {
    if (!familyId || !babyId) return
    refreshMedications()
  }, [familyId, babyId, refreshMedications])

  const pickedMedIds = useMemo(
    () => new Set(drugRows.map((r) => r.medication_id).filter(Boolean)),
    [drugRows],
  )

  /** 某行药品照片展示 URL（按 medication_id 查清单照片） */
  const rowPhotoUrl = useCallback(
    (row: DrugRow): string => {
      const med = medications.find((m) => m.id === row.medication_id)
      return med?.photo_id ? (photoUrlMap[med.photo_id] ?? '') : ''
    },
    [medications, photoUrlMap],
  )

  /** 点击药品 chip：选中 → 加行（带出默认剂量）；再点 → 移除行 */
  const toggleMed = (m: Medication) => {
    setDrugRows((prev) => {
      const idx = prev.findIndex((r) => r.medication_id === m.id)
      if (idx >= 0) return prev.filter((_, i) => i !== idx)
      return [
        ...prev,
        {
          key: `pick-${m.id}-${Date.now()}`,
          medication_id: m.id,
          medication_name: m.name,
          dose: m.default_dose ?? '',
        },
      ]
    })
  }

  const removeDrugRow = (key: string) => {
    setDrugRows((prev) => prev.filter((r) => r.key !== key))
  }

  const updateDrugDose = (key: string, dose: string) => {
    setDrugRows((prev) => prev.map((r) => (r.key === key ? { ...r, dose } : r)))
  }

  // ── 提交（新建=整批创建；编辑=整批 diff 保存） ──
  const onSubmit = () => handleSubmit({
    validate: () => {
      if (!familyId || !babyId) return '请先完成宝宝建档'
      if (drugRows.length === 0) return '请选择药品（可多选）'
      return true
    },
    execute: async () => {
      const record_time = `${recordDate}T${recordTime}:00`
      if (isEditMode) {
        await medicationApi.updateBatch(familyId, editRecordId, {
          record_time,
          // 空串=清空备注（后端「undefined=保持原值」语义，此处必须显式传）
          note: medNote.trim(),
          items: drugRows.map((r) => ({
            record_id: r.record_id,
            medication_id: r.medication_id || undefined,
            medication_name: r.medication_name,
            dose: r.dose.trim() || undefined,
          })),
        })
        return '服药记录已更新'
      }
      await medicationApi.createBatch(familyId, {
        baby_id: babyId,
        record_time,
        note: medNote.trim() || undefined,
        items: drugRows.map((r) => ({
          medication_id: r.medication_id || undefined,
          medication_name: r.medication_name,
          dose: r.dose.trim() || undefined,
        })),
      })
      return drugRows.length > 1 ? `已记录 ${drugRows.length} 种药` : '已记录服药'
    },
  })

  // ── 删除（编辑模式：整批删除） ──
  const onDelete = () => handleDelete({
    execute: () => medicationApi.removeRecord(familyId, editRecordId).then(() => undefined),
  })

  // ── 药品管理 ──
  const resetMedPhoto = () => {
    setMedPhotoId('')
    setMedPhotoPreview('')
  }

  const openCreateMed = () => {
    setEditingMed(null)
    setMedName('')
    setMedDose('')
    setMedNote2('')
    resetMedPhoto()
  }

  const openEditMed = (m: Medication) => {
    setEditingMed(m)
    setMedName(m.name)
    setMedDose(m.default_dose ?? '')
    setMedNote2(m.note ?? '')
    setMedPhotoId(m.photo_id ?? '')
    setMedPhotoPreview(m.photo_id ? (photoUrlMap[m.photo_id] ?? '') : '')
  }

  /** 药品拍照/相册 → 压缩直传 COS → 记录 fileID */
  const handleChooseMedPhoto = async () => {
    if (medPhotoUploading || !babyId) return
    try {
      const res = await Taro.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
      })
      const path = res.tempFilePaths[0]
      if (!path) return
      setMedPhotoUploading(true)
      const fid = await uploadOne('medication', babyId, path)
      setMedPhotoId(fid)
      setMedPhotoPreview(path)
      // 本地路径先入缓存，保存后列表/选药 chip 立即可见
      setPhotoUrlMap((prev) => ({ ...prev, [fid]: path }))
    } catch {
      showToast('照片上传失败，请重试')
    } finally {
      setMedPhotoUploading(false)
    }
  }

  const previewMedPhoto = () => {
    if (!medPhotoPreview) return
    Taro.previewImage({ urls: [medPhotoPreview] })
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
          // 空串=清除照片（后端「undefined=保持」语义）
          photo_id: medPhotoId,
        })
        showToast('药品已更新')
      } else {
        await medicationApi.create(familyId, {
          baby_id: babyId,
          name: medName.trim(),
          default_dose: medDose.trim() || undefined,
          note: medNote2.trim() || undefined,
          photo_id: medPhotoId || undefined,
        })
        showToast('药品已添加')
      }
      setManageOpen(false)
      resetMedPhoto()
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
          setDrugRows((prev) => prev.filter((r) => r.medication_id !== m.id))
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

        {/* 药品选择（多选） */}
        <View className='medication-section-label'>
          <Text>药品（可多选）</Text>
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
              {medications.map((m) => {
                const photoUrl = m.photo_id ? (photoUrlMap[m.photo_id] ?? '') : ''
                return (
                  <View
                    key={m.id}
                    className={`medication-pick-chip${pickedMedIds.has(m.id) ? ' medication-pick-chip--active' : ''}`}
                    onClick={() => toggleMed(m)}
                  >
                    {photoUrl ? (
                      <Image className='medication-pick-chip__photo' src={photoUrl} mode='aspectFill' />
                    ) : null}
                    <View className='medication-pick-chip__body'>
                      <Text className='medication-pick-chip__name'>{m.name}</Text>
                      {m.default_dose ? (
                        <Text className='medication-pick-chip__dose'>{m.default_dose}</Text>
                      ) : null}
                    </View>
                  </View>
                )
              })}
            </View>
          )}
        </View>

        {/* 已选药品（每种药独立剂量） */}
        {drugRows.length > 0 && (
          <>
            <View className='medication-section-label'>
              <Text>已选 {drugRows.length} 种 · 可单独修改剂量</Text>
            </View>
            <View className='medication-card'>
              {drugRows.map((row, i) => {
                const photoUrl = rowPhotoUrl(row)
                return (
                  <View
                    key={row.key}
                    className={`medication-picked-row${i > 0 ? ' medication-picked-row--bordered' : ''}`}
                  >
                    {photoUrl ? (
                      <Image className='medication-picked-row__thumb' src={photoUrl} mode='aspectFill' />
                    ) : (
                      <View className='medication-picked-row__icon'>
                        <Image src={ICON_MED_PILL} style={{ width: 14, height: 14 }} />
                      </View>
                    )}
                    <Text className='medication-picked-row__name'>{row.medication_name}</Text>
                    <Input
                      className='medication-picked-row__dose'
                      value={row.dose}
                      onInput={(e) => updateDrugDose(row.key, e.detail.value)}
                      placeholder='剂量（可留空）'
                      maxlength={50}
                    />
                    <View className='medication-picked-row__remove' onClick={() => removeDrugRow(row.key)}>
                      <Image src={ICON_CLOSE_RED} style={{ width: 12, height: 12 }} />
                    </View>
                  </View>
                )
              })}
            </View>
          </>
        )}

        {/* 备注 */}
        <View className='medication-section-label'><Text>备注（可选）</Text></View>
        <View className='medication-card'>
          <Textarea
            className='medication-note__input'
            value={medNote}
            onInput={(e) => setMedNote(e.detail.value)}
            placeholder='如 饭后服用'
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
            <Text className='medication-sheet__section-label'>
              已添加（{medications.length}）
              <Text className='medication-sheet__section-hint'>点击可编辑</Text>
            </Text>
            <View className='medication-card'>
              {medications.length === 0 ? (
                <View className='medication-empty'>
                  <Image src={ICON_MED_PILL} style={{ width: 34, height: 34, opacity: 0.4 }} />
                  <Text className='medication-empty__text'>暂无药品，从下方药库快速添加</Text>
                </View>
              ) : (
                medications.map((m, i) => {
                  const photoUrl = m.photo_id ? (photoUrlMap[m.photo_id] ?? '') : ''
                  return (
                    <View
                      key={m.id}
                      className={`medication-manage-row${i > 0 ? ' medication-manage-row--bordered' : ''}${editingMed?.id === m.id ? ' medication-manage-row--editing' : ''}`}
                    >
                      <View className='medication-manage-row__icon'>
                        {photoUrl ? (
                          <Image className='medication-manage-row__thumb' src={photoUrl} mode='aspectFill' />
                        ) : (
                          <Image src={ICON_MED_PILL} style={{ width: 16, height: 16 }} />
                        )}
                      </View>
                      <View className='medication-manage-row__info' onClick={() => openEditMed(m)}>
                        <Text className='medication-manage-row__name'>{m.name}</Text>
                        {m.default_dose ? (
                          <Text className='medication-manage-row__dose'>{m.default_dose}</Text>
                        ) : null}
                        {editingMed?.id === m.id ? (
                          <Text className='medication-manage-row__editing-tag'>编辑中</Text>
                        ) : null}
                      </View>
                      <View className='medication-manage-row__delete' onClick={() => handleDeleteMed(m)}>
                        <Image src={ICON_CLOSE_RED} style={{ width: 12, height: 12 }} />
                        <Text className='medication-manage-row__delete-text'>删除</Text>
                      </View>
                    </View>
                  )
                })
              )}
            </View>

            {/* 常用药库 */}
            <Text className='medication-sheet__section-label'>常用药库<Text className='medication-sheet__section-hint'>点击添加</Text></Text>
            <View className='medication-card'>
              {MEDICATION_PRESETS.map((p, i) => {
                const exists = medications.some((m) => m.name === p.name)
                return (
                  <View
                    key={p.name}
                    className={`medication-preset-row${i > 0 ? ' medication-preset-row--bordered' : ''}`}
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
                    <View className='medication-preset-row__icon'>
                      <Image src={ICON_MED_PILL} style={{ width: 13, height: 13 }} />
                    </View>
                    <Text className='medication-preset-row__name'>{p.name}</Text>
                    <Text className='medication-preset-row__dose'>{p.default_dose}</Text>
                    <View className={`medication-preset-row__add${exists ? ' medication-preset-row__add--added' : ''}`}>
                      <Text className='medication-preset-row__add-text'>{exists ? '已添加' : '+ 添加'}</Text>
                    </View>
                  </View>
                )
              })}
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
              <View className='medication-row medication-row--border'>
                <Text className='medication-row__label'>药品照片</Text>
                <View className='medication-photo-field'>
                  {medPhotoPreview ? (
                    <View className='medication-photo-field__preview'>
                      <Image
                        className='medication-photo-field__img'
                        src={medPhotoPreview}
                        mode='aspectFill'
                        onClick={previewMedPhoto}
                      />
                      <View className='medication-photo-field__remove' onClick={resetMedPhoto}>
                        <Image src={ICON_CLOSE_RED} style={{ width: 10, height: 10 }} />
                      </View>
                    </View>
                  ) : (
                    <View
                      className={`medication-photo-field__add${medPhotoUploading ? ' medication-photo-field__add--busy' : ''}`}
                      onClick={medPhotoUploading ? undefined : handleChooseMedPhoto}
                    >
                      <Image src={ICON_CAMERA_PURPLE} style={{ width: 16, height: 16 }} />
                      <Text className='medication-photo-field__add-text'>
                        {medPhotoUploading ? '上传中…' : '拍照 / 相册'}
                      </Text>
                    </View>
                  )}
                </View>
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
