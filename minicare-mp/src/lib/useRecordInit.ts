/**
 * useRecordInit — 记录表单页面通用初始化 Hook
 *
 * 封装所有记录表单页面共同的初始化流程：
 * 1. useLoad 解析 recordId（防重复）+ **统一 URL 解码**
 * 2. 获取 familyId + babyId
 * 3. 编辑模式下加载已有记录
 * 4. 新建模式下，若带 `initTime`（今日日程点"去记录"）→ 预填记录时间
 *
 * 使用方式：
 * ```ts
 * const { loading, familyId, babyId, editRecordId, isEditMode } = useRecordInit({
 *   loadRecord: (fid, rid) => recordsApi.diaper.getOne(fid, rid),
 *   onRecord: (rec) => { // 回填表单 },
 *   onInitTime: (hm) => setRecordTime(hm), // 可选：日程预填时间
 *   parseOptions: (options) => ({ tab: options.tab }), // 可选：解析额外参数
 *   onExtraOptions: (extra) => { setTab(extra.tab) }, // 可选：处理额外参数
 * })
 * ```
 */
import Taro, { useLoad } from '@tarojs/taro'
import { useState, useRef, useCallback } from 'react'
import { babyApi } from '@/api'
import { getStoredFamilyId } from '@/api/http'
import { decodeParams } from '@/lib/utils'

export interface UseRecordInitOptions<TRecord = Record<string, unknown>, TExtra = void> {
  /** 加载单条记录的 API 函数（编辑模式） */
  loadRecord?: (familyId: string, recordId: string) => Promise<TRecord>
  /** 记录加载成功后的回填回调 */
  onRecord?: (record: TRecord) => void
  /**
   * 日程「去记录」预填回调（PRD-009 US-04）。
   * 当 URL 带 `initTime`（HH:mm）且非编辑态时调用，用于把记录时间预填为计划执行时间。
   */
  onInitTime?: (hhmm: string) => void
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
  const { loadRecord, onRecord, parseOptions, onExtraOptions, onNewRecord, onInitTime } = options

  const [loading, setLoading] = useState(true)
  const [familyId, setFamilyId] = useState('')
  const [babyId, setBabyId] = useState('')
  const [editRecordId, setEditRecordId] = useState('')
  const initDoneRef = useRef(false)

  const isEditMode = editRecordId !== ''

  const init = useCallback(async (rid: string) => {
    setEditRecordId(rid)
    try {
      const fid = getStoredFamilyId()
      if (!fid) {
        Taro.showToast({ title: '请先完成建档', icon: 'none' })
        Taro.reLaunch({ url: '/pages/home/index' })
        return
      }
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

    // ⚠️ Taro 不会对查询串解码，且发送端是 encodeURIComponent 编码的 →
    // 必须在 Hook 里**统一解码一次**（放在这一层，所有用本 Hook 的表单页全覆盖）。
    const opts = decodeParams(loadOptions as Record<string, string | undefined>)
    const rid = opts.recordId ?? ''

    // 日程「去记录」预填时间：仅新建态生效，编辑态以记录自身时间为准
    const initTime = opts.initTime ?? ''
    if (!rid && initTime && onInitTime) onInitTime(initTime)

    if (parseOptions && onExtraOptions) {
      const extra = parseOptions(opts)
      onExtraOptions(extra)
    }

    init(rid)
  })

  return { loading, familyId, babyId, editRecordId, isEditMode }
}
