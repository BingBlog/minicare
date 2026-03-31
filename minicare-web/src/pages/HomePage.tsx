/**
 * 首页
 * UI 严格对齐 minicare/ui-draft/home.html
 */
import { useState, useEffect, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import { familyApi, babyApi, recordsApi } from '@/api'
import { useAppStore } from '@/lib/store'
import type { TodayRecord } from '@/api'

// ── 工具函数 ──────────────────────────────────────────────────────
function getBabyAge(birthDate: string): string {
  const birth = new Date(birthDate)
  const now   = new Date()
  const totalDays = Math.floor((now.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24))
  const months = Math.floor(totalDays / 30)
  const days   = totalDays % 30
  if (months < 1) return `${totalDays}天`
  return `${months}个月${days}天`
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return '早上好'
  if (h < 18) return '下午好'
  return '晚上好'
}

// ── SVG 图标（对齐 ui-draft Lucide 图标） ─────────────────────────
const IconMilk = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 19, height: 19 }}>
    <path d="M8 2h8l1 6H7L8 2z"/><path d="M7 8c0 0-1 1-1 4s1 10 6 10 6-7 6-10-1-4-1-4"/>
    <path d="M10 14s.5 1 2 1 2-1 2-1"/>
  </svg>
)
const IconMoon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 19, height: 19 }}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
)
const IconDroplets = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 19, height: 19 }}>
    <path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/>
  </svg>
)
const IconActivity = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 19, height: 19 }}>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
)
const IconRuler = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 19, height: 19 }}>
    <path d="M21.3 8.7 8.7 21.3c-1 1-2.5 1-3.4 0l-2.6-2.6c-1-1-1-2.5 0-3.4L15.3 2.7c1-1 2.5-1 3.4 0l2.6 2.6c1 1 1 2.5 0 3.4z"/><line x1="7.5" y1="10.5" x2="9" y2="12"/><line x1="10.5" y1="7.5" x2="12" y2="9"/><line x1="13.5" y1="4.5" x2="15" y2="6"/>
  </svg>
)
const IconHeart = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 19, height: 19 }}>
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>
)
const IconStethoscope = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 19, height: 19 }}>
    <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/><path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4"/><circle cx="20" cy="10" r="2"/>
  </svg>
)
const IconSmile = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 19, height: 19 }}>
    <circle cx="12" cy="12" r="10"/><path d="M8 13s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
  </svg>
)

// ── 快捷记录宫格配置（4 列，SVG 图标） ──────────────────────────────
const quickActions = [
  { key: 'feeding',  label: '饮食',  icon: <IconMilk />,        path: '/records/form/feeding' },
  { key: 'diaper',   label: '尿布',  icon: <IconDroplets />,    path: '/records/form/diaper' },
  { key: 'sleep',    label: '睡眠',  icon: <IconMoon />,        path: '/records/form/sleep' },
  { key: 'activity', label: '活动',  icon: <IconActivity />,    path: '/records/form/activity' },
  { key: 'growth',   label: '生长',  icon: <IconRuler />,       path: '/records/form/growth' },
  { key: 'health',   label: '健康',  icon: <IconHeart />,       path: '/records/form/health' },
  { key: 'medical',  label: '医疗',  icon: <IconStethoscope />, path: '/records/form/medical' },
  { key: 'symptom',  label: '表现',  icon: <IconSmile />,       path: '/records/form/symptom' },
]

// ── FAB Sheet 条目配置 ─────────────────────────────────────────────
const fabItems = [
  { key: 'feeding',  label: '饮食记录', sub: '喂奶 · 辅食 · 营养素',    icon: <IconMilk />,        path: '/records/form/feeding' },
  { key: 'sleep',    label: '睡眠记录', sub: '计时模式 · 补录模式',     icon: <IconMoon />,        path: '/records/form/sleep' },
  { key: 'activity', label: '活动',     sub: '爬走练习 · 视力活动 · 户外活动', icon: <IconActivity />,    path: '/records/form/activity' },
  { key: 'diaper',   label: '尿布',     sub: '大便次数性状 · 小便次数', icon: <IconDroplets />,    path: '/records/form/diaper' },
  { key: 'health',   label: '健康',     sub: '过敏表现 · 用药 · 护理',  icon: <IconHeart />,       path: '/records/form/health' },
  { key: 'symptom',  label: '表现',     sub: '心情状态 · 精神状态',     icon: <IconSmile />,       path: '/records/form/symptom' },
  { key: 'growth',   label: '生长记录', sub: '身高 · 体重 · 头围',      icon: <IconRuler />,       path: '/records/form/growth' },
  { key: 'medical',  label: '医疗记录', sub: '儿保 · 过敏检查 · 就诊',  icon: <IconStethoscope />, path: '/records/form/medical' },
]

