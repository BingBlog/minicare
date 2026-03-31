/**
 * 记录页面
 * UI 严格对齐 minicare/ui-draft/records.html
 *
 * 结构：
 *   - 顶部筛选栏（全部 / 饮食 / 睡眠 / 活动 / 尿布 / 健康 / 表现 / 今天）
 *   - 按日期分组的记录列表（today / yesterday / 更早）
 *   - 每条记录：图标 + 标题 + 描述 + 右侧时间
 *   - 空状态
 */
import { useState, useEffect } from 'react'
import { recordsApi } from '@/api'
import { useAppStore } from '@/lib/store'
import type { RecordItem } from '@/api'

// ── 工具函数 ──────────────────────────────────────────────────────
function getRecordTime(rec: RecordItem): string {
  // RecordItem 有 [key: string]: unknown，startTime/start_time/created_at 都可能存在
  const raw = (rec.startTime ?? rec.start_time ?? rec.created_at) as string | undefined
  return raw ?? ''
}

function getRecordType(rec: RecordItem): string {
  return (rec.type as string | undefined) ?? ''
}

function formatTime(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function getDateLabel(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diff = Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24))
  if (diff === 0) return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 · 今天`
  if (diff === 1) return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 · 昨天`
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

function getDateKey(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

// ── SVG 图标 ──────────────────────────────────────────────────────
const IconMilk = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
    <path d="M8 2h8l1 6H7L8 2z"/><path d="M7 8c0 0-1 1-1 4s1 10 6 10 6-7 6-10-1-4-1-4"/>
    <path d="M10 14s.5 1 2 1 2-1 2-1"/>
  </svg>
)
const IconMoon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
)
const IconDroplets = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
    <path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/>
    <path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/>
  </svg>
)
const IconActivity = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
)
const IconHeart = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>
)
const IconRuler = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
    <path d="M21.3 8.7 8.7 21.3c-1 1-2.5 1-3.4 0l-2.6-2.6c-1-1-1-2.5 0-3.4L15.3 2.7c1-1 2.5-1 3.4 0l2.6 2.6c1 1 1 2.5 0 3.4z"/>
    <line x1="7.5" y1="10.5" x2="9" y2="12"/><line x1="10.5" y1="7.5" x2="12" y2="9"/>
    <line x1="13.5" y1="4.5" x2="15" y2="6"/>
  </svg>
)
const IconSmile = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
    <circle cx="12" cy="12" r="10"/><path d="M8 13s1.5 2 4 2 4-2 4-2"/>
    <line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
  </svg>
)
const IconStethoscope = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
    <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/>
    <path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4"/>
    <circle cx="20" cy="10" r="2"/>
  </svg>
)

// ── 记录类型配置 ──────────────────────────────────────────────────
const typeCfg: Record<string, { label: string; icon: React.ReactElement; bg: string; color: string }> = {
  feeding:  { label: '饮食',   icon: <IconMilk />,        bg: '#FFF0F4', color: '#F0B8C8' },
  sleep:    { label: '睡眠',   icon: <IconMoon />,        bg: '#EDFCF7', color: '#4CAF82' },
  diaper:   { label: '尿布',   icon: <IconDroplets />,    bg: '#E8F5E9', color: '#4CAF82' },
  activity: { label: '活动',   icon: <IconActivity />,    bg: '#FFF8E6', color: '#DDB870' },
  health:   { label: '健康',   icon: <IconHeart />,       bg: '#FFF0F4', color: '#E8507A' },
  growth:   { label: '生长',   icon: <IconRuler />,       bg: '#F3F0FF', color: '#9B8ED8' },
  symptom:  { label: '表现',   icon: <IconSmile />,       bg: '#FFF0F4', color: '#F0B8C8' },
  medical:  { label: '医疗',   icon: <IconStethoscope />, bg: '#FFF0F4', color: '#F0B8C8' },
}

// ── 筛选标签配置 ──────────────────────────────────────────────────
const filterChips = [
  { key: 'all',      label: '全部'  },
  { key: 'feeding',  label: '饮食'  },
  { key: 'sleep',    label: '睡眠'  },
  { key: 'activity', label: '活动'  },
  { key: 'diaper',   label: '尿布'  },
  { key: 'health',   label: '健康'  },
  { key: 'symptom',  label: '表现'  },
  { key: 'today',    label: '今天'  },
]

