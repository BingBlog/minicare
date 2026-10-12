/**
 * 补剂 key 归一化与展示（PRD-018 §3.4 单点函数）
 *
 * 背景：dev 库实测存在历史脏变体（`probiotics` 复数 ×2 vs `probiotic` ×23），
 * 首页「每日补充计划」对账必须经此归一化后再比较；本文件是映射表的唯一维护点，
 * 消费方（SupplementBar 等）禁止各自实现第二份。
 */
import { suppItems } from '@/pages/records/feeding/types'

/** 历史脏变体映射（lowercase → canonical lowercase）——实测驱动，新增需附数据出处 */
const KEY_VARIANT_MAP: Record<string, string> = {
  // dev 库 2026-10-12 实测：probiotics(2) / probiotic(23)
  probiotics: 'probiotic',
}

/** 归一化单个 key（trim + 统一小写 + 变体映射；空串返回 ''） */
export function normalizeSupplementKey(key: string): string {
  const lower = (key || '').trim().toLowerCase()
  return KEY_VARIANT_MAP[lower] ?? lower
}

/** 归一化为集合（供差集对账；空值自动剔除） */
export function normalizeSupplementKeys(keys: string[]): Set<string> {
  const set = new Set<string>()
  for (const k of keys) {
    const n = normalizeSupplementKey(k)
    if (n) set.add(n)
  }
  return set
}

/** plan key → 展示名（suppItems 映射；未知 key 兜底原样显示） */
const LABEL_MAP = new Map(suppItems.map((s) => [s.key.toLowerCase(), s.label]))

export function supplementLabel(key: string): string {
  return LABEL_MAP.get((key || '').toLowerCase()) ?? key
}
