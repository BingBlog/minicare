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
  /** 数值，可含逗号分隔（如"3,360"）或百分比（如"89%"） */
  val: string
  /** 单位（如 ml、h、次），为空字符串时不展示 */
  unit: string
  /** 指标名称（如"总奶量"） */
  name: string
}

/** 状态徽章 */
interface BadgeItem {
  /** 显示文字 */
  label: string
  /**
   * 徽章颜色类型
   * "green"  - 绿色（正常/良好）
   * "red"    - 红色（异常/警告）
   * "yellow" - 黄色（提示/注意）
   */
  type: 'green' | 'red' | 'yellow'
  /** 是否显示警告三角图标（true 时前置 IconWarn） */
  warn?: boolean
}

/** 报告各模块节数据 */
interface ReportSection {
  /** 模块唯一标识，与记录类型对应 */
  key: string
  /** 模块标签（如"饮食"） */
  label: string
  /** 模块图标节点 */
  icon: React.ReactElement
  /** 统计格子数据列表（最多 3 个，超出部分换行） */
  stats: StatItem[]
  /** 模块备注文字 */
  note: string
  /** 状态徽章列表 */
  badges: BadgeItem[]
}

/** 传给弹层的报告元数据 */
export interface ReportData {
  /** 报告标题（如"小宝 · 综合报告"） */
  title: string
  /** 日期范围文字（如"2026年3月21日 · 7天 · 牛奶蛋白过敏（中度）"） */
  dateRange: string
}

/** FullReportModal 属性 */
interface FullReportModalProps {
  /** 是否显示弹层 */
  open: boolean
  /** 报告元数据；为 null 时不渲染内容 */
  data: ReportData | null
  /** 关闭弹层回调 */
  onClose: () => void
  /** 点击「分享给医生」回调 */
  onShare: () => void
  /** 点击「保存 PDF」回调 */
  onSave: () => void
}

/**
 * 完整报告详情弹层
 *
 * 采用全屏底部抽屉形式，蒙层点击可关闭。
 *
 * @example
 * <FullReportModal
 *   open={modalOpen}
 *   data={modalData}
 *   onClose={() => setModalOpen(false)}
 *   onShare={handleShare}
 *   onSave={handleSave}
 * />
 */
export default function FullReportModal({ open, data, onClose, onShare, onSave }: FullReportModalProps) {
  if (!open || !data) return null

  // ── 报告各模块配置（模拟数据）──────────────────────────────────
  // 实际项目中应由父组件或 hook 传入真实统计数据
  const sections: ReportSection[] = [
    {
      key: 'feeding',
      label: '饮食',
      icon: <IconMilk />,
      stats: [
        { val: '3,360', unit: 'ml', name: '总奶量'  },
        { val: '480',   unit: 'ml', name: '日均奶量' },
        { val: '21',    unit: '次', name: '喂养次数' },
      ],
      note: '当前阶段：氨基酸奶粉。辅食：南瓜泥观察期 D3（共5天），暂无异常反应。',
      badges: [],
    },
    {
      key: 'sleep',
      label: '睡眠',
      icon: <IconMoon />,
      stats: [
        { val: '62.5', unit: 'h',  name: '总睡眠'  },
        { val: '8.9',  unit: 'h',  name: '日均'    },
        { val: '89%',  unit: '',   name: '质量良好' },
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
        { val: '5',  unit: '次', name: '户外活动' },
        { val: '3',  unit: '次', name: '爬行练习' },
      ],
      note: '本周抬头训练表现良好，户外活动无异常皮肤反应。',
      badges: [],
    },
    {
      key: 'diaper',
      label: '尿布',
      icon: <IconDroplets />,
      stats: [
        { val: '21',          unit: '次', name: '换尿布'  },
        { val: '14',          unit: '次', name: '大便'    },
        { val: 'Bristol 3-4', unit: '',   name: '大便性状' },
      ],
      // Bristol 粪便分类量表：1-7级，3-4级为正常软便；参考：https://en.wikipedia.org/wiki/Bristol_stool_scale
      note: '大便性状以软便为主（Bristol 3-4级），颜色正常。本周未见血丝或黏液。',
      badges: [],
    },
    {
      key: 'growth',
      label: '生长',
      icon: <IconRuler />,
      stats: [
        { val: '68',  unit: 'cm', name: '身高' },
        { val: '7.5', unit: 'kg', name: '体重' },
        { val: '43',  unit: 'cm', name: '头围' },
      ],
      // WHO 百分位（Percentile）：P50 = 第50百分位 = 中位值，属正常范围
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
        { label: '✓ 本周无皮疹',    type: 'green' },
        { label: '✓ 无呕吐腹泻',    type: 'green' },
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
        { label: '✓ 精神状态佳',     type: 'green' },
      ],
    },
  ]

  /**
   * 根据徽章类型返回对应的背景/前景色
   * green  - 绿色：正向指标
   * red    - 红色：异常/警告
   * yellow - 黄色：提示注意
   */
  const badgeStyle = (type: string): React.CSSProperties => {
    if (type === 'green')  return { background: '#DCFCE7', color: '#166534' }
    if (type === 'red')    return { background: '#FFF0F4', color: '#F05060' }
    return { background: '#FEF9C3', color: '#854D0E' } // yellow
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      // 点击蒙层关闭
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
              // 非最后一节增加分割线
              style={si < sections.length - 1 ? { borderBottom: '.5px solid #F5F0F2' } : {}}
            >
              {/* 节标题：图标 + 文字，字号 13，灰色 */}
              <div className="flex items-center gap-1.5 mb-2.5 text-[13px] font-bold text-[#9A8090] tracking-[.5px]">
                {sec.icon}
                {sec.label}
              </div>

              {/* 统计网格：最多3列（grid-cols 动态计算） */}
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
