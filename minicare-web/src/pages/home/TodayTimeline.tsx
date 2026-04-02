/**
 * TodayTimeline 今日时间线组件
 *
 * 首页 L2 区第二张卡片：按时间降序展示今日所有记录。
 * 每条记录对重点信息做突出展示（数值 chip、状态 pill 等）。
 * 空状态时显示引导提示。
 *
 * 被引用：HomePage.tsx
 */
import { useNavigate } from 'react-router-dom'
import RecordTypeIcon from '@/components/record/RecordTypeIcon'
import RecordContent, { PULSE_STYLE } from '@/components/record/RecordContent'
import { formatTime } from '@/lib/utils'
import { IconChevronRight } from '@/components/ui/icons'
import type { TodayRecord } from '@/api/types'

/** TodayTimeline 属性 */
interface TodayTimelineProps {
  /** 今日记录列表（已按时间降序排列） */
  records: TodayRecord[]
  /** 点击单条记录回调（用于弹出 ActionSheet） */
  onRecordClick?: (record: TodayRecord) => void
}

// ── 主组件 ───────────────────────────────────────────────────────

/**
 * 今日时间线卡片
 *
 * 每条记录按类型突出展示核心数值：
 * - 饮食：奶量 metric chip
 * - 睡眠：时长 chip + 进行中呼吸动效
 * - 尿布：类型/性状彩色 pill（含语义 icon）
 * - 活动：活动类型 pill + 时长 chip
 * - 表现：情绪/精神 pill
 * - 健康：体温 chip + 症状 pill
 * - 生长：身高/体重 chip
 * - 医疗：就诊类型 pill
 */
export default function TodayTimeline({ records, onRecordClick }: TodayTimelineProps) {
  const navigate = useNavigate()

  return (
    <>
      {/* 呼吸动效 keyframes（注入一次即可） */}
      <style>{PULSE_STYLE}</style>

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
            <div className="mb-2 flex justify-center">
              <RecordTypeIcon type="feeding" containerSize={40} iconSize={20} />
            </div>
            <div className="text-sm text-subtext">今日尚无记录</div>
            <div className="text-xs text-subtext/70 mt-1">点击上方快捷按钮开始记录</div>
          </div>
        ) : (
          records.map((rec, i) => {
            return (
              <div
                key={rec.id}
                className="flex items-start gap-3 px-4 py-3 cursor-pointer active:bg-[#FFF9FA] transition-colors"
                style={i > 0 ? { borderTop: '1px solid #F5F0F2' } : {}}
                onClick={() => onRecordClick ? onRecordClick(rec) : navigate('/records')}
              >
                {/* 左侧时间戳 */}
                <span
                  className="text-xs flex-shrink-0 w-10 text-right pt-0.5"
                  style={{ color: '#9A8090' }}
                >
                  {formatTime(rec.time)}
                </span>

                {/* 记录类型图标 */}
                <div className="flex-shrink-0 mt-0.5">
                  <RecordTypeIcon type={rec.type} containerSize={32} iconSize={16} />
                </div>

                {/* 内容区：按记录类型渲染重点信息 */}
                <div className="flex-1 min-w-0">
                  <RecordContent type={rec.type} detail={rec.detail} />
                  {/* 备注（有备注时额外展示） */}
                  {rec.note && (
                    <div
                      className="text-xs truncate mt-1"
                      style={{ color: '#B0A0A4' }}
                    >
                      {rec.note}
                    </div>
                  )}
                </div>

                {/* 操作指示 */}
                <IconChevronRight size={14} color="#C0A8AD" style={{ flexShrink: 0, marginTop: 2 }} />
              </div>
            )
          })
        )}
      </div>
    </>
  )
}
