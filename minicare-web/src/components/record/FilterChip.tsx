/**
 * FilterChip 筛选胶囊按钮
 *
 * 用于 RecordsPage 顶部的横向滚动筛选栏，支持激活/默认两种状态。
 * 可复用于任何需要多选一 Tab 筛选的场景。
 */

/** 单个筛选项配置 */
export interface FilterChipOption {
  /** 唯一标识 key */
  key: string
  /** 显示标签 */
  label: string
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
 * 激活时：粉色背景、粉色边框、加粗字体
 * 默认时：白色背景、灰色边框
 */
export function FilterChip({ option, active, onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={() => onClick(option.key)}
      className="flex-shrink-0 border-none cursor-pointer transition-all active:scale-95"
      style={{
        padding: '6px 14px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: active ? 600 : 500,
        whiteSpace: 'nowrap',
        /* 激活态：品牌粉色；默认态：灰色 */
        border: `1.5px solid ${active ? '#F87098' : '#E8E0E4'}`,
        background: active ? '#FFF0F4' : '#fff',
        color: active ? '#F87098' : '#9A8090',
      }}
    >
      {option.label}
    </button>
  )
}

/** FilterBar 横向滚动筛选栏属性 */
interface FilterBarProps {
  /** 筛选选项列表 */
  options: FilterChipOption[]
  /** 当前激活的 key */
  activeKey: string
  /** 切换回调 */
  onChange: (key: string) => void
}

/**
 * FilterBar 横向滚动筛选栏
 * 将多个 FilterChip 组合成可横向滚动的容器，顶部含页面标题行
 *
 * @example
 * <FilterBar
 *   options={filterChips}
 *   activeKey={activeFilter}
 *   onChange={setActiveFilter}
 * />
 */
export function FilterBar({ options, activeKey, onChange }: FilterBarProps) {
  return (
    <div
      className="flex-shrink-0"
      style={{
        background: '#fff',
        borderBottom: '1px solid #F5EFF2',
        paddingBottom: 12,
      }}
    >
      {/* 页面标题行 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 18px 12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: 18,
              padding: '0 7px',
              borderRadius: 9,
              fontSize: 10,
              fontWeight: 600,
              background: 'linear-gradient(135deg, #F87098, #F9A8C0)',
              color: '#fff',
              letterSpacing: '0.2px',
            }}
          >
            {options.find(o => o.key === activeKey)?.label ?? '全部'}
          </span>
        </div>
      </div>

      {/* 横向滚动筛选胶囊 */}
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
      </div>
    </div>
  )
}
