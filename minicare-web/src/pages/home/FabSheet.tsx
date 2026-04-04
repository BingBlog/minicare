/**
 * FabSheet FAB 底部弹层组件
 *
 * 点击首页右下角 FAB（悬浮按钮）后展开的记录类型选择弹层。
 * 列出 8 大记录类型，每项有图标 + 标题 + 副标题描述。
 *
 * 被引用：HomePage.tsx
 */
import { useNavigate } from 'react-router-dom'
import BottomSheet from '@/components/ui/BottomSheet'
import RecordTypeIcon from '@/components/record/RecordTypeIcon'
import { RECORD_TYPE_CFG, RECORD_ROUTES, FAB_SUBTITLES } from '@/lib/constants'

/** FAB 弹层中要展示的记录类型顺序（与快捷宫格稍有不同，突出常用项） */
const FAB_ITEM_KEYS = [
  'feeding', 'sleep', 'activity', 'diaper',
  'health', 'symptom', 'growth', 'medical',
] as const

/** FabSheet 属性 */
interface FabSheetProps {
  /** 是否展开 */
  open: boolean
  /** 关闭回调 */
  onClose: () => void
}

/**
 * FAB 记录选择底部弹层
 *
 * 每个条目展示：
 * - 左侧图标（带背景色）
 * - 标题（记录类型名）
 * - 副标题（具体内容提示）
 */
export default function FabSheet({ open, onClose }: FabSheetProps) {
  const navigate = useNavigate()

  const handleSelect = (key: string) => {
    onClose()
    navigate(RECORD_ROUTES[key])
  }

  return (
    <BottomSheet open={open} onClose={onClose} zIndex={60}>
      {/* 弹层标题 */}
      <div className="text-center text-base font-bold text-[#4A3035] py-3">记录什么？</div>

      {/* 记录类型列表 */}
      {FAB_ITEM_KEYS.map((key) => {
        const cfg = RECORD_TYPE_CFG[key]
        const sub = FAB_SUBTITLES[key] ?? ''
        return (
          <div
            key={key}
            className="flex items-center gap-3.5 px-5 py-3.5 cursor-pointer active:bg-[#FFF0F4] transition-colors"
            onClick={() => handleSelect(key)}
          >
            {/* 图标（稍大，42px 容器） */}
            <RecordTypeIcon type={key} containerSize={42} iconSize={20} borderRadius={12} />

            {/* 文字区 */}
            <div>
              <div className="text-base font-semibold text-[#4a3035]">{cfg.label}</div>
              {sub && <div className="text-xs text-[#9A8090] mt-0.5">{sub}</div>}
            </div>
          </div>
        )
      })}

      {/* 底部安全间距 */}
      <div className="h-2" />
    </BottomSheet>
  )
}
