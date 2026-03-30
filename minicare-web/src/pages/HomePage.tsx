/**
 * 首页
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { familyApi, babyApi, recordsApi } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import type { RecordItem } from '@/lib/api'

function getBabyAge(birthDate: string) {
  const birth = new Date(birthDate)
  const now = new Date()
  const months =
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth())
  if (months < 1) {
    const days = Math.floor((now.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24))
    return `${days} 天`
  }
  if (months < 24) return `${months} 个月`
  return `${Math.floor(months / 12)} 岁 ${months % 12} 个月`
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

type RecordTypeCfg = { [key: string]: { label: string; emoji: string; color: string } }
const recordTypeCfg: RecordTypeCfg = {
  feeding: { label: '喂奶', emoji: '🍼', color: '#F87098' },
  sleep: { label: '睡眠', emoji: '😴', color: '#9B8ED8' },
  diaper: { label: '换尿布', emoji: '🌙', color: '#68D0B8' },
  activity: { label: '玩耍', emoji: '🎮', color: '#F8C870' },
  health: { label: '健康', emoji: '💊', color: '#4CAF82' },
  growth: { label: '成长', emoji: '📏', color: '#F5A623' },
}

const quickActions = [
  { type: 'feeding', label: '喂奶', emoji: '🍼', bg: 'bg-[#FFF0F4]', textColor: 'text-primary' },
  { type: 'sleep', label: '睡眠', emoji: '😴', bg: 'bg-[#F3F0FF]', textColor: 'text-purple-500' },
  { type: 'diaper', label: '换尿布', emoji: '🌙', bg: 'bg-teal-light', textColor: 'text-teal-dark' },
  { type: 'activity', label: '玩耍', emoji: '🎮', bg: 'bg-yellow-light', textColor: 'text-yellow-dark' },
  { type: 'health', label: '健康', emoji: '💊', bg: 'bg-green-50', textColor: 'text-green-600' },
  { type: 'growth', label: '成长', emoji: '📏', bg: 'bg-orange-50', textColor: 'text-orange-500' },
]

export default function HomePage() {
  const navigate = useNavigate()
  const { user, currentFamily, currentBaby, setCurrentFamily, setCurrentBaby } = useAppStore()

  const [records, setRecords] = useState<RecordItem[]>([])
  const [loading, setLoading] = useState(true)

  const today = new Date()
  const dateStr = `${today.getMonth() + 1}月${today.getDate()}日 ${['日', '一', '二', '三', '四', '五', '六'][today.getDay()]}`

  useEffect(() => {
    async function load() {
      try {
        // 1. 获取家庭
        let family = currentFamily
        if (!family) {
          const families = await familyApi.getMine()
          if (families.length === 0) {
            // 新用户，需要先创建家庭和宝宝
            navigate('/onboarding', { replace: true })
            return
          }
          family = families[0]
          setCurrentFamily(family)
        }

        // 2. 获取宝宝
        let baby = currentBaby
        if (!baby) {
          try {
            baby = await babyApi.get(family.id)
            setCurrentBaby(baby)
          } catch {
            // 还没有宝宝
            navigate('/onboarding', { replace: true })
            return
          }
        }

        // 3. 获取最近喂奶记录（示例）
        try {
          const recs = await recordsApi.feeding.list(family.id, baby.id, 5)
          setRecords(recs)
        } catch {
          // 无记录不报错
        }
      } catch (err) {
        console.error('加载失败', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-bg">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-full bg-bg">
      {/* 英雄区 */}
      <div className="relative bg-gradient-to-b from-primary via-[#F9A8C0] to-[#F06090] pb-7">
        <div className="absolute right-[-40px] top-[-50px] w-40 h-40 rounded-full bg-white/10 pointer-events-none" />
        <div className="absolute right-[80px] top-[30px] w-20 h-20 rounded-full bg-white/7 pointer-events-none" />

        <div className="flex items-center justify-between px-5 pt-12 pb-4 relative z-10">
          <div>
            <div className="text-xs text-white/78">
              {user ? `你好，${user.nickname} 👋` : '你好 👋'}
            </div>
            <div className="text-2xl font-bold text-white mt-1 tracking-tight" style={{ textShadow: '0 1px 4px rgba(248,80,100,0.25)' }}>
              {dateStr}
            </div>
          </div>
          <div className="w-10 h-10 rounded-full bg-white/28 border border-white/55 flex items-center justify-center text-xl">
            {user?.nickname?.[0] ?? '👤'}
          </div>
        </div>

        {/* Baby Card */}
        {currentBaby && (
          <div className="mx-4 relative z-10">
            <div className="bg-white/15 border border-white/30 rounded-[18px] p-4 backdrop-blur-sm relative overflow-hidden">
              <div className="absolute right-[-20px] top-[-20px] w-24 h-24 rounded-full bg-white/10 pointer-events-none" />
              <div className="flex items-center gap-3 mb-4 relative z-10">
                <div className="w-12 h-12 rounded-full bg-white/25 border-2 border-white/50 flex items-center justify-center text-2xl flex-shrink-0">
                  {currentBaby.gender === 'female' ? '👧' : currentBaby.gender === 'male' ? '👦' : '🐣'}
                </div>
                <div className="flex-1">
                  <div className="text-lg font-bold text-white">{currentBaby.name}</div>
                  <div className="text-xs text-white/80 mt-0.5">{getBabyAge(currentBaby.birthDate)}</div>
                </div>
                <div className="bg-white/22 border border-white/40 rounded-full px-3 py-1 text-xs font-semibold text-white">
                  {currentBaby.gender === 'female' ? '女宝' : currentBaby.gender === 'male' ? '男宝' : '宝宝'}
                </div>
              </div>
              <div className="flex rounded-xl overflow-hidden bg-black/10 relative z-10">
                {[
                  { val: records.length, unit: '次', label: '喂奶' },
                  { val: 0, unit: '次', label: '睡眠' },
                  { val: 0, unit: '次', label: '换尿布' },
                ].map((stat, i) => (
                  <div key={i} className={`flex-1 text-center py-2.5 ${i < 2 ? 'border-r border-white/18' : ''}`}>
                    <div className="text-xl font-extrabold text-white leading-none tracking-tight">
                      {stat.val}<span className="text-xs font-semibold opacity-80">{stat.unit}</span>
                    </div>
                    <div className="text-[10px] text-white/65 mt-1">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 h-7 bg-bg rounded-t-3xl" />
      </div>

      {/* 内容区 */}
      <div className="px-4 space-y-4 pt-2 pb-6">
        {/* 快捷记录 */}
        <div>
          <div className="text-sm font-semibold text-text mb-3">快捷记录</div>
          <div className="grid grid-cols-3 gap-2.5">
            {quickActions.map(({ type, label, emoji, bg, textColor }) => (
              <button
                key={type}
                onClick={() => navigate('/records')}
                className={`${bg} rounded-xl p-3 flex flex-col items-center gap-1.5 active:scale-95 transition-transform`}
              >
                <span className="text-2xl">{emoji}</span>
                <span className={`text-xs font-medium ${textColor}`}>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 最近记录 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-text">最近喂奶记录</div>
            <button onClick={() => navigate('/records')} className="text-xs text-primary font-medium">查看全部</button>
          </div>

          {records.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
              <div className="text-3xl mb-2">🍼</div>
              <div className="text-sm text-subtext">今天还没有喂奶记录</div>
              <div className="text-xs text-subtext/70 mt-1">点击上方「喂奶」快速添加</div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {records.map((rec, i) => {
                const cfg = recordTypeCfg[rec.type] ?? { label: rec.type, emoji: '📌', color: '#9A7E82' }
                return (
                  <div key={rec.id} className={`flex items-center px-4 py-3 gap-3 ${i > 0 ? 'border-t border-border' : ''}`}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0" style={{ backgroundColor: `${cfg.color}18` }}>
                      {cfg.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-text">{cfg.label}</div>
                      {rec.note && <div className="text-xs text-subtext truncate mt-0.5">{rec.note as string}</div>}
                    </div>
                    <div className="text-xs text-subtext flex-shrink-0">{formatTime(rec.startTime)}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