// ── 记录类型配置 ──────────────────────────────────────────────────
const recordTypeCfg: Record<string, { label: string; icon: JSX.Element; bg: string; color: string }> = {
  feeding:  { label: '喂奶',   bg: '#fff0f4', color: '#f0b8c8', icon: <IconMilk /> },
  sleep:    { label: '睡眠',   bg: '#fff0f4', color: '#f0b8c8', icon: <IconMoon /> },
  diaper:   { label: '尿布',   bg: '#e8f5e9', color: '#4CAF82', icon: <IconDroplets /> },
  activity: { label: '活动',   bg: '#fff8e6', color: '#DDB870', icon: <IconActivity /> },
  health:   { label: '健康',   bg: '#f0fbf4', color: '#4CAF82', icon: <IconHeart /> },
  growth:   { label: '生长',   bg: '#fff8f0', color: '#F5A623', icon: <IconRuler /> },
  symptom:  { label: '表现',   bg: '#fff0f4', color: '#f0a0b0', icon: <IconSmile /> },
  medical:  { label: '医疗',   bg: '#f0f4ff', color: '#5B9BD5', icon: <IconStethoscope /> },
}

// ── 过敏相关标签 ──────────────────────────────────────────────────
const allergyTypeLabels: Record<string, string> = {
  milk: '牛奶蛋白', egg: '鸡蛋', wheat: '小麦/麸质', peanut: '花生',
  tree_nut: '坚果', soy: '大豆', fish: '鱼类', shellfish: '贝类', other: '其他',
}
const allergyLevelLabels: Record<string, string> = {
  mild: '轻度', moderate: '中度', severe: '重度', unknown: '待评估',
}

