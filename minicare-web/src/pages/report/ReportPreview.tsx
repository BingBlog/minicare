/**
 * ReportPreview 报告预览卡片
 *
 * 报告生成后展示的摘要预览，包含：
 *   - 渐变头部（宝宝名 + 日期范围 + 过敏信息）
 *   - 饮食数据预览（3个统计数字 + mini 柱状图）
 *   - 睡眠数据预览（3个统计数字）
 *   - 生长数据预览（最新身高/体重 + 体重趋势折线图）
 *   - 表现 & 健康状态标签
 *   - 分享报告 / 保存到文件 操作按钮
 *
 * 被引用：ReportPage.tsx
 */
import type { ReportSummary } from '@/api/report'

/** ReportPreview 属性 */
interface ReportPreviewProps {
  /** 宝宝名称，用于报告标题 */
  babyName: string
  /**
   * 时间范围描述文本
   * 例："2026年3月24日—2026年3月30日（7天）"
   */
  rangeText: string
  /** 过敏信息描述（从 currentBaby 读取，可为空字符串） */
  allergyText?: string
  /** 后端返回的真实报告数据（null 则展示骨架/默认值） */
  data: ReportSummary | null
  /** 点击「分享报告」回调 */
  onShare: () => void
  /** 点击「保存到文件」回调 */
  onSave: () => void
}

/**
 * 将总分钟数格式化为 "X.X h"
 */
function fmtHours(totalMin: number): string {
  return (totalMin / 60).toFixed(1)
}

/**
 * 将毫米格式化为 "XX.X cm"
 */
function mmToCm(mm: number | null): string {
  if (mm == null) return '--'
  return (mm / 10).toFixed(1)
}

/**
 * 将克格式化为 "X.X kg"
 */
function gToKg(g: number | null): string {
  if (g == null) return '--'
  return (g / 1000).toFixed(1)
}

/**
 * 体重趋势 mini 折线图
 * 使用 SVG polyline 绘制，最多展示 10 个数据点
 */
function WeightTrendChart({ trend }: { trend: Array<{ date: string; weightG: number }> }) {
  if (trend.length < 2) {
    return (
      <div className="flex items-center justify-center" style={{ height: 44 }}>
        <span className="text-[11px] text-[#C0A8AD]">暂无趋势数据</span>
      </div>
    )
  }

  const W = 320
  const H = 44
  const PAD_X = 8
  const PAD_Y = 6
  const innerW = W - PAD_X * 2
  const innerH = H - PAD_Y * 2

  const weights = trend.map((t) => t.weightG)
  const minW = Math.min(...weights)
  const maxW = Math.max(...weights)
  const range = maxW - minW || 1

  const pts = trend.map((t, i) => {
    const x = PAD_X + (i / (trend.length - 1)) * innerW
    const y = PAD_Y + innerH - ((t.weightG - minW) / range) * innerH
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const polylinePoints = pts.join(' ')

  // 最后一个点（高亮圆点）
  const lastPt = trend[trend.length - 1]
  const lastX = PAD_X + innerW
  const lastY = PAD_Y + innerH - ((lastPt.weightG - minW) / range) * innerH

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: H }}
    >
      {/* 渐变填充区域 */}
      <defs>
        <linearGradient id="wt-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F87098" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#F87098" stopOpacity="0.01" />
        </linearGradient>
      </defs>
      {/* 填充路径 */}
      <polygon
        points={`${pts[0]} ${polylinePoints} ${PAD_X + innerW},${H} ${PAD_X},${H}`}
        fill="url(#wt-grad)"
      />
      {/* 折线 */}
      <polyline
        points={polylinePoints}
        fill="none"
        stroke="#F87098"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
      {/* 最后一个高亮点 */}
      <circle cx={lastX} cy={lastY} r="3.5" fill="#F87098" opacity="0.9" />
      <circle cx={lastX} cy={lastY} r="6" fill="#F87098" opacity="0.15" />
    </svg>
  )
}

/**
 * 报告预览卡片组件
 *
 * @example
 * <ReportPreview
 *   babyName="福宝"
 *   rangeText={getRangeText(activeRange)}
 *   data={reportSummary}
 *   onShare={handleShare}
 *   onSave={handleSave}
 * />
 */
