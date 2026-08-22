/**
 * 记录类型图标静态资源（与 minicare-web RecordTypeIcon / icons.tsx 对齐）。
 * 小程序端通过 Image 的 src 引用，颜色已写入各 SVG。
 */
import activity from './activity.svg'
import allergy from './allergy.svg'
import breast from './breast.svg'
import diaper from './diaper.svg'
import feeding from './feeding.svg'
import food from './food.svg'
import formula from './formula.svg'
import growth from './growth.svg'
import health from './health.svg'
import medical from './medical.svg'
import medication from './medication.svg'
import sleep from './sleep.svg'
import supplement from './supplement.svg'
import symptom from './symptom.svg'
import temperature from './temperature.svg'

export const RECORD_TYPE_ICON_SRC: Record<string, string> = {
  feeding: feeding,
  formula,
  breast,
  food,
  sleep,
  diaper,
  activity,
  growth,
  health,
  allergy,
  temperature,
  medical,
  medication,
  symptom,
  supplement,
}
