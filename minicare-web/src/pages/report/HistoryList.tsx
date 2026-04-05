/**
 * HistoryList 历史报告列表
 *
 * 展示已生成的历史报告条目（从后端动态加载），
 * 每条记录包含：图标、报告标题、日期 / 时间范围、右箭头。
 * 点击条目触发 onOpen 回调，由父组件决定如何展示详情。
 *
 * 被引用：ReportPage.tsx
 */

// ── 小尺寸图标（20×20，用于历史列表图标区）────────────────────────
const IconBarChart2 = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 20, height: 20 }}
  >
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4"  />
    <line x1="6"  y1="20" x2="6"  y2="14" />
  </svg>
)

const IconTrendingUp = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 20, height: 20 }}
  >
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
)

const IconFileTextSm = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 20, height: 20 }}
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
)

/** 右箭头（颜色固定为 #C0A8AD，属于品牌次色调） */
const IconChevronRight = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="#C0A8AD"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 18, height: 18 }}
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
)

// ── 历史报告条目类型定义 ──────────────────────────────────────────

/** 单条历史报告条目 */
export interface HistoryItem {
  /** 持久化报告的 ID（来自 saved_reports 表） */
  id: string
  /** 报告标题，如"综合报告" */
  title: string
  /** 生成日期，如"2026年3月21日" */
  date: string
  /** 时间范围，如"7天" */
  range: string
  /** 原始起始日期（YYYY-MM-DD，供加载详情时使用） */
  startDate?: string
  /** 原始截止日期（YYYY-MM-DD） */
  endDate?: string
  /** 图标类型（轮换显示，增加视觉区分度） */
  iconType?: 'bar' | 'trending' | 'file'
}

/** HistoryList 属性 */
interface HistoryListProps {
  /**
   * 历史报告条目列表
   */
  items?: HistoryItem[]
  /** 点击某一条目时的回调，传回对应的条目数据 */
  onOpen: (item: HistoryItem) => void
}

/** 根据 iconType 渲染对应图标 */
function ItemIcon({ type }: { type?: 'bar' | 'trending' | 'file' }) {
  if (type === 'trending') return <IconTrendingUp />
  if (type === 'file') return <IconFileTextSm />
  return <IconBarChart2 />
}

/**
 * 历史报告列表组件
 *
 * @example
 * <HistoryList items={historyItems} onOpen={handleOpenHistory} />
 */
export default function HistoryList({ items = [], onOpen }: HistoryListProps) {
  if (items.length === 0) return null

  return (
    <div
      className="mx-4 bg-white rounded-2xl overflow-hidden"
      style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.07)' }}
    >
      {items.map((item, i) => (
        <div
          key={item.id || i}
          className="flex items-center gap-3 px-4 py-3.5 cursor-pointer active:bg-[#FFF8FA] transition-colors"
          // 非首项增加上方分割线
          style={i > 0 ? { borderTop: '.5px solid #F5F0F2' } : {}}
          onClick={() => onOpen(item)}
        >
          {/* 图标容器：固定 36×36，粉色底 */}
          <div
            className="flex items-center justify-center rounded-xl flex-shrink-0"
            style={{ width: 36, height: 36, background: '#FFF0F4', color: '#F87098' }}
          >
            <ItemIcon type={item.iconType} />
          </div>

          {/* 元信息 */}
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-semibold text-[#4A3035]">{item.title}</div>
            <div className="text-[12px] text-[#9A8090] mt-0.5">
              {item.date} · {item.range}
            </div>
          </div>

          {/* 右箭头 */}
          <IconChevronRight />
        </div>
      ))}
    </div>
  )
}
