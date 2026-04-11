/**
 * FabSheet FAB 底部弹层组件
 *
 * 通用分组记录选择弹层，支持两种模式：
 *  - 精简版（默认）：仅 C 区「日常补录/健康档案」5 项，供首页「更多」使用
 *  - 完整版：全部 4 分组 11 项，供导航栏「+」使用（传入 GLOBAL_FAB_GROUPS）
 *
 * 被引用：HomePage.tsx、AppLayout.tsx
 */
import { useNavigate } from 'react-router-dom'
import BottomSheet from '@/components/ui/BottomSheet'
import RecordTypeIcon from '@/components/record/RecordTypeIcon'
import {
  RECORD_TYPE_CFG,
  RECORD_ROUTES,
  FAB_SUBTITLES,
  FAB_GROUPS,
} from '@/lib/constants'

/** 各 key 对应的导航 state（Tab 跳转 / 特殊展开） */
const NAV_STATE: Record<string, Record<string, unknown>> = {
  formula:     { tab: 'formula' },
  breast:      { tab: 'breast' },
  food:        { tab: 'food' },
  supplement:  { tab: 'supplement' },
  temperature: { expandTemp: true },
}

/** FabSheet 属性 */
interface FabSheetProps {
  /** 是否展开 */
  open: boolean
  /** 关闭回调 */
  onClose: () => void
  /**
   * 分组配置，默认为 FAB_GROUPS（C区精简版，5项）
   * 传入 GLOBAL_FAB_GROUPS 则展示完整版（4分组 11项）
   */
  groups?: { label: string; keys: string[] }[]
}

export default function FabSheet({ open, onClose, groups = FAB_GROUPS }: FabSheetProps) {
  const navigate = useNavigate()

  const handleSelect = (key: string) => {
    onClose()
    // 首次打开后标记，隐藏新用户引导行
    localStorage.setItem('fab_first_open', 'true')
    const path = RECORD_ROUTES[key]
    const state = NAV_STATE[key]
    if (state) {
      navigate(path, { state })
    } else {
      navigate(path)
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} zIndex={60}>
      {/* 弹层标题 */}
      <div className="text-center text-base font-bold text-[#4A3035] py-3">
        记录什么？
      </div>

      {/* 分组列表 */}
      {groups.map((group, gi) => (
        <div key={group.label}>
          {/* 分组标题 */}
          <div className="px-5 pt-4 pb-2 text-[10px] font-semibold text-[#9A8090] tracking-[0.8px] uppercase">
            {group.label}
          </div>

          {/* 组内条目 */}
          {group.keys.map((key, idx) => {
            const cfg = RECORD_TYPE_CFG[key]
            const sub = FAB_SUBTITLES[key] ?? ''
            const isLast = idx === group.keys.length - 1
            return (
              <div key={key}>
                <div
                  className="flex items-center gap-3.5 px-5 py-3.5 cursor-pointer active:bg-[#FFF8F9] transition-colors"
                  onClick={() => handleSelect(key)}
                >
                  {/* 图标（42px 容器） */}
                  <RecordTypeIcon type={key} containerSize={42} iconSize={20} borderRadius={12} />

                  {/* 文字区 */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-semibold text-[#4a3035]">{cfg.label}</div>
                    {sub && (
                      <div className="text-xs text-[#9A8090] mt-0.5 truncate">{sub}</div>
                    )}
                  </div>

                  {/* 右箭头 */}
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M6 4l4 4-4 4" stroke="#C0A8AD" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>

                {/* 组内分割线（不触边，最后一项不展示） */}
                {!isLast && (
                  <div className="mx-5 border-t border-[#F5F0F2]" />
                )}
              </div>
            )
          })}

          {/* 组间间距（最后一组不加） */}
          {gi < groups.length - 1 && <div className="h-1" />}
        </div>
      ))}

      {/* 底部安全间距 */}
      <div className="h-4" />
    </BottomSheet>
  )
}
