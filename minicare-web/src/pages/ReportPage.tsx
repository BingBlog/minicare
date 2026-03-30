/**
 * 报告页面
 * UI 严格对齐 minicare/ui-draft/report.html
 *
 * 结构：
 *   - 页面标题「报告」+ 副标题
 *   - 时间范围选择（7天 / 14天 / 30天 / 自定义）
 *   - 生成综合报告面板（含加载状态）
 *   - 报告预览卡片（生成后展示）
 *   - 历史报告列表
 *   - 完整历史报告底部弹层
 */
import { useState } from 'react'
import { useAppStore } from '@/lib/store'

// ── SVG 图标 ──────────────────────────────────────────────────────
const IconFileText = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 24, height: 24 }}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
  </svg>
)
const IconBarChart2 = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
    <line x1="18" y1="20" x2="18" y2="10"/>
    <line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6"  y1="20" x2="6"  y2="14"/>
  </svg>
)
const IconTrendingUp = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
    <polyline points="17 6 23 6 23 12"/>
  </svg>
)
const IconFileTextSm = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
)
const IconChevronRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#C0A8AD" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
    <polyline points="9 18 15 12 9 6"/>
  </svg>
)

// ── 报告图标组件（小尺寸，用于完整报告弹层）──────────────────────
const IconMilk = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#F87098" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, flexShrink: 0 }}>
    <path d="M8 2h8l1 6H7L8 2z"/><path d="M7 8c0 0-1 1-1 4s1 10 6 10 6-7 6-10-1-4-1-4"/>
  </svg>
)
const IconMoon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#7B68EE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, flexShrink: 0 }}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
)
const IconActivity = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#DDB870" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, flexShrink: 0 }}>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
)
const IconDroplets = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#4CAF82" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, flexShrink: 0 }}>
    <path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/>
  </svg>
)
const IconRuler = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#4CAF82" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, flexShrink: 0 }}>
    <path d="M21.3 8.7 8.7 21.3c-1 1-2.5 1-3.4 0l-2.6-2.6c-1-1-1-2.5 0-3.4L15.3 2.7c1-1 2.5-1 3.4 0l2.6 2.6c1 1 1 2.5 0 3.4z"/>
    <line x1="7.5" y1="10.5" x2="9" y2="12"/>
  </svg>
)
const IconHeart = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#F87098" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, flexShrink: 0 }}>
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>
)
const IconStethoscope = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#F87098" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, flexShrink: 0 }}>
    <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/>
    <path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4"/>
    <circle cx="20" cy="10" r="2"/>
  </svg>
)
const IconSmile = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#DDB870" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, flexShrink: 0 }}>
    <circle cx="12" cy="12" r="10"/><path d="M8 13s1.5 2 4 2 4-2 4-2"/>
    <line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
  </svg>
)
const IconClose = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)
const IconWarn = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 11, height: 11 }}>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
  </svg>
)

// ── 时间范围配置 ──────────────────────────────────────────────────
const rangeOptions = [
  { key: '7', label: '7天',  text: '近7天' },
  { key: '14', label: '14天', text: '近14天' },
  { key: '30', label: '30天', text: '近30天' },
  { key: 'custom', label: '自定义', text: '自定义' },
]