// ── 主组件 ────────────────────────────────────────────────────────
export default function HomePage() {
  const navigate = useNavigate()
  const { user, currentFamily, currentBaby, setCurrentFamily, setCurrentBaby } = useAppStore()

  const [todayRecords, setTodayRecords] = useState<TodayRecord[]>([])
  const [loading, setLoading]           = useState(true)
  const [fabOpen, setFabOpen]           = useState(false)
  const [toast, setToast]               = useState('')

  const today   = new Date()
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][today.getDay()]
  const dateStr = `${today.getMonth() + 1}月${today.getDate()}日 星期${weekday}`

  useEffect(() => {
    async function load() {
      try {
        let family = currentFamily
        if (!family) {
          const families = await familyApi.getMine()
          if (families.length === 0) { navigate('/onboarding', { replace: true }); return }
          family = families[0]
          setCurrentFamily(family)
        }
        let baby = currentBaby
        if (!baby) {
          try {
            baby = await babyApi.get(family.id)
            setCurrentBaby(baby)
          } catch {
            navigate('/onboarding', { replace: true }); return
          }
        }
        try {
          const recs = await recordsApi.today(family.id)
          setTodayRecords(recs)
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

  // ── 今日各类统计 ──────────────────────────────────────────────────
  const feedingRecs  = todayRecords.filter((r) => r.type === 'feeding')
  const sleepRecs    = todayRecords.filter((r) => r.type === 'sleep')
  const diaperRecs   = todayRecords.filter((r) => r.type === 'diaper')
  const symptomRecs  = todayRecords.filter((r) => r.type === 'symptom')

  // 今日奶量：从 note 中尝试解析 ml 数字（格式如 "120ml"）
  const totalMl = feedingRecs.reduce((acc, r) => {
    const m = (r.note || '').match(/(\d+)\s*ml/i)
    return acc + (m ? Number(m[1]) : 0)
  }, 0)

  // 今日睡眠：小时数（从 note 中尝试解析 duration_min）
  const totalSleepMin = sleepRecs.reduce((acc, r) => {
    const m = (r.note || '').match(/(\d+)\s*min/i)
    return acc + (m ? Number(m[1]) : 0)
  }, 0)
  const sleepH = totalSleepMin >= 60 ? `${Math.floor(totalSleepMin / 60)}` : '—'

  const babyStats = [
    { val: totalMl > 0 ? totalMl : feedingRecs.length, unit: totalMl > 0 ? 'ml' : '次', label: '今日奶量' },
    { val: sleepH,                                      unit: 'h',                       label: '今日睡眠' },
    { val: diaperRecs.length,                           unit: '次',                      label: '换尿布'   },
    { val: symptomRecs.length,                          unit: '项',                      label: '表现'     },
  ]

  // ── Toast ─────────────────────────────────────────────────────────
  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2200)
  }

  return (
    <div className="min-h-full bg-bg">

      {/* ══ L1 英雄区 ══ */}
      <div className="relative pb-7" style={{ background: 'linear-gradient(180deg, #f87098 0%, #f9a8c0 100%)' }}>
        {/* 装饰圆圈 */}
        <div className="absolute pointer-events-none" style={{ right: -40, top: -50, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.12)' }} />
        <div className="absolute pointer-events-none" style={{ right: 80, top: 30, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.07)' }} />

        {/* Header Row */}
        <div className="flex items-center justify-between px-5 pt-12 pb-4 relative z-10">
          <div>
            <div className="text-xs text-white/78 tracking-[0.2px]">
              {currentBaby ? `${dateStr} · ${currentBaby.name} ${getBabyAge(currentBaby.birth_date)}` : dateStr}
            </div>
            <div
              className="text-2xl font-bold text-white mt-1 tracking-tight"
              style={{ textShadow: '0 1px 4px rgba(248,80,100,0.25)' }}
            >
              {getGreeting()}
              {/* 挥手图标 */}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, verticalAlign: -3, display: 'inline', marginLeft: 4, color: 'rgba(255,255,255,0.9)' }}>
                <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
              </svg>
            </div>
          </div>
          {/* 头像 */}
          <div
            className="cursor-pointer"
            onClick={() => navigate('/profile')}
            style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.28)', border: '1.5px solid rgba(255,255,255,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', position: 'relative', zIndex: 1 }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22, color: '#fff' }}>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
        </div>

        {/* Baby Card */}
        {currentBaby && (
          <div
            className="mx-4 relative z-10 cursor-pointer"
            onClick={() => navigate('/profile')}
          >
            <div
              className="relative overflow-hidden"
              style={{
                background: 'linear-gradient(145deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.06) 100%)',
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: 18,
                padding: '16px 18px 18px',
                backdropFilter: 'blur(2px)',
              }}
            >
              {/* 装饰圆 */}
              <div className="absolute pointer-events-none" style={{ right: -20, top: -20, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />

              {/* 宝宝信息行 */}
              <div className="flex items-center gap-3 mb-4 relative z-10">
                <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', border: '2px solid rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 30, height: 30, color: '#fff' }}>
                    <path d="M12 2a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4"/><path d="M5 20a7 7 0 0 1 14 0"/>
                    <circle cx="8.5" cy="10" r="1" fill="currentColor"/>
                    <circle cx="15.5" cy="10" r="1" fill="currentColor"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-lg font-bold text-white tracking-[-0.3px]">{currentBaby.name}</div>
                  <div className="text-xs text-white/80 mt-0.5">
                    {currentBaby.allergy_types?.length ? allergyTypeLabels[currentBaby.allergy_types[0]] + '过敏' : '过敏宝宝'} · {getBabyAge(currentBaby.birth_date)}
                  </div>
                </div>
                {currentBaby.allergy_level && (
                  <div
                    className="text-xs font-semibold text-white flex-shrink-0"
                    style={{ background: 'rgba(255,255,255,0.22)', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 20, padding: '4px 12px' }}
                  >
                    {allergyLevelLabels[currentBaby.allergy_level] ?? currentBaby.allergy_level}
                  </div>
                )}
              </div>

              {/* 今日数据统计 4 格 */}
              <div className="flex relative z-10 rounded-xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.1)' }}>
                {babyStats.map((stat, i) => (
                  <div
                    key={i}
                    className="flex-1 text-center py-2.5 cursor-pointer active:bg-white/10"
                    style={i < 3 ? { borderRight: '1px solid rgba(255,255,255,0.18)' } : {}}
                    onClick={(e) => { e.stopPropagation(); navigate('/records') }}
                  >
                    <div className="text-[20px] font-extrabold text-white leading-none tracking-[-0.5px]">
                      {stat.val}<span className="text-[11px] font-semibold opacity-80">{stat.unit}</span>
                    </div>
                    <div className="text-[10px] text-white/65 mt-1">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Sleep Banner（睡眠进行中） ── */}
        {/* 仅当今日有进行中睡眠记录时显示；此处作为示意，实际由后端 status=sleeping 判断 */}
        {/* 暂时条件渲染：sleepBanner 由 store 或 API 决定，这里预留 */}

        {/* 底部白色圆角过渡 */}
        <div className="absolute bottom-0 left-0 right-0 bg-bg pointer-events-none" style={{ height: 28, borderRadius: '24px 24px 0 0' }} />
      </div>

      {/* ══ L2 内容区 ══ */}
      <div className="px-4 space-y-4 pt-3 pb-8">

        {/* 卡片 1：快捷记录（八大模块，4 列，SVG 图标） */}
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 2px 12px rgba(200,100,120,0.08), 0 1px 3px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center justify-between px-4 pt-3.5 pb-1.5">
            <span className="text-[11px] font-semibold text-[#9A8090] tracking-[0.8px] uppercase">快捷记录</span>
            <span
              className="text-xs text-primary font-medium cursor-pointer flex items-center gap-0.5"
              onClick={() => setFabOpen(true)}
            >
              更多 ›
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2 p-3 pt-1">
            {quickActions.map(({ key, label, icon, path }) => (
              <button
                key={key}
                type="button"
                onClick={() => navigate(path)}
                className="bg-white border border-gray-100 rounded-xl flex flex-col items-center gap-1.5 cursor-pointer transition-transform active:scale-95"
                style={{ padding: '12px 4px 10px' }}
              >
                <div
                  className="flex items-center justify-center rounded-xl"
                  style={{ width: 38, height: 38, background: '#fff0f4', color: '#f0b8c8' }}
                >
                  {icon}
                </div>
                <span className="text-[11px] font-semibold text-[#4a3035]">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 卡片 2：今日时间线 */}
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 2px 12px rgba(200,100,120,0.08), 0 1px 3px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center justify-between px-4 pt-3.5 pb-1.5">
            <span className="text-[11px] font-semibold text-[#9A8090] tracking-[0.8px] uppercase">今日时间线</span>
            <span
              className="text-xs text-primary font-medium cursor-pointer flex items-center gap-0.5"
              onClick={() => navigate('/records')}
            >
              全部 ›
            </span>
          </div>

          {todayRecords.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <div className="text-3xl mb-2">🌟</div>
              <div className="text-sm text-subtext">今日尚无记录</div>
              <div className="text-xs text-subtext/70 mt-1">点击上方快捷按钮开始记录</div>
            </div>
          ) : (
            todayRecords.map((rec, i) => {
              const cfg = recordTypeCfg[rec.type] ?? { label: rec.type, icon: <IconActivity />, bg: '#f5f5f5', color: '#9A7E82' }
              return (
                <div
                  key={rec.id}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer active:bg-gray-50 transition-colors"
                  style={i > 0 ? { borderTop: '1px solid #F5F0F2' } : {}}
                  onClick={() => navigate('/records')}
                >
                  {/* 左侧时间戳 */}
                  <span className="text-xs text-[#9A8090] flex-shrink-0 w-10 text-right">{formatTime(rec.time)}</span>
                  {/* 图标 */}
                  <div
                    className="flex items-center justify-center rounded-xl flex-shrink-0"
                    style={{ width: 36, height: 36, background: cfg.bg, color: cfg.color }}
                  >
                    {cfg.icon}
                  </div>
                  {/* 内容 */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#7a5a60]">{cfg.label}</div>
                    {rec.note && (
                      <div className="text-xs text-[#9A8090] truncate mt-0.5">{rec.note}</div>
                    )}
                  </div>
                  <span className="text-[#C0A8AD] text-base flex-shrink-0">›</span>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ══ FAB 底部弹层 ══ */}
      {fabOpen && (
        <div
          className="fixed inset-0 z-40 flex items-end"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setFabOpen(false) }}
        >
          <div
            className="w-full bg-white rounded-t-3xl overflow-hidden"
            style={{ maxWidth: 430, margin: '0 auto', paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' }}
          >
            {/* 把手 */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>
            <div className="text-center text-base font-bold text-[#4A3035] py-3">记录什么？</div>
            {fabItems.map(({ key, label, sub, icon, path }) => (
              <div
                key={key}
                className="flex items-center gap-3.5 px-5 py-3.5 cursor-pointer active:bg-[#FFF0F4] transition-colors"
                onClick={() => { setFabOpen(false); navigate(path) }}
              >
                <div
                  className="flex items-center justify-center rounded-xl flex-shrink-0"
                  style={{ width: 42, height: 42, background: '#fff0f4', color: '#e8709a' }}
                >
                  {icon}
                </div>
                <div>
                  <div className="text-base font-semibold text-[#4a3035]">{label}</div>
                  <div className="text-xs text-[#9A8090] mt-0.5">{sub}</div>
                </div>
              </div>
            ))}
            <div className="h-2" />
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-[#4A3035] text-white text-sm px-5 py-2.5 rounded-full z-50 whitespace-nowrap shadow-lg">
          ✓ {toast}
        </div>
      )}
    </div>
  )
}
