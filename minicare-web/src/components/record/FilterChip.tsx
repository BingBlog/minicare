/**
 * FilterChip 筛选胶囊按钮
 *
 * 用于 RecordsPage 顶部的类型筛选，支持激活/默认两种状态。
 * FilterBar：单行主筛选项 + 右侧「更多」下拉（其它类型）。
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { IconChevronDown } from '@/components/ui/icons'

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

/** FilterBar 单行筛选栏属性 */
interface FilterBarProps {
  /** 左侧主行展示的筛选项（如：全部 + 饮食/尿布/生长/睡眠） */
  primaryOptions: FilterChipOption[]
  /** 收入「更多」下拉的筛选项（如：活动/健康/表现/医疗） */
  moreOptions: FilterChipOption[]
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
 * FilterBar 顶部筛选区
 * - 标题行：左侧「宝宝记录 · 总数」，右侧「今天」快捷切换
 * - 类型行：单行；左侧主筛选项（可横向微滚动）、右侧固定「更多」下拉
 */
export function FilterBar({
  primaryOptions,
  moreOptions,
  activeKey,
  onChange,
  count,
  todayOnly = false,
  onToggleToday,
}: FilterBarProps) {
  const [moreOpen, setMoreOpen] = useState(false)
  const moreWrapRef = useRef<HTMLDivElement>(null)

  const moreActive = moreOptions.some((o) => o.key === activeKey)

  useEffect(() => {
    if (!moreOpen) return
    const close = (e: MouseEvent) => {
      if (moreWrapRef.current && !moreWrapRef.current.contains(e.target as Node)) {
        setMoreOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [moreOpen])

  const pickMore = (key: string) => {
    onChange(key)
    setMoreOpen(false)
  }

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

      {/* ── 单行类型筛选：主选项 + 更多 ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: '0 18px',
          minHeight: 32,
        }}
      >
        <div
          className="min-w-0 flex-1"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            overflowX: 'auto',
            scrollbarWidth: 'none',
          }}
        >
          {primaryOptions.map((opt) => (
            <FilterChip
              key={opt.key}
              option={opt}
              active={activeKey === opt.key}
              onClick={onChange}
            />
          ))}
        </div>

        <div ref={moreWrapRef} className="relative flex-shrink-0">
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            className="flex-shrink-0 border-none cursor-pointer transition-all active:scale-95"
            style={{
              height: 32,
              padding: '0 11px 0 10px',
              borderRadius: 16,
              fontSize: 12,
              fontWeight: moreActive || moreOpen ? 700 : 500,
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              border: moreActive || moreOpen ? '1.5px solid transparent' : '1.5px solid #EDE6EA',
              background:
                moreActive || moreOpen
                  ? 'linear-gradient(135deg, #F87098, #F9A8C0)'
                  : '#F8F2F5',
              color: moreActive || moreOpen ? '#fff' : '#9A8090',
              boxShadow: moreActive || moreOpen ? '0 2px 8px rgba(248,112,152,0.30)' : 'none',
            }}
          >
            更多
            <span
              style={{
                display: 'inline-flex',
                color: moreActive || moreOpen ? 'rgba(255,255,255,0.9)' : '#C0A0AA',
              }}
            >
              <IconChevronDown size={12} color="currentColor" />
            </span>
          </button>

          {moreOpen && (
            <div
              className="absolute right-0 z-50 mt-1 min-w-[148px] overflow-hidden rounded-xl bg-white py-1 shadow-lg"
              style={{
                border: '1px solid #EDE6EA',
                boxShadow: '0 8px 24px rgba(80,40,50,0.12)',
              }}
            >
              {moreOptions.map((opt) => {
                const active = activeKey === opt.key
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => pickMore(opt.key)}
                    className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-3 py-2.5 text-left transition-colors"
                    style={{
                      fontSize: 12,
                      fontWeight: active ? 700 : 500,
                      color: active ? '#F87098' : '#5A4048',
                      background: active ? 'rgba(248,112,152,0.08)' : 'transparent',
                    }}
                  >
                    {opt.icon && (
                      <span className="inline-flex flex-shrink-0 text-[#C0A0AA]">{opt.icon}</span>
                    )}
                    {opt.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
