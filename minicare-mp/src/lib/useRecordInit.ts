/**
 * useRecordInit — 记录表单页面通用初始化 Hook
 *
 * 封装所有记录表单页面共同的初始化流程：
 * 1. useLoad 解析 recordId（防重复）
 * 2. 获取 familyId + babyId
 * 3. 编辑模式下加载已有记录
 *
 * 使用方式：
 * ```ts
 * const { loading, familyId, babyId, editRecordId, isEditMode } = useRecordInit({
 *   loadRecord: (fid, rid) => recordsApi.diaper.getOne(fid, rid),
 *   onRecord: (rec) => { // 回填表单 },
 *   parseOptions: (options) => ({ tab: options.tab }), // 可选：解析额外参数
 *   onExtraOptions: (extra) => { setTab(extra.tab) }, // 可选：处理额外参数
 * })
 * ```
 */
import Taro, { useLoad } from '@tarojs/taro'
import { useState, useRef, useCallback } from 'react'
import { familyApi, babyApi } from '@/api'
import { getCurrentFamilyId, setCurrentFamilyId } from '@/api/http'

export interface UseRecordInitOptions<TRecord = Record<string, unknown>, TExtra = void> {
  /** 加载单条记录的 API 函数（编辑模式） */
  loadRecord?: (familyId: string, recordId: string) => Promise<TRecord>
  /** 记录加载成功后的回填回调 */
  onRecord?: (record: TRecord) => void
  /** 从 useLoad options 中解析额外参数 */
  parseOptions?: (options: Record<string, string | undefined>) => TExtra
  /** 处理额外参数的回调（在 init 之前调用） */
  onExtraOptions?: (extra: TExtra) => void
  /** 新建模式下的额外初始化（如加载上次配方缓存），传入 babyId */
  onNewRecord?: (babyId: string) => void
}

export interface UseRecordInitResult {
  loading: boolean
  familyId: string
  babyId: string
  editRecordId: string
  isEditMode: boolean
}

export function useRecordInit<TRecord = Record<string, unknown>, TExtra = void>(
  options: UseRecordInitOptions<TRecord, TExtra>,
): UseRecordInitResult {
  const { loadRecord, onRecord, parseOptions, onExtraOptions, onNewRecord } = options

  const [loading, setLoading] = useState(true)
  const [familyId, setFamilyId] = useState('')
  const [babyId, setBabyId] = useState('')
  const [editRecordId, setEditRecordId] = useState('')
  const initDoneRef = useRef(false)

  const isEditMode = editRecordId !== ''

  const init = useCallback(async (rid: string) => {
    setEditRecordId(rid)
    try {
      const families = await familyApi.getMine()
      if (!families.length) {
        Taro.showToast({ title: '请先完成建档', icon: 'none' })
        Taro.reLaunch({ url: '/pages/home/index' })
        return
      }
      const fid = getCurrentFamilyId(families)!
      setCurrentFamilyId(fid)
      const baby = await babyApi.get(fid)
      setFamilyId(fid)
      setBabyId(baby.id)

      if (rid && loadRecord) {
        try {
          const record = await loadRecord(fid, rid)
          if (record && onRecord) onRecord(record)
        } catch {
          Taro.showToast({ title: '加载记录失败', icon: 'none' })
        }
      } else if (!rid && onNewRecord) {
        onNewRecord(baby.id)
      }
    } catch {
      Taro.showToast({ title: '加载失败，请重试', icon: 'none' })
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useLoad((loadOptions) => {
    if (initDoneRef.current) return
    initDoneRef.current = true

    const opts = (loadOptions ?? {}) as Record<string, string | undefined>
    const rid = opts.recordId ?? ''

    if (parseOptions && onExtraOptions) {
      const extra = parseOptions(opts)
      onExtraOptions(extra)
    }

    init(rid)
  })

  return { loading, familyId, babyId, editRecordId, isEditMode }
}