function getRangeText(key: string): string {
  const now = new Date()
  const fmt = (d: Date) =>
    `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
  if (key === 'custom') return '自定义时间范围'
  const days = parseInt(key, 10)
  const start = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000)
  return `${fmt(start)}—${fmt(now)}（${days}天）`
}

// ── 历史报告条目 ──────────────────────────────────────────────────
interface HistoryItem {
  title: string
  date: string
  range: string
  size: string
  icon: React.ReactElement
}

const historyItems: HistoryItem[] = [
  {
    title: '综合报告',
    date: '2026年3月21日',
    range: '7天',
    size: '1.2MB',
    icon: <IconBarChart2 />,
  },
  {
    title: '综合报告',
    date: '2026年3月14日',
    range: '14天',
    size: '2.3MB',
    icon: <IconTrendingUp />,
  },
  {
    title: '综合报告',
    date: '2026年3月7日',
    range: '30天',
    size: '3.8MB',
    icon: <IconFileTextSm />,
  },
]

// ── 报告各模块数据（模拟）────────────────────────────────────────
interface ReportData {
  title: string
  dateRange: string
}

// ── 完整报告弹层 ──────────────────────────────────────────────────
function FullReportModal({
  open,
  data,
  onClose,
  onShare,
  onSave,
}: {
  open: boolean
  data: ReportData | null
  onClose: () => void
  onShare: () => void
  onSave: () => void
}) {
  if (!open || !data) return null

  const sections = [
    {
      key: 'feeding',
      label: '饮食',
      icon: <IconMilk />,
      stats: [
        { val: '3,360', unit: 'ml', name: '总奶量' },
        { val: '480', unit: 'ml', name: '日均奶量' },
        { val: '21', unit: '次', name: '喂养次数' },
      ],
      note: '当前阶段：氨基酸奶粉。辅食：南瓜泥观察期 D3（共5天），暂无异常反应。',
      badges: [],
    },
    {
      key: 'sleep',
      label: '睡眠',
      icon: <IconMoon />,
      stats: [
        { val: '62.5', unit: 'h', name: '总睡眠' },
        { val: '8.9', unit: 'h', name: '日均' },
        { val: '89%', unit: '', name: '质量良好' },
      ],
      note: '夜间睡眠平均连续 5.2h，小睡 2～3 次/天，整体趋势稳定。',
      badges: [],
    },
    {
      key: 'activity',
      label: '活动',
      icon: <IconActivity />,
      stats: [
        { val: '12', unit: '次', name: '活动记录' },
        { val: '5', unit: '次', name: '户外活动' },
        { val: '3', unit: '次', name: '爬行练习' },
      ],
      note: '本周抬头训练表现良好，户外活动无异常皮肤反应。',
      badges: [],
    },
    {
      key: 'diaper',
      label: '尿布',
      icon: <IconDroplets />,
      stats: [
        { val: '21', unit: '次', name: '换尿布' },
        { val: '14', unit: '次', name: '大便' },
        { val: 'Bristol 3-4', unit: '', name: '大便性状' },
      ],
      note: '大便性状以软便为主（Bristol 3-4级），颜色正常。本周未见血丝或黏液。',
      badges: [],
    },
    {
      key: 'growth',
      label: '生长',
      icon: <IconRuler />,
      stats: [
        { val: '68', unit: 'cm', name: '身高' },
        { val: '7.5', unit: 'kg', name: '体重' },
        { val: '43', unit: 'cm', name: '头围' },
      ],
      note: 'WHO 百分位：身高 P50、体重 P45、头围 P48，生长曲线趋势正常。',
      badges: [],
    },
    {
      key: 'health',
      label: '健康',
      icon: <IconHeart />,
      stats: [],
      note: '用药：益生菌（2次），维生素D（每日）。保湿护理坚持每日2次，皮肤状态稳定。',
      badges: [
        { label: '✓ 本周无皮疹', type: 'green' },
        { label: '✓ 无呕吐腹泻', type: 'green' },
        { label: '用药 2 次', type: 'yellow', warn: true },
      ],
    },
    {
      key: 'medical',
      label: '医疗',
      icon: <IconStethoscope />,
      stats: [],
      note: '距上次儿保检查 18 天。建议 3 个月龄时进行儿保随访。',
      badges: [
        { label: '✓ 本周无就诊', type: 'green' },
      ],
    },
    {
      key: 'symptom',
      label: '表现',
      icon: <IconSmile />,
      stats: [],
      note: '本周记录心情 7 次，6 次评为"开心"，精神状态无异常波动。',
      badges: [
        { label: '✓ 心情良好率 86%', type: 'green' },
        { label: '✓ 精神状态佳', type: 'green' },
      ],
    },
  ]

  const badgeStyle = (type: string) => {
    if (type === 'green') return { background: '#DCFCE7', color: '#166534' }
    if (type === 'red')   return { background: '#FFF0F4', color: '#F05060' }
    return { background: '#FEF9C3', color: '#854D0E' }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="flex-1 flex flex-col mt-12 rounded-t-3xl overflow-hidden"
        style={{
          background: '#FFF8FA',
          maxWidth: 430,
          margin: '48px auto 0',
          width: '100%',
        }}
      >
        {/* 弹层头部 */}
        <div
          className="flex items-start gap-3 px-5 py-4 flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, #F87098, #E85076)',
            position: 'sticky',
            top: 0,
            zIndex: 2,
          }}
        >
          <div className="flex-1">
            <div className="text-[16px] font-bold text-white leading-snug">{data.title}</div>
            <div className="text-[12px] text-white mt-0.5" style={{ opacity: 0.85 }}>{data.dateRange}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center flex-shrink-0 border-none cursor-pointer"
            style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'rgba(255,255,255,0.25)',
            }}
          >
            <IconClose />
          </button>
        </div>

        {/* 弹层内容 */}
        <div className="flex-1 overflow-y-auto">
          {sections.map((sec, si) => (
            <div
              key={sec.key}
              className="px-4 py-3.5"
              style={si < sections.length - 1 ? { borderBottom: '.5px solid #F5F0F2' } : {}}
            >
              {/* 节标题 */}
              <div className="flex items-center gap-1.5 mb-2.5 text-[13px] font-bold text-[#9A8090] tracking-[.5px]">
                {sec.icon}
                {sec.label}
              </div>
              {/* 统计网格 */}
              {sec.stats.length > 0 && (
                <div
                  className="grid mb-2"
                  style={{ gridTemplateColumns: `repeat(${Math.min(sec.stats.length, 3)},1fr)`, gap: 8 }}
                >
                  {sec.stats.map((st) => (
                    <div
                      key={st.name}
                      className="text-center py-2 rounded-xl"
                      style={{ background: '#FFF8FA' }}
                    >
                      <div className="text-[18px] font-extrabold text-[#4A3035] leading-none">
                        {st.val}
                        {st.unit && <span className="text-[10px] font-medium text-[#9A8090] ml-0.5">{st.unit}</span>}
                      </div>
                      <div className="text-[10px] text-[#9A8090] mt-1">{st.name}</div>
                    </div>
                  ))}
                </div>
              )}
              {/* 徽章 */}
              {sec.badges.length > 0 && (
                <div className="flex gap-2 flex-wrap mb-2">
                  {sec.badges.map((b, bi) => (
                    <span
                      key={bi}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold"
                      style={badgeStyle(b.type)}
                    >
                      {b.warn && <IconWarn />}
                      {b.label}
                    </span>
                  ))}
                </div>
              )}
              {/* 备注 */}
              <div className="text-[12px] text-[#9A8090] leading-relaxed">{sec.note}</div>
            </div>
          ))}

          {/* 操作按钮 */}
          <div className="flex gap-2.5 px-4 py-4 pb-8">
            <button
              type="button"
              onClick={onShare}
              className="flex-1 py-3.5 text-white font-bold text-[14px] border-none cursor-pointer rounded-xl active:scale-[0.97] transition-transform"
              style={{
                background: 'linear-gradient(90deg, #F87098, #F9A8C0)',
                boxShadow: '0 4px 14px rgba(248,112,152,.35)',
              }}
            >
              分享给医生
            </button>
            <button
              type="button"
              onClick={onSave}
              className="flex-1 py-3.5 text-[#4A3035] font-semibold text-[14px] border-none cursor-pointer rounded-xl active:scale-[0.97] transition-transform"
              style={{ background: '#F5F0F2' }}
            >
              保存 PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ══ 报告页面主体 ══════════════════════════════════════════════════
export default function ReportPage() {
  const { currentBaby } = useAppStore()

  // 时间范围
  const [activeRange, setActiveRange] = useState('7')

  // 生成报告状态
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState(false)

  // 历史报告弹层
  const [modalOpen, setModalOpen] = useState(false)
  const [modalData, setModalData] = useState<ReportData | null>(null)

  // Toast
  const [toast, setToast] = useState('')
  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2200)
  }

  const babyName = currentBaby?.name ?? '小宝'

  const handleGenerate = () => {
    if (generating) return
    setGenerating(true)
    setTimeout(() => {
      setGenerating(false)
      setGenerated(true)
      showToast('✓ 综合报告已生成')
    }, 2000)
  }

  const handleOpenHistory = (item: HistoryItem) => {
    setModalData({
      title: `${babyName} · ${item.title}`,
      dateRange: `${item.date} · ${item.range} · 牛奶蛋白过敏（中度）`,
    })
    setModalOpen(true)
  }

  return (
    <div className="min-h-full bg-bg flex flex-col">

      {/* ── 页面标题 ── */}
      <div className="px-5 pt-12 pb-1 bg-bg flex-shrink-0">
        <div className="text-[22px] font-extrabold text-[#4A3035] tracking-tight">报告</div>
        <div className="text-[13px] text-[#9A8090] mt-0.5">生成综合报告 · 一键分享给医生</div>
      </div>

      <div className="flex-1 overflow-y-auto pb-28">

        {/* ── 时间范围 ── */}
        <div
          className="text-[12px] font-semibold text-[#9A8090] px-5 pb-1.5 tracking-[.5px]"
          style={{ paddingTop: 14 }}
        >
          时间范围
        </div>
        <div
          className="mx-4 flex rounded-xl overflow-hidden p-1"
          style={{ background: '#F0EAEC' }}
        >
          {rangeOptions.map(({ key, label }) => (
            <div
              key={key}
              onClick={() => setActiveRange(key)}
              className="flex-1 text-center py-2.5 rounded-[10px] cursor-pointer text-[13px] font-semibold transition-all"
              style={
                activeRange === key
                  ? { background: '#fff', color: '#4A3035', boxShadow: '0 1px 6px rgba(0,0,0,0.09)' }
                  : { color: '#9A8090' }
              }
            >
              {label}
            </div>
          ))}
        </div>

        {/* ── 生成综合报告 ── */}
        <div
          className="text-[12px] font-semibold text-[#9A8090] px-5 pb-1.5 tracking-[.5px]"
          style={{ paddingTop: 14 }}
        >
          生成综合报告
        </div>
        <div
          className="mx-4 bg-white rounded-2xl p-4 flex flex-col gap-3"
          style={{ boxShadow: '0 2px 10px rgba(200,100,120,0.08)' }}
        >
          {/* 说明 */}
          <div className="flex items-start gap-2.5">
            <div style={{ color: '#F0B8C8', flexShrink: 0, marginTop: 2 }}>
              <IconFileText />
            </div>
            <div className="text-[13px] text-[#9A8090] leading-relaxed flex-1">
              将生成 <strong className="text-[#4A3035]">综合报告</strong>，覆盖{' '}
              <strong className="text-[#4A3035]">{getRangeText(activeRange)}</strong>，
              包含饮食·睡眠·活动·尿布·生长·健康·医疗·表现全部模块，约 4～6 页 PDF。
            </div>
          </div>

          {/* 加载状态 */}
          {generating && (
            <div className="flex items-center justify-center gap-2.5 py-2">
              <div
                className="rounded-full"
                style={{
                  width: 20, height: 20,
                  border: '2.5px solid #F5EAEC',
                  borderTopColor: '#F87098',
                  animation: 'spin 1s linear infinite',
                }}
              />
              <span className="text-[13px] text-[#9A8090]">正在本地生成 PDF…</span>
            </div>
          )}

          {/* 生成按钮 */}
          {!generating && (
            <button
              type="button"
              onClick={handleGenerate}
              className="w-full py-3.5 text-white font-bold text-[15px] border-none cursor-pointer rounded-xl transition-transform active:scale-[0.97]"
              style={{
                background: 'linear-gradient(90deg, #F87098, #F9A8C0)',
                boxShadow: '0 4px 14px rgba(248,112,152,.35)',
              }}
            >
              {generated ? '✓ 重新生成' : '生成报告'}
            </button>
          )}
        </div>

        {/* ── 报告预览（生成后展示）── */}
        {generated && (
          <>
            <div
              className="text-[12px] font-semibold text-[#9A8090] px-5 pb-1.5 tracking-[.5px]"
              style={{ paddingTop: 14 }}
            >
              报告预览
            </div>
            <div
              className="mx-4 bg-white rounded-2xl overflow-hidden"
              style={{ boxShadow: '0 2px 10px rgba(200,100,120,0.08)' }}
            >
              {/* 预览头部 */}
              <div
                className="px-4 py-4"
                style={{ background: 'linear-gradient(135deg, #F87098, #E85076)' }}
              >
                <div className="text-[16px] font-bold text-white">{babyName} · 综合报告</div>
                <div className="text-[12px] text-white mt-1" style={{ opacity: 0.85 }}>
                  {getRangeText(activeRange)} · 牛奶蛋白过敏（中度）
                </div>
              </div>

              {/* 饮食预览 */}
              <div className="px-4 py-3.5" style={{ borderBottom: '.5px solid #F5F0F2' }}>
                <div className="text-[12px] font-bold text-[#9A8090] tracking-[.5px] mb-2">饮食</div>
                <div className="flex gap-4">
                  {[
                    { val: '3,360', unit: 'ml', name: '7天总奶量' },
                    { val: '480', unit: 'ml/天', name: '平均每天' },
                    { val: '21', unit: '次', name: '喂养次数' },
                  ].map((s) => (
                    <div key={s.name} className="text-center">
                      <div className="text-[20px] font-extrabold text-[#4A3035] leading-none">
                        {s.val}
                      </div>
                      <div className="text-[11px] text-[#9A8090]">{s.unit}</div>
                      <div className="text-[10px] text-[#9A8090] mt-0.5">{s.name}</div>
                    </div>
                  ))}
                </div>
                {/* mini bar chart */}
                <div className="mt-2" style={{ height: 44, overflow: 'hidden' }}>
                  <svg viewBox="0 0 320 50" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
                    {[
                      { x: 5, y: 14, h: 36 }, { x: 50, y: 8, h: 42 }, { x: 95, y: 18, h: 32 },
                      { x: 140, y: 10, h: 40 }, { x: 185, y: 6, h: 44 }, { x: 230, y: 12, h: 38 },
                    ].map((b, i) => (
                      <rect key={i} x={b.x} y={b.y} width="35" height={b.h} rx="4" fill="#FFF0F4" stroke="#F87098" strokeWidth="1.5" />
                    ))}
                    <rect x="275" y="4" width="35" height="46" rx="4" fill="#F87098" opacity="0.8" />
                  </svg>
                </div>
              </div>

              {/* 睡眠预览 */}
              <div className="px-4 py-3.5" style={{ borderBottom: '.5px solid #F5F0F2' }}>
                <div className="text-[12px] font-bold text-[#9A8090] tracking-[.5px] mb-2">睡眠</div>
                <div className="flex gap-4">
                  {[
                    { val: '62.5', unit: 'h', name: '7天总睡眠' },
                    { val: '8.9', unit: 'h/天', name: '平均每天' },
                    { val: '89%', unit: '', name: '质量良好占比' },
                  ].map((s) => (
                    <div key={s.name} className="text-center">
                      <div className="text-[20px] font-extrabold text-[#4A3035] leading-none">{s.val}</div>
                      <div className="text-[11px] text-[#9A8090]">{s.unit}</div>
                      <div className="text-[10px] text-[#9A8090] mt-0.5">{s.name}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 表现&健康预览 */}
              <div className="px-4 py-3.5">
                <div className="text-[12px] font-bold text-[#9A8090] tracking-[.5px] mb-2">表现 & 健康</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold"
                    style={{ background: '#DCFCE7', color: '#166534' }}
                  >
                    本周无异常表现 ✓
                  </span>
                  <span className="text-[12px] text-[#9A8090]">持续氨基酸奶粉稳定期</span>
                </div>
              </div>
            </div>

            {/* 分享 / 保存按钮 */}
            <div className="flex gap-2.5 px-4 py-3.5">
              <button
                type="button"
                onClick={() => showToast('调用系统分享面板')}
                className="flex-1 py-3.5 text-white font-bold text-[14px] border-none cursor-pointer rounded-xl active:scale-[0.97] transition-transform"
                style={{
                  background: 'linear-gradient(90deg, #F87098, #F9A8C0)',
                  boxShadow: '0 4px 14px rgba(248,112,152,.35)',
                }}
              >
                分享报告
              </button>
              <button
                type="button"
                onClick={() => showToast('报告已保存到文件')}
                className="flex-1 py-3.5 text-[#4A3035] font-semibold text-[14px] border-none cursor-pointer rounded-xl active:scale-[0.97] transition-transform"
                style={{ background: '#F5F0F2' }}
              >
                保存到文件
              </button>
            </div>
          </>
        )}

        {/* ── 历史报告 ── */}
        <div
          className="text-[12px] font-semibold text-[#9A8090] px-5 pb-1.5 tracking-[.5px]"
          style={{ paddingTop: 14 }}
        >
          历史报告
        </div>
        <div
          className="mx-4 bg-white rounded-2xl overflow-hidden"
          style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.07)' }}
        >
          {historyItems.map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-3.5 cursor-pointer active:bg-[#FFF8FA] transition-colors"
              style={i > 0 ? { borderTop: '.5px solid #F5F0F2' } : {}}
              onClick={() => handleOpenHistory(item)}
            >
              {/* 图标 */}
              <div
                className="flex items-center justify-center rounded-xl flex-shrink-0"
                style={{ width: 36, height: 36, background: '#FFF0F4', color: '#F87098' }}
              >
                {item.icon}
              </div>
              {/* 元信息 */}
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold text-[#4A3035]">{item.title}</div>
                <div className="text-[12px] text-[#9A8090] mt-0.5">
                  {item.date} · {item.range}
                </div>
              </div>
              {/* 文件大小 */}
              <div className="text-[12px] text-[#9A8090] mr-1 flex-shrink-0">{item.size}</div>
              <IconChevronRight />
            </div>
          ))}
        </div>

        <div className="h-6" />
      </div>

      {/* ── 完整报告弹层 ── */}
      <FullReportModal
        open={modalOpen}
        data={modalData}
        onClose={() => setModalOpen(false)}
        onShare={() => { setModalOpen(false); showToast('调用系统分享面板') }}
        onSave={() => { setModalOpen(false); showToast('报告已保存到文件') }}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-[#4A3035] text-white text-sm px-5 py-2.5 rounded-full z-[60] whitespace-nowrap shadow-lg">
          {toast}
        </div>
      )}

      {/* spin keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