export default function ReportPreview({ babyName, rangeText, allergyText, data, onShare, onSave }: ReportPreviewProps) {
  // ── 饮食统计 ──────────────────────────────────────────────────
  const totalMl    = data?.feeding.totalFormulaMl ?? 0
  const avgMl      = data?.feeding.avgDailyFormulaMl ?? 0
  const feedCount  = data?.feeding.totalFeedCount ?? 0
  const chartData  = data?.feeding.dailyFormulaChart ?? []

  // ── 睡眠统计 ──────────────────────────────────────────────────
  const totalSleepH   = data ? fmtHours(data.sleep.totalMin) : '--'
  const avgSleepH     = data ? fmtHours(data.sleep.avgDailyMin) : '--'
  const sleepSessions = data?.sleep.sessionCount ?? 0

  // ── 生长统计 ──────────────────────────────────────────────────
  const weightTrend = data?.growth.weightTrend ?? []

  // ── 健康状态 ──────────────────────────────────────────────────
  const feverCount   = data?.health.feverCount ?? 0
  const symptomCount = data?.symptom.count ?? 0

  // ── 尿布统计 ──────────────────────────────────────────────────
  const diaperTotal = data?.diaper.totalCount ?? 0
  const diaperDirty = data ? (data.diaper.dirtyCount + data.diaper.mixedCount) : 0

  // ── 图表：最多展示7天柱状 ────────────────────────────────────
  const chartMax = Math.max(1, ...chartData.map((c) => c.ml))
  const CHART_W = 320
  const CHART_H = 50
  const BAR_W   = 35
  const barCount = Math.min(chartData.length, 7)
  const gap = barCount > 1 ? (CHART_W - barCount * BAR_W) / (barCount - 1) : 0

  return (
    <>
      {/* ── 预览卡片 ── */}
      <div
        className="mx-4 bg-white rounded-2xl overflow-hidden"
        style={{ boxShadow: '0 2px 10px rgba(200,100,120,0.08)' }}
      >
        {/* 渐变头部 */}
        <div
          className="px-4 py-4"
          style={{ background: 'linear-gradient(135deg, #F87098, #E85076)' }}
        >
          <div className="text-[16px] font-bold text-white">{babyName} · 综合报告</div>
          <div className="text-[12px] text-white mt-1" style={{ opacity: 0.85 }}>
            {rangeText}{allergyText ? ` · ${allergyText}` : ''}
          </div>
        </div>

        {/* ── 饮食预览 ── */}
        <div className="px-4 py-3.5" style={{ borderBottom: '.5px solid #F5F0F2' }}>
          <div className="text-[12px] font-bold text-[#9A8090] tracking-[.5px] mb-2">饮食</div>
          <div className="flex gap-4">
            {[
              { val: totalMl.toLocaleString(), unit: 'ml',    name: `${data?.days ?? 7}天总奶量` },
              { val: String(avgMl),             unit: 'ml/天', name: '平均每天'   },
              { val: String(feedCount),          unit: '次',    name: '喂养次数'   },
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

          {/* mini 柱状图（基于真实 dailyFormulaChart 数据） */}
          <div className="mt-2" style={{ height: CHART_H, overflow: 'hidden' }}>
            <svg
              viewBox={`0 0 ${CHART_W} ${CHART_H}`}
              preserveAspectRatio="none"
              style={{ width: '100%', height: '100%' }}
            >
              {barCount > 0
                ? chartData.slice(-barCount).map((bar, i) => {
                    const h = Math.max(4, Math.round((bar.ml / chartMax) * (CHART_H - 2)))
                    const x = i * (BAR_W + gap)
                    const y = CHART_H - h
                    const isLast = i === barCount - 1
                    return (
                      <rect
                        key={bar.date}
                        x={x}
                        y={y}
                        width={BAR_W}
                        height={h}
                        rx="4"
                        fill={isLast ? '#F87098' : '#FFF0F4'}
                        stroke={isLast ? 'none' : '#F87098'}
                        strokeWidth="1.5"
                        opacity={isLast ? 0.85 : 1}
                      />
                    )
                  })
                : /* 无数据时展示占位条 */
                  [5, 50, 95, 140, 185, 230, 275].map((x, i) => (
                    <rect
                      key={x}
                      x={x}
                      y={20}
                      width={35}
                      height={30}
                      rx="4"
                      fill="#FFF0F4"
                      stroke="#F87098"
                      strokeWidth="1.5"
                      opacity={i === 6 ? 0 : 1}
                    />
                  ))}
            </svg>
          </div>
        </div>

        {/* ── 睡眠预览 ── */}
        <div className="px-4 py-3.5" style={{ borderBottom: '.5px solid #F5F0F2' }}>
          <div className="text-[12px] font-bold text-[#9A8090] tracking-[.5px] mb-2">睡眠</div>
          <div className="flex gap-4">
            {[
              { val: totalSleepH,       unit: 'h',    name: `${data?.days ?? 7}天总睡眠`  },
              { val: avgSleepH,          unit: 'h/天', name: '平均每天'   },
              { val: String(sleepSessions), unit: '次', name: '睡眠段数' },
            ].map((s) => (
              <div key={s.name} className="text-center">
                <div className="text-[20px] font-extrabold text-[#4A3035] leading-none">{s.val}</div>
                <div className="text-[11px] text-[#9A8090]">{s.unit}</div>
                <div className="text-[10px] text-[#9A8090] mt-0.5">{s.name}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── 生长趋势预览 ── */}
        <div className="px-4 py-3.5" style={{ borderBottom: '.5px solid #F5F0F2' }}>
          <div className="text-[12px] font-bold text-[#9A8090] tracking-[.5px] mb-2">生长</div>
          {/* 最新数值行 */}
          {data?.growth.latestWeightG ? (
            <div className="flex gap-4 mb-2">
              {[
                { val: gToKg(data.growth.latestWeightG),   unit: 'kg', name: '体重' },
                { val: mmToCm(data.growth.latestHeightMm), unit: 'cm', name: '身高' },
                { val: mmToCm(data.growth.latestHeadMm),   unit: 'cm', name: '头围' },
              ].map((s) => (
                <div key={s.name} className="text-center">
                  <div className="text-[20px] font-extrabold text-[#4A3035] leading-none">{s.val}</div>
                  <div className="text-[11px] text-[#9A8090]">{s.unit}</div>
                  <div className="text-[10px] text-[#9A8090] mt-0.5">{s.name}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[12px] text-[#C0A8AD] mb-2">暂无生长记录</div>
          )}
          {/* 体重趋势折线图 */}
          <WeightTrendChart trend={weightTrend} />
        </div>

        {/* ── 尿布 & 表现 & 健康预览 ── */}
        <div className="px-4 py-3.5">
          <div className="text-[12px] font-bold text-[#9A8090] tracking-[.5px] mb-2">表现 &amp; 健康</div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* 尿布标签 */}
            {diaperTotal > 0 && (
              <span
                className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold"
                style={{ background: '#F0FDF4', color: '#166534' }}
              >
                换尿布 {diaperTotal} 次 · 大便 {diaperDirty} 次
              </span>
            )}
            {feverCount === 0 && symptomCount === 0 ? (
              <span
                className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold"
                style={{ background: '#DCFCE7', color: '#166534' }}
              >
                无异常表现
              </span>
            ) : (
              <>
                {feverCount > 0 && (
                  <span
                    className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold"
                    style={{ background: '#FEF9C3', color: '#854D0E' }}
                  >
                    发烧 {feverCount} 次
                  </span>
                )}
                {symptomCount > 0 && (
                  <span
                    className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold"
                    style={{ background: '#FFF0F4', color: '#F05060' }}
                  >
                    症状记录 {symptomCount} 条
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── 操作按钮行 ── */}
      <div className="flex gap-2.5 px-4 py-3.5">
        <button
          type="button"
          onClick={onShare}
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
          onClick={onSave}
          className="flex-1 py-3.5 text-[#4A3035] font-semibold text-[14px] border-none cursor-pointer rounded-xl active:scale-[0.97] transition-transform"
          style={{ background: '#F5F0F2' }}
        >
          保存到文件
        </button>
      </div>
    </>
  )
}
