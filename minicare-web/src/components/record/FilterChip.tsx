/**
 * FilterChip 筛选胶囊按钮
 *
 * 用于 RecordsPage 顶部的横向滚动筛选栏，支持激活/默认两种状态。
 * 可复用于任何需要多选一 Tab 筛选的场景。
 */
import type { ReactNode } from 'react'

/** 单个筛选项配置 */
export interface FilterChipOption {
  /** 唯一标识 key */
  key: string
  /** 显示标签 */
  label: string
  /** 左侧 SVG 图标节点（可选） */
  icon?: ReactNode
}

/** FilterChip 单个按钮属性 */
interface FilterChipProps {
  /** 选项配置 */
  option: FilterChipOption
  /** 是否激活 */
  active: boolean
  /** 点击回调 */
  onClick: (key: string) => void
}

/**
 * 单个筛选胶囊按钮
 *
 * 激活时：粉色渐变背景、白色文字、投影
 * 默认时：浅灰背景、灰色文字
 */
export function FilterChip({ option, active, onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={() => onClick(option.key)}
      className="flex-shrink-0 border-none cursor-pointer transition-all active:scale-95"
      style={{
        height: 32,
        padding: option.icon ? '0 13px 0 10px' : '0 14px',
        borderRadius: 16,
        fontSize: 12,
        fontWeight: active ? 700 : 500,
        whiteSpace: 'nowrap',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        border: active ? '1.5px solid transparent' : '1.5px solid #EDE6EA',
        background: active
          ? 'linear-gradient(135deg, #F87098, #F9A8C0)'
          : '#F8F2F5',
        color: active ? '#fff' : '#9A8090',
        boxShadow: active ? '0 2px 8px rgba(248,112,152,0.30)' : 'none',
        letterSpacing: active ? '0.1px' : '0',
      }}
    >
      {/* 左侧图标：激活白色，默认粉灰色 */}
      {option.icon && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            color: active ? 'rgba(255,255,255,0.9)' : '#C0A0AA',
            flexShrink: 0,
          }}
        >
          {option.icon}
        </span>
      )}
      {option.label}
    </button>
  )
}

/** FilterBar 横向滚动筛选栏属性 */
interface FilterBarProps {
  /** 筛选选项列表（不含「今天」，今天已单独提出） */
  options: FilterChipOption[]
  /** 当前激活的 key */
  activeKey: string
  /** 切换回调 */
  onChange: (key: string) => void
  /** 当前筛选结果的记录总数（显示在标题行右侧） */
  count?: number
  /** 是否只看今天（标题行右侧切换按钮状态） */
  todayOnly?: boolean
  /** 切换「今天/全部」的回调 */
  onToggleToday?: () => void
}

// ── 时钟 SVG（今天按钮图标，内联避免引入依赖） ─────────────────────────────
function IconClockSm({ active }: { active: boolean }) {
  const c = active ? '#fff' : '#9A8090'
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ width: 12, height: 12, flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  )
}

/**
 * FilterBar 横向滚动筛选栏
 * - 顶部标题行：左侧「宝宝记录 · 总数」，右侧「今天」快捷切换
 * - 下方胶囊行：类型筛选（横向可滑动），右侧渐隐遮罩提示
 */
export function FilterBar({
  options,
  activeKey,
  onChange,
  count,
  todayOnly = false,
  onToggleToday,
}: FilterBarProps) {
  return (
    <div
      className="flex-shrink-0"
      style={{
        background: '#fff',
        borderBottom: '1px solid #F5EFF2',
        paddingBottom: 12,
      }}
    >
      {/* ── 标题行 ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 18px 12px',
        }}
      >
        {/* 左侧：页面标题 + 总数 */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
          <span
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: '#3A2428',
              letterSpacing: '-0.3px',
            }}
          >
            宝宝记录
          </span>
          {count !== undefined && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: '#C0A8AD',
                letterSpacing: '0.1px',
              }}
            >
              共 {count} 条
            </span>
          )}
        </div>

        {/* 右侧：今天 / 全部 切换按钮 */}
        {onToggleToday && (
          <button
            type="button"
            onClick={onToggleToday}
            className="flex-shrink-0 border-none cursor-pointer transition-all active:scale-95"
            style={{
              height: 28,
              padding: '0 10px 0 8px',
              borderRadius: 14,
              fontSize: 11,
              fontWeight: todayOnly ? 700 : 500,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              border: todayOnly ? '1.5px solid transparent' : '1.5px solid #EDE6EA',
              background: todayOnly
                ? 'linear-gradient(135deg, #F87098, #F9A8C0)'
                : '#F8F2F5',
              color: todayOnly ? '#fff' : '#9A8090',
              boxShadow: todayOnly ? '0 2px 6px rgba(248,112,152,0.25)' : 'none',
            }}
          >
            <IconClockSm active={todayOnly} />
            今天
          </button>
        )}
      </div>

      {/* ── 胶囊筛选行（右侧渐隐遮罩提示可横滑） ── */}
      <div style={{ position: 'relative' }}>
        <div
          style={{
            display: 'flex',
            gap: 7,
            padding: '0 18px',
            overflowX: 'auto',
            scrollbarWidth: 'none',
          }}
        >
          {options.map((opt) => (
            <FilterChip
              key={opt.key}
              option={opt}
              active={activeKey === opt.key}
              onClick={onChange}
            />
          ))}
          {/* 末尾占位，让最后一个胶囊滑到可见区域时不贴边 */}
          <div style={{ flexShrink: 0, width: 6 }} />
        </div>

        {/* 右侧渐隐遮罩 */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: 36,
            background: 'linear-gradient(to right, rgba(255,255,255,0), #fff)',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  )
}