type RecordTypeKey = 'feeding' | 'sleep' | 'diaper' | 'activity' | 'health' | 'growth' | 'medical' | 'symptom'

export default function RecordsPage() {
  const { currentFamily, currentBaby } = useAppStore()
  const [records, setRecords] = useState<RecordItem[]>([])
  const [activeFilter, setActiveFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  // 右键操作弹层
  const [ctxOpen, setCtxOpen] = useState(false)

  const detailedApis = recordsApi as Record<
    RecordTypeKey,
    { list: (familyId: string, babyId: string, limit: number) => Promise<RecordItem[]> }
  >

  useEffect(() => {
    async function load() {
      if (!currentFamily || !currentBaby) { setLoading(false); return }
      setLoading(true)
      try {
        // 根据筛选类型决定加载哪些记录
        const typeKeys: RecordTypeKey[] = ['feeding', 'sleep', 'diaper', 'activity', 'health', 'growth', 'medical', 'symptom']
        let allRecs: RecordItem[] = []

        if (activeFilter === 'all' || activeFilter === 'today') {
          // 加载全部类型（并发）
          const results = await Promise.allSettled(
            typeKeys.map((t) =>
              detailedApis[t]?.list(currentFamily.id, currentBaby!.id, 30) ?? Promise.resolve([])
            )
          )
          results.forEach((r) => {
            if (r.status === 'fulfilled') allRecs = allRecs.concat(r.value)
          })
        } else {
          // 只加载对应类型
          const t = activeFilter as RecordTypeKey
          if (detailedApis[t]) {
            allRecs = await detailedApis[t].list(currentFamily.id, currentBaby!.id, 50)
          }
        }

        // 按时间降序
        allRecs.sort((a, b) => new Date(getRecordTime(b)).getTime() - new Date(getRecordTime(a)).getTime())

        // 今天筛选
        if (activeFilter === 'today') {
          const todayStr = getDateKey(new Date().toISOString())
          allRecs = allRecs.filter((r) => getDateKey(getRecordTime(r)) === todayStr)
        }

        setRecords(allRecs)
      } catch {
        setRecords([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [currentFamily, currentBaby, activeFilter])

  if (!currentFamily || !currentBaby) {
    return (
      <div className="min-h-full bg-bg flex flex-col">
        {/* 筛选栏占位 */}
        <div style={{ height: 52, background: '#fff' }} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-3">👨‍👩‍👧</div>
            <div className="text-sm text-[#9A8090]">请先创建家庭和添加宝宝</div>
          </div>
        </div>
      </div>
    )
  }

  // ── 按日期分组 ─────────────────────────────────────────────────
  const grouped: { dateKey: string; dateLabel: string; isToday: boolean; items: RecordItem[] }[] = []
  const dateMap = new Map<string, RecordItem[]>()

  for (const rec of records) {
    const dk = getDateKey(getRecordTime(rec))
    if (!dateMap.has(dk)) dateMap.set(dk, [])
    dateMap.get(dk)!.push(rec)
  }

  const todayKey = getDateKey(new Date().toISOString())
  for (const [dk, items] of dateMap.entries()) {
    grouped.push({
      dateKey: dk,
      dateLabel: getDateLabel(getRecordTime(items[0])),
      isToday: dk === todayKey,
      items,
    })
  }

  return (
    <div className="min-h-full bg-bg flex flex-col">

      {/* ── 筛选栏 ── */}
      <div
        className="flex-shrink-0 overflow-x-auto"
        style={{
          display: 'flex',
          gap: 8,
          padding: '10px 16px 4px',
          background: '#fff',
          scrollbarWidth: 'none',
        }}
      >
        {filterChips.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveFilter(key)}
            className="flex-shrink-0 border-none cursor-pointer transition-all active:scale-95"
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: activeFilter === key ? 600 : 500,
              whiteSpace: 'nowrap',
              border: `1.5px solid ${activeFilter === key ? '#F87098' : '#E8E0E4'}`,
              background: activeFilter === key ? '#FFF0F4' : '#fff',
              color: activeFilter === key ? '#F87098' : '#9A8090',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── 记录列表 ── */}
      <div className="flex-1 overflow-y-auto pb-24">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-[#F87098] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center py-12 px-6 text-center gap-2">
            <div className="text-[44px]">📋</div>
            <div className="text-[16px] font-semibold text-[#4A3035]">暂无记录</div>
            <div className="text-[13px] text-[#9A8090] leading-relaxed">
              点击底部 + 按钮开始记录<br/>宝宝的每一天
            </div>
          </div>
        ) : (
          grouped.map((group) => (
            <div key={group.dateKey}>
              {/* 日期分组标签 */}
              <div
                className="flex items-center gap-1.5 px-5 py-3.5 pt-4"
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: group.isToday ? '#7A5A60' : '#9A8090',
                }}
              >
                <div
                  style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: group.isToday ? '#F87098' : '#C0A8AD',
                    flexShrink: 0,
                  }}
                />
                {group.dateLabel}
              </div>

              {/* 记录卡片 */}
              <div
                className="mx-4 bg-white rounded-2xl overflow-hidden"
                style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.07)' }}
              >
                {group.items.map((rec, i) => {
                  const recType = getRecordType(rec)
                  const cfg = typeCfg[recType] ?? { label: recType, icon: <IconActivity />, bg: '#F5F5F5', color: '#9A8090' }
                  return (
                    <div
                      key={rec.id}
                      className="flex items-start gap-3 px-4 py-3.5 cursor-pointer active:bg-[#FFF8FA] transition-colors relative"
                      style={i > 0 ? { borderTop: '.5px solid #F5F0F2' } : {}}
                      onClick={() => setCtxOpen(true)}
                    >
                      {/* 图标 */}
                      <div
                        className="flex items-center justify-center rounded-xl flex-shrink-0"
                        style={{ width: 36, height: 36, background: cfg.bg, color: cfg.color }}
                      >
                        {cfg.icon}
                      </div>
                      {/* 内容 */}
                      <div className="flex-1 min-w-0">
                        <div
                          className="text-[14px] font-semibold leading-snug"
                          style={{ color: '#7A5A60' }}
                        >
                          {cfg.label}
                          {rec.note && rec.note.includes('ml') && (
                            <span style={{ color: '#7A5A60' }}>
                              {' '}
                              {(rec.note.match(/(\d+)\s*ml/i) || [])[0]}
                            </span>
                          )}
                        </div>
                        {rec.note && (
                          <div className="text-[12px] text-[#9A8090] mt-0.5 truncate">
                            {rec.note}
                          </div>
                        )}
                      </div>
                      {/* 时间 */}
                      <div className="text-[12px] text-[#9A8090] flex-shrink-0 pt-0.5">
                        {formatTime(getRecordTime(rec))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}

        {records.length > 0 && (
          <div className="text-center text-[11px] text-[#C0A8AD] py-3">
            长按记录卡片可编辑或删除
          </div>
        )}

        <div className="h-4" />
      </div>

      {/* ── 记录操作底部弹层 ── */}
      {ctxOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setCtxOpen(false) }}
        >
          <div
            className="w-full bg-white rounded-t-3xl overflow-hidden"
            style={{
              maxWidth: 430,
              margin: '0 auto',
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
            }}
          >
            {/* 把手 */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>
            {/* 编辑 */}
            <div
              className="flex items-center gap-3 px-5 py-4 cursor-pointer active:bg-gray-50 transition-colors"
              onClick={() => setCtxOpen(false)}
            >
              <div className="text-[18px] w-8 text-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="#9A8090" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </div>
              <span className="text-[15px] font-medium text-[#4A3035]">编辑记录</span>
            </div>
            {/* 删除 */}
            <div
              className="flex items-center gap-3 px-5 py-4 cursor-pointer active:bg-gray-50 transition-colors"
              style={{ borderTop: '.5px solid #F5F0F2' }}
              onClick={() => {
                setCtxOpen(false)
                if (window.confirm('确定删除这条记录吗？')) {
                  // TODO: 调用删除 API
                }
              }}
            >
              <div className="w-8 text-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="#F05060" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </div>
              <span className="text-[15px] font-medium text-[#F05060]">删除记录</span>
            </div>
            <div className="h-2" />
          </div>
        </div>
      )}
    </div>
  )
}
