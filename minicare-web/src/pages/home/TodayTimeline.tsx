/**
 * TodayTimeline 今日时间线组件
 *
 * 首页 L2 区第二张卡片：按时间降序展示今日所有记录。
 * 空状态时显示引导提示。
 *
 * 被引用：HomePage.tsx
 */
import { useNavigate } from 'react-router-dom'
import RecordTypeIcon from '@/components/record/RecordTypeIcon'
import { RECORD_TYPE_CFG } from '@/lib/constants'
import { formatTime, getRecordSummary } from '@/lib/utils'
import type { TodayRecord } from '@/api/types'

/** TodayTimeline 属性 */
interface TodayTimelineProps {
  /** 今日记录列表（已按时间降序排列） */
  records: TodayRecord[]
  /** 点击单条记录回调（用于弹出 ActionSheet） */
  onRecordClick?: (record: TodayRecord) => void
}

/**
 * 今日时间线卡片
 *
 * 每条记录显示：
 * - 左侧时间（HH:MM）
 * - 图标（带背景色）
 * - 记录类型名称 + 备注
 * - 右侧 ⋯ 操作指示
 */
export default function TodayTimeline({ records, onRecordClick }: TodayTimelineProps) {
  const navigate = useNavigate()

  return (
    <div
      className="bg-white rounded-2xl overflow-hidden"
      style={{ boxShadow: '0 2px 12px rgba(200,100,120,0.08), 0 1px 3px rgba(0,0,0,0.04)' }}
    >
      {/* 标题行 */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-1.5">
        <span className="text-[11px] font-semibold text-[#9A8090] tracking-[0.8px] uppercase">
          今日时间线
        </span>
        <span
          className="text-xs text-primary font-medium cursor-pointer"
          onClick={() => navigate('/records')}
        >
          全部 ›
        </span>
      </div>

      {/* 空状态 */}
      {records.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <div className="text-3xl mb-2">🌟</div>
          <div className="text-sm text-subtext">今日尚无记录</div>
          <div className="text-xs text-subtext/70 mt-1">点击上方快捷按钮开始记录</div>
        </div>
      ) : (
        records.map((rec, i) => {
          const cfg = RECORD_TYPE_CFG[rec.type] ?? { label: rec.type, bg: '#f5f5f5', color: '#9A7E82' }
          // 将 detail 字段的结构化内容 spread 进 rec，供 getRecordSummary 读取各类型专有字段
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const summary = getRecordSummary({ ...rec, ...(rec.detail ?? {}) } as Record<string, any>) || rec.note || ''
          return (
            <div
              key={rec.id}
              className="flex items-center gap-3 px-4 py-3 cursor-pointer active:bg-[#FFF9FA] transition-colors"
              style={i > 0 ? { borderTop: '1px solid #F5F0F2' } : {}}
              onClick={() => onRecordClick ? onRecordClick(rec) : navigate('/records')}
            >
              {/* 左侧时间戳（HH:MM 格式，右对齐，固定宽度保证列表对齐） */}
              <span className="text-xs text-[#9A8090] flex-shrink-0 w-10 text-right">
                {formatTime(rec.time)}
              </span>

              {/* 记录类型图标 */}
              <RecordTypeIcon type={rec.type} containerSize={36} iconSize={19} />

              {/* 内容区：类型名 + 摘要 */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-[#7a5a60]">{cfg.label}</div>
                {summary && (
                  <div className="text-xs text-[#9A8090] truncate mt-0.5">{summary}</div>
                )}
              </div>

              {/* 操作指示（三点图标） */}
              <span className="text-[#C0A8AD] text-base flex-shrink-0 leading-none">···</span>
            </div>
          )
        })
      )}
    </div>
  )
}
