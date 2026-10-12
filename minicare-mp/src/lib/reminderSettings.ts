/**
 * 首页提醒卡片开关（本地存储）
 *
 * 首页横幅区会出现的提醒卡片，家长可单独关闭不需要的；默认全部开启。
 * 存储为本机设备级（Taro Storage）：家庭成员各自设备独立设置，
 * 不做服务端同步（2026-10-12 决策）。
 *
 * 读取约定：无存储 / 存储损坏 / 后续新增的开关 key，一律回落默认值 true。
 */
import Taro from '@tarojs/taro'

export interface ReminderSettings {
  /** 喂奶 / 辅食提醒（合并展示最近一次进食） */
  feed: boolean
  /** 补剂 & 营养素提醒 */
  supplement: boolean
  /** 排敏进度提醒 */
  allergy: boolean
  /** 日程提醒（含「去设置作息计划」引导条） */
  schedule: boolean
  /** 复查提醒 */
  followup: boolean
  /** 睡眠提醒（「宝宝正在睡觉」状态条） */
  sleep: boolean
  /** 日记提醒（首页「昨日日记」卡片） */
  diary: boolean
}

const REMINDER_SETTINGS_KEY = 'minicare_reminder_settings'

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  feed: true,
  supplement: true,
  allergy: true,
  schedule: true,
  followup: true,
  sleep: true,
  diary: true,
}

/** 全部开关 key（设置页渲染顺序 = 此顺序） */
export const REMINDER_SETTINGS_KEYS: (keyof ReminderSettings)[] = [
  'feed',
  'supplement',
  'allergy',
  'schedule',
  'followup',
  'sleep',
  'diary',
]

export function getReminderSettings(): ReminderSettings {
  try {
    const raw = Taro.getStorageSync(REMINDER_SETTINGS_KEY)
    if (raw && typeof raw === 'object') {
      return { ...DEFAULT_REMINDER_SETTINGS, ...(raw as Partial<ReminderSettings>) }
    }
  } catch {
    // 读取失败按默认（全开）处理
  }
  return { ...DEFAULT_REMINDER_SETTINGS }
}

export function saveReminderSettings(settings: ReminderSettings): void {
  try {
    Taro.setStorageSync(REMINDER_SETTINGS_KEY, settings)
  } catch {
    // 保存失败静默：下次读取回落默认值
  }
}

/** 已关闭的开关数量（用于「我的」页入口副文案） */
export function countDisabled(settings: ReminderSettings): number {
  return REMINDER_SETTINGS_KEYS.filter((k) => !settings[k]).length
}
