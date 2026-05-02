/**
 * Onboarding — 步骤进度指示器
 *
 * 共 3 步，当前高亮步骤为宽条；已完成步骤为小圆点（低透明度）；待完成为灰色小圆点。
 * 与 Web StepDots.tsx 逻辑完全一致（L1 复用）。
 */
import { View } from '@tarojs/components'

interface Props {
  /** 当前步骤，0-based */
  current: number
  /** 总步骤数，默认 3 */
  total?: number
}

export default function StepDots({ current, total = 3 }: Props) {
  return (
    <View className='step-dots'>
      {Array.from({ length: total }).map((_, i) => {
        if (i === current) {
          return (
            <View
              key={i}
              className='step-dots__item step-dots__item--current'
            />
          )
        }
        if (i < current) {
          return (
            <View
              key={i}
              className='step-dots__item step-dots__item--done'
            />
          )
        }
        return (
          <View
            key={i}
            className='step-dots__item step-dots__item--pending'
          />
        )
      })}
    </View>
  )
}
