/**
 * ReportPreview 报告预览卡片
 *
 * 报告生成后展示的摘要预览，包含：
 *   - 渐变头部（宝宝名 + 日期范围 + 过敏信息）
 *   - 饮食数据预览（3个统计数字 + mini 柱状图）
 *   - 睡眠数据预览（3个统计数字）
 *   - 表现 & 健康状态标签
 *   - 分享报告 / 保存到文件 操作按钮
 *
 * 被引用：ReportPage.tsx
 */

/** ReportPreview 属性 */
interface ReportPreviewProps {
  /** 宝宝名称，用于报告标题 */
  babyName: string
  /**
   * 时间范围描述文本
   * 例："2026年3月24日—2026年3月30日（7天）"
   */
  rangeText: string
  /** 点击「分享报告」回调 */
  onShare: () => void
  /** 点击「保存到文件」回调 */
  onSave: () => void
}

/**
 * 报告预览卡片组件
 *
 * @example
 * <ReportPreview
 *   babyName="小宝"
 *   rangeText={getRangeText(activeRange)}
 *   onShare={handleShare}
 *   onSave={handleSave}
 * />
 */
export default function ReportPreview({ babyName, rangeText, onShare, onSave }: ReportPreviewProps) {
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
          {/* 过敏信息硬编码为"牛奶蛋白过敏（中度）"，实际项目应从 currentBaby 读取 */}
          <div className="text-[12px] text-white mt-1" style={{ opacity: 0.85 }}>
            {rangeText} · 牛奶蛋白过敏（中度）
          </div>
        </div>

        {/* ── 饮食预览 ── */}
        <div className="px-4 py-3.5" style={{ borderBottom: '.5px solid #F5F0F2' }}>
          <div className="text-[12px] font-bold text-[#9A8090] tracking-[.5px] mb-2">饮食</div>
          <div className="flex gap-4">
            {/* 饮食统计数字（模拟数据，实际从 recordsApi 获取） */}
            {[
              { val: '3,360', unit: 'ml',    name: '7天总奶量' },
              { val: '480',   unit: 'ml/天', name: '平均每天'   },
              { val: '21',    unit: '次',    name: '喂养次数'   },
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

          {/* mini 柱状图（SVG 绘制，纯装饰性，高度 44px） */}
          <div className="mt-2" style={{ height: 44, overflow: 'hidden' }}>
            <svg
              viewBox="0 0 320 50"
              preserveAspectRatio="none"
              style={{ width: '100%', height: '100%' }}
            >
              {/* 前6天：空心浅色条；最后1天（当天）：实色高亮条 */}
              {[
                { x: 5,   y: 14, h: 36 },
                { x: 50,  y: 8,  h: 42 },
                { x: 95,  y: 18, h: 32 },
                { x: 140, y: 10, h: 40 },
                { x: 185, y: 6,  h: 44 },
                { x: 230, y: 12, h: 38 },
              ].map((b, i) => (
                <rect
                  key={i}
                  x={b.x}
                  y={b.y}
                  width="35"
                  height={b.h}
                  rx="4"
                  fill="#FFF0F4"
                  stroke="#F87098"
                  strokeWidth="1.5"
                />
              ))}
              {/* 当天高亮条：实色填充 */}
              <rect x="275" y="4" width="35" height="46" rx="4" fill="#F87098" opacity="0.8" />
            </svg>
          </div>
        </div>

        {/* ── 睡眠预览 ── */}
        <div className="px-4 py-3.5" style={{ borderBottom: '.5px solid #F5F0F2' }}>
          <div className="text-[12px] font-bold text-[#9A8090] tracking-[.5px] mb-2">睡眠</div>
          <div className="flex gap-4">
            {[
              { val: '62.5', unit: 'h',    name: '7天总睡眠'  },
              { val: '8.9',  unit: 'h/天', name: '平均每天'   },
              { val: '89%',  unit: '',     name: '质量良好占比' },
            ].map((s) => (
              <div key={s.name} className="text-center">
                <div className="text-[20px] font-extrabold text-[#4A3035] leading-none">{s.val}</div>
                <div className="text-[11px] text-[#9A8090]">{s.unit}</div>
                <div className="text-[10px] text-[#9A8090] mt-0.5">{s.name}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── 表现 & 健康预览 ── */}
        <div className="px-4 py-3.5">
          <div className="text-[12px] font-bold text-[#9A8090] tracking-[.5px] mb-2">表现 & 健康</div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* 绿色徽章：正常状态标识 */}
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
