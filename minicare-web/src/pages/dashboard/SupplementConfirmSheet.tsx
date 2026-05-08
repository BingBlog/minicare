import { useState, useEffect, useCallback } from 'react'
import type { RecentSupplement } from './useRecentSupplements'

interface Props {
  visible: boolean
  item: RecentSupplement | null
  onConfirm: (item: RecentSupplement, dose: string, recordTime: string) => void
  onCancel: () => void
  submitting?: boolean
}

function getNowISOStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function formatTimeDisplay(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function SupplementConfirmSheet({ visible, item, onConfirm, onCancel, submitting }: Props) {
  const [dose, setDose] = useState('')
  const [recordTime, setRecordTime] = useState(getNowISOStr())

  useEffect(() => {
    if (visible && item) {
      setDose(item.dose || '')
      setRecordTime(getNowISOStr())
    }
  }, [visible, item])

  const handleConfirm = useCallback(() => {
    if (!item || submitting) return
    onConfirm(item, dose, recordTime)
  }, [item, dose, recordTime, submitting, onConfirm])

  if (!visible || !item) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-t-xl bg-[#1e2030] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-medium text-white">确认录入</span>
          <button
            type="button"
            className="text-xs text-gray-400 hover:text-gray-300"
            onClick={onCancel}
          >
            取消
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">补剂</span>
            <span className="text-sm text-white">{item.label}</span>
          </div>

          <div>
            <span className="mb-1.5 block text-xs text-gray-400">剂量（选填）</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                className="flex-1 rounded-md border border-gray-600 bg-[#2a2d42] px-3 py-1.5 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500"
                placeholder="不填则不记录剂量"
                value={dose}
                onChange={(e) => setDose(e.target.value)}
              />
              {item.unit && <span className="text-xs text-gray-400">{item.unit}</span>}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">时间</span>
            <span className="text-sm text-gray-300">{formatTimeDisplay(recordTime)}（现在）</span>
          </div>
        </div>

        <div className="mt-5">
          <button
            type="button"
            className={`w-full rounded-lg py-2.5 text-sm font-medium transition-colors ${
              submitting
                ? 'cursor-not-allowed bg-blue-800 text-gray-400'
                : 'bg-blue-600 text-white hover:bg-blue-500'
            }`}
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? '录入中...' : '确认录入'}
          </button>
        </div>
      </div>
    </div>
  )
}
