/**
 * FullReportModal 完整历史报告底部弹层
 *
 * 全屏弹层，展示某份历史报告的完整内容，包含：
 *   - 渐变头部（标题、日期范围、关闭按钮）
 *   - 各模块详情（饮食、睡眠、活动、尿布、生长、健康、医疗、表现）
 *   - 每个模块可选：统计网格 / 徽章 / 备注
 *   - 底部操作按钮（分享给医生 / 保存 PDF）
 *
 * 被引用：ReportPage.tsx
 */
import React from 'react'
import type { ReportSummary } from '@/api/report'

// ── 各模块小尺寸图标（16×16，颜色与记录类型一致）────────────────

/** 饮食图标（粉红色 #F87098） */
const IconMilk = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#F87098" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, flexShrink: 0 }}>
    <path d="M8 2h8l1 6H7L8 2z" />
    <path d="M7 8c0 0-1 1-1 4s1 10 6 10 6-7 6-10-1-4-1-4" />
  </svg>
)

/** 睡眠图标（紫色 #7B68EE） */
const IconMoon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#7B68EE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, flexShrink: 0 }}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
)

/** 活动图标（金色 #DDB870） */
const IconActivity = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#DDB870" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, flexShrink: 0 }}>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
)

/** 尿布图标（绿色 #4CAF82） */
const IconDroplets = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#4CAF82" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, flexShrink: 0 }}>
    <path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z" />
  </svg>
)

/** 生长图标（绿色 #4CAF82） */
const IconRuler = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#4CAF82" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, flexShrink: 0 }}>
    <path d="M21.3 8.7 8.7 21.3c-1 1-2.5 1-3.4 0l-2.6-2.6c-1-1-1-2.5 0-3.4L15.3 2.7c1-1 2.5-1 3.4 0l2.6 2.6c1 1 1 2.5 0 3.4z" />
    <line x1="7.5" y1="10.5" x2="9" y2="12" />
  </svg>
)

/** 健康图标（粉红色 #F87098） */
const IconHeart = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#F87098" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, flexShrink: 0 }}>
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
)

/** 医疗图标（粉红色 #F87098） */
const IconStethoscope = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#F87098" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, flexShrink: 0 }}>
    <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3" />
    <path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4" />
    <circle cx="20" cy="10" r="2" />
  </svg>
)

/** 表现图标（金色 #DDB870） */
const IconSmile = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#DDB870" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, flexShrink: 0 }}>
    <circle cx="12" cy="12" r="10" />
    <path d="M8 13s1.5 2 4 2 4-2 4-2" />
    <line x1="9" y1="9" x2="9.01" y2="9" />
    <line x1="15" y1="9" x2="15.01" y2="9" />
  </svg>
)

/** 关闭按钮图标（白色，用于渐变头部） */
const IconClose = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

/**
 * 警告三角图标（小号，用于黄色徽章）
 * 尺寸：11×11，颜色继承 currentColor
 */
const IconWarn = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 11, height: 11 }}>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
  </svg>
)

// ── 类型定义 ──────────────────────────────────────────────────────

/** 统计格子数据 */
interface StatItem {
  val: string
  unit: string
  name: string
}

/** 状态徽章 */
interface BadgeItem {
  label: string
  type: 'green' | 'red' | 'yellow'
  warn?: boolean
}

/** 报告各模块节数据 */
interface ReportSection {
  key: string
  label: string
  icon: React.ReactElement
  stats: StatItem[]
  note: string
  badges: BadgeItem[]
}

/** 传给弹层的报告元数据 */
export interface ReportData {
  title: string
  dateRange: string
}

/** FullReportModal 属性 */
interface FullReportModalProps {
  open: boolean
  data: ReportData | null
  /** 真实报告聚合数据（null 时展示默认描述） */
  summary: ReportSummary | null
  /** 数据是否正在加载中（显示加载动画） */
  loading?: boolean
  onClose: () => void
  onShare: () => void
  onSave: () => void
}

// ── 辅助格式化函数 ──────────────────────────────────────────────

function fmtH(min: number): string {
  return (min / 60).toFixed(1)
}

function mmToCm(mm: number | null): string {
  return mm != null ? (mm / 10).toFixed(1) : '--'
}

function gToKg(g: number | null): string {
  return g != null ? (g / 1000).toFixed(1) : '--'
}

/**
 * 完整报告详情弹层
 *
 * @example
 * <FullReportModal
 *   open={modalOpen}
 *   data={modalData}
 *   summary={reportSummary}
 *   onClose={() => setModalOpen(false)}
 *   onShare={handleShare}
 *   onSave={handleSave}
 * />
 */
