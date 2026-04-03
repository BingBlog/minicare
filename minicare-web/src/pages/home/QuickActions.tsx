/**
 * QuickActions 快捷记录宫格组件
 *
 * 首页 L2 区第一张卡片：4×2 的八大记录模块快捷入口。
 * 点击每个格子跳转到对应的记录表单页。
 *
 * 被引用：HomePage.tsx
 */
import { useNavigate } from 'react-router-dom'
import RecordTypeIcon from '@/components/record/RecordTypeIcon'
import { RECORD_TYPE_CFG, RECORD_ROUTES, QUICK_ACTION_KEYS } from '@/lib/constants'

/** QuickActions 属性 */
interface QuickActionsProps {
  /** 点击「更多 ›」时触发（打开 FAB 弹层） */
  onMoreClick: () => void
}

/**
 * 首页快捷记录宫格（4 列 × 2 行）
 *
 * 宫格顺序：饮食 / 尿布 / 睡眠 / 活动 / 生长 / 健康 / 医疗 / 表现
 * 顺序定义在 constants.ts QUICK_ACTION_KEYS 中，方便统一调整
 */
export default function QuickActions({ onMoreClick }: QuickActionsProps) {
  const navigate = useNavigate()

  return (
    <div
      className="bg-white rounded-2xl overflow-hidden"
      style={{ boxShadow: '0 2px 12px rgba(200,100,120,0.08), 0 1px 3px rgba(0,0,0,0.04)' }}
    >
      {/* 标题行 */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-1.5">
        <span className="text-[11px] font-semibold text-[#9A8090] tracking-[0.8px] uppercase">
          快捷记录
        </span>
        <span
          className="text-xs text-primary font-medium cursor-pointer flex items-center gap-0.5"
          onClick={onMoreClick}
        >
          更多 ›
        </span>
      </div>

      {/* 4 列宫格 */}
      <div className="grid grid-cols-4 gap-2 p-3 pt-1">
        {QUICK_ACTION_KEYS.map((key) => {
          const cfg = RECORD_TYPE_CFG[key]
          const path = RECORD_ROUTES[key]
          return (
            <button
              key={key}
              type="button"
              onClick={() => navigate(path)}
              className="bg-white border border-gray-100 rounded-xl flex flex-col items-center gap-1.5 cursor-pointer transition-transform active:scale-95"
              style={{ padding: '16px 4px 14px' }}
            >
              {/* 图标容器 */}
              <RecordTypeIcon type={key} containerSize={56} iconSize={28} borderRadius={16} />
              {/* 文字标签 */}
              <span className="text-[14px] font-semibold text-[#4a3035]">{cfg.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
