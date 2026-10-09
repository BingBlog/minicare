/**
 * 记录类型图标静态资源（统一圆润描边风格，颜色已写入各 SVG）。
 * 小程序端通过 Image 的 src 引用。
 * 注：activity 已回归 ui-draft 设计稿版（Lucide activity 活力折线），非早期手绘爬行小人；
 *     与 minicare-web IconBabyCrawl 不再同构（web 为维护模式，未同步）。
 */
import activity from './activity.svg'
import allergy from './allergy.svg'
import breast from './breast.svg'
import checkup from './checkup.svg'
import diaper from './diaper.svg'
import feeding from './feeding.svg'
import food from './food.svg'
import formula from './formula.svg'
import growth from './growth.svg'
import health from './health.svg'
import medical from './medical.svg'
import medication from './medication.svg'
import other from './other.svg'
import sick from './sick.svg'
import sleep from './sleep.svg'
import supplement from './supplement.svg'
import symptom from './symptom.svg'
import temperature from './temperature.svg'
import vaccine from './vaccine.svg'

export const RECORD_TYPE_ICON_SRC: Record<string, string> = {
  feeding,
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
  // 医疗子类型（PRD-005 US-01 类型选择页 / 020 疫苗儿保表单分区复用）
  vaccine,
  checkup,
  sick,
  other,
}
