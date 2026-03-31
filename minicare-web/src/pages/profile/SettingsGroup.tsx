/**
 * SettingsGroup 设置菜单组
 *
 * 通用的设置列表卡片，支持两种行类型：
 *   - "toggle"  - 右侧有开关（Toggle Switch）
 *   - "arrow"   - 右侧有右箭头（可点击跳转）
 *   - "info"    - 右侧仅展示文本（不可交互）
 *
 * 组件完全受控，状态由父组件维护（如大字体模式的开/关）。
 *
 * 被引用：ProfilePage.tsx
 */
import React from 'react'

// ── 右箭头图标（颜色固定 #C0A8AD）────────────────────────────────
const IconChevronRight = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="#C0A8AD"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 16, height: 16, flexShrink: 0 }}
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
)

// ── 类型定义 ──────────────────────────────────────────────────────

/** 设置行公共字段 */
interface SettingsRowBase {
  /** 行唯一标识，用于 key */
  id: string
  /** 左侧图标节点（包含颜色） */
  icon: React.ReactElement
  /** 图标背景色，如 "#FFF0F4" */
  iconBg: string
  /** 行文字标签 */
  label: string
}

/** Toggle 类型行（右侧开关） */
interface ToggleRow extends SettingsRowBase {
  type: 'toggle'
  /** 当前开关状态 */
  checked: boolean
  /** 切换回调 */
  onToggle: () => void
}

/** Arrow 类型行（右侧箭头，可点击） */
interface ArrowRow extends SettingsRowBase {
  type: 'arrow'
  /** 右侧说明文字（可选，如"3人"） */
  subText?: string
  /** 点击回调 */
  onClick: () => void
}

/** Info 类型行（右侧纯展示文本） */
interface InfoRow extends SettingsRowBase {
  type: 'info'
  /** 右侧显示文本（如版本号"v1.0.0"） */
  value: string
}

/** 设置行联合类型 */
export type SettingsRow = ToggleRow | ArrowRow | InfoRow

/** SettingsGroup 属性 */
interface SettingsGroupProps {
  /** 分组标题（如"外观"/"家庭"/"关于"） */
  title: string
  /** 行配置列表 */
  rows: SettingsRow[]
}

/**
 * 设置菜单分组卡片
 *
 * @example
 * <SettingsGroup
 *   title="外观"
 *   rows={[{
 *     id: 'font',
 *     type: 'toggle',
 *     icon: <IconText />,
 *     iconBg: '#FFF0F4',
 *     label: '大字体模式',
 *     checked: largeFontMode,
 *     onToggle: () => setLargeFontMode(v => !v),
 *   }]}
 * />
 */
export default function SettingsGroup({ title, rows }: SettingsGroupProps) {
  return (
    <>
      {/* 分组标题 */}
      <div
        className="text-[12px] font-semibold text-[#9A8090] px-5 pb-1"
        style={{ paddingTop: 14, letterSpacing: '.5px' }}
      >
        {title}
      </div>

      {/* 卡片容器 */}
      <div
        className="mx-4 bg-white rounded-2xl overflow-hidden"
        style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.07)' }}
      >
        {rows.map((row, i) => (
          <div
            key={row.id}
            className={[
              'flex items-center gap-3 px-4 py-3.5',
              row.type !== 'info' ? 'cursor-pointer' : '',
              row.type !== 'info' ? 'active:bg-gray-50 transition-colors' : '',
            ].join(' ')}
            style={i > 0 ? { borderTop: '.5px solid #F5F0F2' } : {}}
            onClick={
              row.type === 'arrow'   ? row.onClick  :
              row.type === 'toggle'  ? row.onToggle :
              undefined
            }
          >
            {/* 左侧图标容器 */}
            <div
              className="flex items-center justify-center rounded-xl flex-shrink-0"
              style={{ width: 34, height: 34, background: row.iconBg }}
            >
              {row.icon}
            </div>

            {/* 行文字 */}
            <span className="flex-1 text-[14px] font-medium text-[#4A3035]">{row.label}</span>

            {/* 右侧内容区（按类型渲染）*/}
            {row.type === 'toggle' && (
              /* Toggle Switch：宽 44，高 26，圆角 13px */
              <div
                className="flex-shrink-0"
                style={{
                  width: 44,
                  height: 26,
                  borderRadius: 13,
                  // 激活色 #F87098（品牌粉色），非激活色 #E5D8DA（淡粉灰）
                  background: row.checked ? '#F87098' : '#E5D8DA',
                  position: 'relative',
                  transition: 'background .2s',
                }}
              >
                {/* 滑块：偏移量：激活 left=21，非激活 left=3 */}
                <div
                  style={{
                    position: 'absolute',
                    top: 3,
                    left: row.checked ? 21 : 3,
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: '#fff',
                    boxShadow: '0 1px 4px rgba(0,0,0,.2)',
                    transition: 'left .2s',
                  }}
                />
              </div>
            )}

            {row.type === 'arrow' && (
              <>
                {/* 可选副文本（如成员人数） */}
                {row.subText && (
                  <span className="text-[13px] text-[#9A8090] mr-1">{row.subText}</span>
                )}
                <IconChevronRight />
              </>
            )}

            {row.type === 'info' && (
              <span className="text-[13px] text-[#9A8090]">{row.value}</span>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