export default function FullReportModal({ open, data, summary, onClose, onShare, onSave }: FullReportModalProps) {
  if (!open || !data) return null

  const days = summary?.days ?? 7

  // ── 构建各模块 sections ────────────────────────────────────────
  const sections: ReportSection[] = [
    // 饮食
    {
      key: 'feeding',
      label: '饮食',
      icon: <IconMilk />,
      stats: summary
        ? [
            { val: summary.feeding.totalFormulaMl.toLocaleString(), unit: 'ml', name: '总奶量' },
            { val: String(summary.feeding.avgDailyFormulaMl),        unit: 'ml', name: '日均奶量' },
            { val: String(summary.feeding.totalFeedCount),           unit: '次', name: '喂养次数' },
          ]
        : [
            { val: '--', unit: 'ml', name: '总奶量'  },
            { val: '--', unit: 'ml', name: '日均奶量' },
            { val: '--', unit: '次', name: '喂养次数' },
          ],
      note: summary
        ? `母乳 ${summary.feeding.breastCount} 次 · 配方奶 ${summary.feeding.formulaCount} 次${summary.feeding.complementaryCount > 0 ? ` · 辅食 ${summary.feeding.complementaryCount} 次` : ''}。${summary.foodObservation.items.length > 0 ? `已引入辅食：${summary.foodObservation.items.map((f) => f.foodName).join('、')}。` : ''}`
        : '暂无饮食数据。',
      badges: [],
    },

    // 睡眠
    {
      key: 'sleep',
      label: '睡眠',
      icon: <IconMoon />,
      stats: summary
        ? [
            { val: fmtH(summary.sleep.totalMin),      unit: 'h',  name: '总睡眠'  },
            { val: fmtH(summary.sleep.avgDailyMin),   unit: 'h',  name: '日均'    },
            { val: String(summary.sleep.sessionCount), unit: '段', name: '睡眠段数' },
          ]
        : [
            { val: '--', unit: 'h',  name: '总睡眠' },
            { val: '--', unit: 'h',  name: '日均'   },
            { val: '--', unit: '段', name: '睡眠段数' },
          ],
      note: summary
        ? `${days}天共 ${fmtH(summary.sleep.totalMin)}h，平均每天 ${fmtH(summary.sleep.avgDailyMin)}h，共 ${summary.sleep.sessionCount} 段睡眠。`
        : '暂无睡眠数据。',
      badges: [],
    },

    // 活动
    {
      key: 'activity',
      label: '活动',
      icon: <IconActivity />,
      stats: summary
        ? [
            { val: String(summary.activity.totalCount),     unit: '次', name: '活动记录' },
            { val: String(summary.activity.outdoorCount),   unit: '次', name: '户外活动' },
            { val: String(summary.activity.tummyTimeCount), unit: '次', name: '趴趴练习' },
          ]
        : [
            { val: '--', unit: '次', name: '活动记录' },
            { val: '--', unit: '次', name: '户外活动' },
            { val: '--', unit: '次', name: '趴趴练习' },
          ],
      note: summary
        ? `洗澡 ${summary.activity.bathCount} 次 · 户外 ${summary.activity.outdoorCount} 次 · 趴趴练习 ${summary.activity.tummyTimeCount} 次 · 玩耍 ${summary.activity.playCount} 次。`
        : '暂无活动数据。',
      badges: [],
    },

    // 尿布
    {
      key: 'diaper',
      label: '尿布',
      icon: <IconDroplets />,
      stats: summary
        ? [
            { val: String(summary.diaper.totalCount),                         unit: '次', name: '换尿布'  },
            { val: String(summary.diaper.dirtyCount + summary.diaper.mixedCount), unit: '次', name: '大便' },
            { val: String(summary.diaper.wetCount),                           unit: '次', name: '小便'   },
          ]
        : [
            { val: '--', unit: '次', name: '换尿布' },
            { val: '--', unit: '次', name: '大便'   },
            { val: '--', unit: '次', name: '小便'   },
          ],
      note: summary
        ? `共换尿布 ${summary.diaper.totalCount} 次：湿尿布 ${summary.diaper.wetCount} 次、大便 ${summary.diaper.dirtyCount} 次、混合 ${summary.diaper.mixedCount} 次。`
        : '暂无尿布数据。',
      badges: [],
    },

    // 生长
    {
      key: 'growth',
      label: '生长',
      icon: <IconRuler />,
      stats: summary?.growth.latestWeightG
        ? [
            { val: mmToCm(summary.growth.latestHeightMm), unit: 'cm', name: '身高' },
            { val: gToKg(summary.growth.latestWeightG),   unit: 'kg', name: '体重' },
            { val: mmToCm(summary.growth.latestHeadMm),   unit: 'cm', name: '头围' },
          ]
        : [
            { val: '--', unit: 'cm', name: '身高' },
            { val: '--', unit: 'kg', name: '体重' },
            { val: '--', unit: 'cm', name: '头围' },
          ],
      note: summary?.growth.latestDate
        ? `最近测量（${summary.growth.latestDate}）：身高 ${mmToCm(summary.growth.latestHeightMm)}cm，体重 ${gToKg(summary.growth.latestWeightG)}kg，头围 ${mmToCm(summary.growth.latestHeadMm)}cm。`
        : '暂无生长数据。',
      badges: [],
    },

    // 健康
    {
      key: 'health',
      label: '健康',
      icon: <IconHeart />,
      stats: [],
      note: summary
        ? `平均体温 ${summary.health.avgTemperature ?? '--'}℃，最高 ${summary.health.maxTemperature ?? '--'}℃。心情：开心 ${summary.health.moodHappyCount} 次 · 平静 ${summary.health.moodNeutralCount} 次 · 烦躁 ${summary.health.moodFussyCount} 次 · 哭闹 ${summary.health.moodCryingCount} 次。`
        : '暂无健康数据。',
      badges: summary
        ? [
            ...(summary.health.feverCount === 0
              ? [{ label: '无发烧记录', type: 'green' as const }]
              : [{ label: `发烧 ${summary.health.feverCount} 次`, type: 'yellow' as const, warn: true }]),
            { label: `体温均值 ${summary.health.avgTemperature ?? '--'}℃`, type: 'green' as const },
          ]
        : [{ label: '暂无健康数据', type: 'yellow' as const }],
    },

    // 医疗
    {
      key: 'medical',
      label: '医疗',
      icon: <IconStethoscope />,
      stats: [],
      note: summary
        ? summary.medical.visitCount > 0
          ? `本周期内就诊 ${summary.medical.visitCount} 次，最近就诊：${summary.medical.lastVisitDate ?? ''} ${summary.medical.lastHospital ?? ''}。`
          : `本周期内无就诊记录。`
        : '暂无医疗数据。',
      badges: summary
        ? summary.medical.visitCount === 0
          ? [{ label: '本周无就诊', type: 'green' as const }]
          : [{ label: `就诊 ${summary.medical.visitCount} 次`, type: 'yellow' as const, warn: true }]
        : [],
    },

    // 表现
    {
      key: 'symptom',
      label: '表现',
      icon: <IconSmile />,
      stats: [],
      note: summary
        ? summary.symptom.count === 0
          ? '本周期内无异常症状记录，宝宝状态良好。'
          : `本周期内共记录症状 ${summary.symptom.count} 次。`
        : '暂无表现数据。',
      badges: summary
        ? summary.symptom.count === 0
          ? [
              { label: '无异常症状', type: 'green' as const },
              { label: `心情良好 ${summary.health.moodHappyCount + summary.health.moodNeutralCount} 次`, type: 'green' as const },
            ]
          : [{ label: `症状 ${summary.symptom.count} 次`, type: 'red' as const }]
        : [],
    },
  ]

  const badgeStyle = (type: string): React.CSSProperties => {
    if (type === 'green')  return { background: '#DCFCE7', color: '#166534' }
    if (type === 'red')    return { background: '#FFF0F4', color: '#F05060' }
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
        {/* ── 弹层头部（sticky，渐变背景）── */}
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
            <div className="text-[12px] text-white mt-0.5" style={{ opacity: 0.85 }}>
              {data.dateRange}
            </div>
          </div>
          {/* 关闭按钮：半透明圆圈 */}
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center flex-shrink-0 border-none cursor-pointer"
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.25)',
            }}
          >
            <IconClose />
          </button>
        </div>

        {/* ── 弹层滚动内容区 ── */}
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
                  style={{
                    gridTemplateColumns: `repeat(${Math.min(sec.stats.length, 3)}, 1fr)`,
                    gap: 8,
                  }}
                >
                  {sec.stats.map((st) => (
                    <div
                      key={st.name}
                      className="text-center py-2 rounded-xl"
                      style={{ background: '#FFF8FA' }}
                    >
                      <div className="text-[18px] font-extrabold text-[#4A3035] leading-none">
                        {st.val}
                        {st.unit && (
                          <span className="text-[10px] font-medium text-[#9A8090] ml-0.5">
                            {st.unit}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-[#9A8090] mt-1">{st.name}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* 状态徽章列表 */}
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

              {/* 备注文字 */}
              <div className="text-[12px] text-[#9A8090] leading-relaxed">{sec.note}</div>
            </div>
          ))}

          {/* ── 底部操作按钮 ── */}
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
