/**
 * 「按类型 | 按时间」分段控件，记录页与首页今日时间线共用。
 */
import type { RecordsSortMode } from '@/lib/records-sort'

export default function RecordsSortModeBar({
  mode,
  onChange,
  embedded = false,
}: {
  mode: RecordsSortMode
  onChange: (m: RecordsSortMode) => void
  /** 嵌入卡片内：无底部边框、背景透明 */
  embedded?: boolean
}) {
  const btn = (m: RecordsSortMode, label: string) => {
    const active = mode === m
    return (
      <button
        type="button"
        onClick={() => onChange(m)}
        className="min-w-0 flex-1 border-none cursor-pointer transition-all active:scale-[0.98]"
        style={{
          height: 30,
          padding: '0 12px',
          borderRadius: 14,
          fontSize: 12,
          fontWeight: active ? 700 : 500,
          border: '1.5px solid transparent',
          background: active ? 'linear-gradient(135deg, #F87098, #F9A8C0)' : 'transparent',
          color: active ? '#fff' : '#9A8090',
          boxShadow: active ? '0 2px 8px rgba(248,112,152,0.22)' : 'none',
        }}
      >
        {label}
      </button>
    )
  }

  return (
    <div
      className="flex-shrink-0 flex justify-center px-4"
      style={{
        background: embedded ? 'transparent' : '#fff',
        borderBottom: embedded ? 'none' : '1px solid #F5EFF2',
        paddingTop: embedded ? 0 : 4,
        paddingBottom: embedded ? 8 : 10,
      }}
    >
      <div
        className="flex w-full max-w-md items-center gap-0.5 p-0.5"
        style={{
          background: '#F8F2F5',
          borderRadius: 16,
          border: '1px solid #EDE6EA',
        }}
      >
        {btn('type', '按类型')}
        {btn('time', '按时间')}
      </div>
    </div>
  )
}
