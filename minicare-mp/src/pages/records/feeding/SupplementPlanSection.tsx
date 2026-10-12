/**
 * 每日补充计划配置区（PRD-018）
 *
 * 位置：营养素 tab（supplement）顶部、SupplementSection 上方；仅新建模式渲染。
 * 形态：折叠节——收起为入口行（摘要 + 箭头），展开为 8 项勾选 + 保存按钮。
 * 保存：本地暂存 → 点击保存 → onSave(keys)（PATCH baby，父级发请求并 toast）
 *       → 成功收起并同步；失败保留编辑态。
 *
 * 说明：计划仅限预设 8 项（suppItems）；表单「其他」自定义项不进计划
 * （对账匹配不可靠，PRD-018 §3.2）。
 */
import { View, Text } from '@tarojs/components'
import { useState } from 'react'
import { supplementLabel } from '@/lib/supplements'
import { suppItems } from './types'

interface SupplementPlanSectionProps {
  /** 当前已保存的计划（key 数组；[] = 未配置） */
  plan: string[]
  /** 保存回调：成功返回 true（组件随即收起） */
  onSave: (keys: string[]) => Promise<boolean>
}

export default function SupplementPlanSection({ plan, onSave }: SupplementPlanSectionProps) {
  const [open, setOpen] = useState(false)
  /** 展开期间的勾选暂存（key 集合）；收起时丢弃（下次展开从 plan 重置） */
  const [draft, setDraft] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const summary = plan.length > 0 ? plan.map(supplementLabel).join('、') : '未设置'

  const toggleOpen = () => {
    if (saving) return
    if (open) {
      setOpen(false)
      return
    }
    setDraft(new Set(plan))
    setOpen(true)
  }

  const toggle = (key: string) => {
    setDraft((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      // 按 suppItems 原顺序提交（PRD-018 §3.1：顺序规范化，避免抖动）
      const keys = suppItems.filter((s) => draft.has(s.key)).map((s) => s.key)
      const ok = await onSave(keys)
      if (ok) setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <View className='supp-plan'>
      {/* 入口行（展开/收起切换） */}
      <View className='supp-plan__entry' onClick={toggleOpen}>
        <Text className='supp-plan__entry-title'>每日补充计划</Text>
        <View className='supp-plan__entry-right'>
          <Text className='supp-plan__entry-summary'>{summary}</Text>
          <Text className={`supp-plan__arrow${open ? ' supp-plan__arrow--open' : ''}`}>{'\u203A'}</Text>
        </View>
      </View>

      {open && (
        <View className='supp-plan__panel'>
          <Text className='supp-plan__hint'>勾选每天要补的营养素，首页会提醒今天还没吃的</Text>
          {suppItems.map((s, i) => (
            <View
              key={s.key}
              className={`supp-plan__row${i < suppItems.length - 1 ? ' supp-plan__row--bordered' : ''}`}
              onClick={() => toggle(s.key)}
            >
              <View className={`supp-plan__check${draft.has(s.key) ? ' supp-plan__check--on' : ''}`}>
                {draft.has(s.key) && <Text className='supp-plan__check-mark'>v</Text>}
              </View>
              <View className='supp-plan__row-info'>
                <Text className='supp-plan__row-name'>{s.label}</Text>
                {s.hint && <Text className='supp-plan__row-hint'>{s.hint}</Text>}
              </View>
            </View>
          ))}
          <View
            className={`supp-plan__save${saving ? ' supp-plan__save--loading' : ''}`}
            onClick={saving ? undefined : handleSave}
          >
            <Text className='supp-plan__save-text'>{saving ? '保存中...' : '保存计划'}</Text>
          </View>
        </View>
      )}
    </View>
  )
}
