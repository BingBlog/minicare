/**
 * 记录页面（简化版：仅展示喂奶记录，后续扩展）
 */
import { useState, useEffect } from 'react'
import { recordsApi } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import type { RecordItem } from '@/lib/api'

const recordTypes = [
  { type: 'feeding', label: '喂奶', emoji: '🍼' },
  { type: 'sleep', label: '睡眠', emoji: '😴' },
  { type: 'diaper', label: '换尿布', emoji: '🌙' },
  { type: 'activity', label: '玩耍', emoji: '🎮' },
  { type: 'health', label: '健康', emoji: '💊' },
  { type: 'growth', label: '成长', emoji: '📏' },
]

const typeCfg: { [key: string]: { label: string; emoji: string; color: string; bg: string } } = {
  feeding: { label: '喂奶', emoji: '🍼', color: '#F87098', bg: '#FFF0F4' },
  sleep: { label: '睡眠', emoji: '😴', color: '#9B8ED8', bg: '#F3F0FF' },
  diaper: { label: '换尿布', emoji: '🌙', color: '#68D0B8', bg: '#EDFAF8' },
  activity: { label: '玩耍', emoji: '🎮', color: '#F8C870', bg: '#FFF8E6' },
  health: { label: '健康', emoji: '💊', color: '#4CAF82', bg: '#EDFCF7' },
  growth: { label: '成长', emoji: '📏', color: '#F5A623', bg: '#FFF8E6' },
}

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

export default function RecordsPage() {
  const { currentFamily, currentBaby } = useAppStore()
  const [records, setRecords] = useState<RecordItem[]>([])
  const [activeType, setActiveType] = useState('feeding')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!currentFamily || !currentBaby) return
      setLoading(true)
      try {
        const api = recordsApi[activeType as keyof typeof recordsApi]
        if (api) {
          const recs = await api.list(currentFamily.id, currentBaby.id, 50)
          setRecords(recs)
        }
      } catch {
        setRecords([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [currentFamily, currentBaby, activeType])

  if (!currentFamily || !currentBaby) {
    return (
      <div className="min-h-full bg-bg flex items-center justify-center">
        <div className="text-center text-subtext">
          <div className="text-3xl mb-2">👨‍👩‍👧</div>
          <div className="text-sm">请先创建家庭和添加宝宝</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-bg">
      {/* 顶部标题 */}
      <div className="sticky top-0 bg-white/90 backdrop-blur-sm z-10 px-4 pt-12 pb-3 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold text-text">记录</h1>
        </div>
        {/* 类型筛选 */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {recordTypes.map(({ type, label, emoji }) => (
            <button
              key={type}
              onClick={() => setActiveType(type)}
              className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                activeType === type
                  ? 'bg-primary border-primary text-white'
                  : 'border-border text-subtext bg-white'
              }`}
            >
              <span>{emoji}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 记录列表 */}
      <div className="px-4 py-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">📋</div>
            <div className="text-sm text-subtext">暂无{typeCfg[activeType]?.label || ''}记录</div>
          </div>
        ) : (
          <div className="space-y-2">
            {records.map((rec) => {
              const cfg = typeCfg[rec.type] ?? { label: rec.type, emoji: '📌', color: '#9A7E82', bg: '#F5F5F5' }
              return (
                <div key={rec.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                    style={{ backgroundColor: cfg.bg }}
                  >
                    {cfg.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text">{cfg.label}</div>
                    {rec.note && <div className="text-xs text-subtext mt-0.5 truncate">{rec.note as string}</div>}
                  </div>
                  <div className="text-xs text-subtext flex-shrink-0">{formatDateTime(rec.startTime)}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
