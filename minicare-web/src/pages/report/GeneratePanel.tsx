/**
 * GeneratePanel 生成综合报告面板
 *
 * 显示一段说明文字，告知将覆盖哪些模块和时间范围，
 * 并提供「生成报告」/ 「重新生成」按钮；
 * 生成过程中显示旋转加载动画。
 *
 * 被引用：ReportPage.tsx
 */

/** 大文件图标（报告封面风格） */
const IconFileText = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 24, height: 24 }}
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
)

/** GeneratePanel 属性 */
interface GeneratePanelProps {
  /**
   * 时间范围描述文本，如"2026年3月24日—2026年3月30日（7天）"
   * 由父组件传入以确保与 RangeSelector 状态保持同步
   */
  rangeText: string
  /** 是否正在生成（展示加载动画） */
  generating: boolean
  /** 是否已生成过（决定按钮文案：「生成报告」/ 「重新生成」） */
  generated: boolean
  /** 点击生成按钮回调 */
  onGenerate: () => void
}

/**
 * 生成综合报告面板
 *
 * @example
 * <GeneratePanel
 *   rangeText={getRangeText(activeRange)}
 *   generating={generating}
 *   generated={generated}
 *   onGenerate={handleGenerate}
 * />
 */
export default function GeneratePanel({
  rangeText,
  generating,
  generated,
  onGenerate,
}: GeneratePanelProps) {
  return (
    <div
      className="mx-4 bg-white rounded-2xl p-4 flex flex-col gap-3"
      style={{ boxShadow: '0 2px 10px rgba(200,100,120,0.08)' }}
    >
      {/* ── 说明文字 ── */}
      <div className="flex items-start gap-2.5">
        {/* 图标颜色使用浅粉色（#F0B8C8），与品牌主色 #F87098 相呼应但更柔和 */}
        <div style={{ color: '#F0B8C8', flexShrink: 0, marginTop: 2 }}>
          <IconFileText />
        </div>
        <div className="text-[13px] text-[#9A8090] leading-relaxed flex-1">
          将生成 <strong className="text-[#4A3035]">综合报告</strong>，覆盖{' '}
          <strong className="text-[#4A3035]">{rangeText}</strong>，
          包含饮食·睡眠·活动·尿布·生长·健康·医疗·表现全部模块，约 4～6 页 PDF。
        </div>
      </div>

      {/* ── 加载动画（生成中）── */}
      {generating && (
        <div className="flex items-center justify-center gap-2.5 py-2">
          {/* 旋转圆环：border-top 单边着色形成旋转效果 */}
          <div
            className="rounded-full"
            style={{
              width: 20,
              height: 20,
              border: '2.5px solid #F5EAEC',
              borderTopColor: '#F87098',
              animation: 'spin 1s linear infinite',
            }}
          />
          <span className="text-[13px] text-[#9A8090]">正在本地生成 PDF…</span>
        </div>
      )}

      {/* ── 生成 / 重新生成按钮（生成中隐藏）── */}
      {!generating && (
        <button
          type="button"
          onClick={onGenerate}
          className="w-full py-3.5 text-white font-bold text-[15px] border-none cursor-pointer rounded-xl transition-transform active:scale-[0.97]"
          style={{
            background: 'linear-gradient(90deg, #F87098, #F9A8C0)',
            boxShadow: '0 4px 14px rgba(248,112,152,.35)',
          }}
        >
          {/* 已生成过则改为「重新生成」，带 ✓ 提示 */}
          {generated ? '✓ 重新生成' : '生成报告'}
        </button>
      )}
    </div>
  )
}
