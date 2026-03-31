/**
 * RecordGroup 按日期分组的记录组件
 *
 * 显示一组同一天的记录，包含：
 * - 日期标题行（含彩色圆点标识今天/历史）
 * - 白色卡片容器（内含多个 RecordListItem）
 *
 * 被引用：RecordsPage.tsx
 */
import RecordListItem from './RecordListItem'
import type { RecordItem } from '@/api'

/** 单日分组数据 */
export interface RecordGroupData {
  /** 日期 key，格式 YYYY-M-D，用于 React key */
  dateKey: string
  /** 日期显示标签，如 "2026年3月31日 · 今天" */
  dateLabel: string
  /** 是否为今天（影响圆点颜色和标题颜色） */
  isToday: boolean
  /** 该日期下的所有记录 */
  items: RecordItem[]
}

/** RecordGroup 属性 */
interface RecordGroupProps {
  /** 分组数据 */
  group: RecordGroupData
  /** 点击某条记录时的回调 */
  onRecordClick: (record: RecordItem) => void
}

/**
 * 单日记录分组
 *
 * @example
 * <RecordGroup group={group} onRecordClick={handleClick} />
 */
export default function RecordGroup({ group, onRecordClick }: RecordGroupProps) {
  return (
    <div>
      {/* 日期分组标题 */}
      <div
        className="flex items-center gap-1.5 px-5 py-3.5 pt-4"
        style={{
          fontSize: 13,
          fontWeight: 700,
          /* 今天用深色，历史用浅色 */
          color: group.isToday ? '#7A5A60' : '#9A8090',
        }}
      >
        {/* 圆点：今天品牌粉色，历史灰色 */}
        <div
          style={{
            width: 6, height: 6, borderRadius: '50%',
            background: group.isToday ? '#F87098' : '#C0A8AD',
            flexShrink: 0,
          }}
        />
        {group.dateLabel}
      </div>

      {/* 记录卡片（白色圆角容器，同一天的记录共用一个容器） */}
      <div
        className="mx-4 bg-white rounded-2xl overflow-hidden"
        style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.07)' }}
      >
        {group.items.map((rec, i) => (
          <RecordListItem
            key={rec.id}
            record={rec}
            showDivider={i > 0}
            onClick={onRecordClick}
          />
        ))}
      </div>
    </div>
  )
}
