/**
 * 信号提取器（46 条）与注册表元数据 —— signal-dump / signals-all 共用。
 *
 * 单一实现原则：提取器表只在本文件维护，两个脚本 import 引用（勿两处各写）。
 * 提取器签名：(q, p) => { value, note? }；q = getPerception 输出，p = getBabyProfile 输出。
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

// registry 元数据（name/group/status 供输出标注）
const REG = yaml.load(readFileSync(path.join(ROOT, 'config/registry.yaml'), 'utf8'))
export const SIG_META = new Map((REG.groups || []).flatMap((g) => (g.signals || []).map((s) => [s.id, { ...s, groupName: g.name }])))
export const FLAG_META = new Map((REG.flags || []).map((f) => [f.key, f]))

/**
 * 提取器表：signalId → (q, p) => { value, note? }
 * 约定：value 必须 JSON 可序列化；undefined 一律 ?? null（健康字段缺失时给出 gap 说明，不给假值）。
 */
export const EXTRACTORS = {
  // ── A 过敏基本情况（profile.basic）────────────────────────────
  allergyTypes: (q, p) => ({ value: p.basic?.allergyTypes ?? null, note: '13 种枚举；渲染为"轻度牛奶蛋白过敏（过敏原：牛奶）"式' }),
  allergyLevel: (q, p) => ({ value: p.basic?.allergyLevel ?? null, note: 'mild / moderate / severe' }),
  diagnosed: () => ({ value: null, note: '未采集（gap）：依赖 migration 022 的 allergy_diagnosed 字段' }),
  birthWeightG: (q, p) => ({ value: p.basic?.birthWeightG ?? null, note: '未填写时为 null（出生体重常缺记）' }),
  familyAtopyHistory: () => ({ value: null, note: '未采集（gap）：依赖 migration 022 的 family_atopy_history 字段' }),

  // ── B 配方与转奶（q.stage）───────────────────────────────────
  'formula.current': (q) => ({ value: q.stage?.mix ?? null, note: '近 7 天勺数口径的构成占比（降序）' }),
  'formula.ladder': (q) => ({
    value: q.stage ? { level: q.stage.level, label: q.stage.label, nextLabel: q.stage.nextLabel, gapToEnd: q.stage.gapToEnd } : null,
    note: '阶梯位 1-4；nextLabel/gapToEnd 为派生量',
  }),
  'formula.status': (q) => ({ value: q.stage?.status ?? null, note: 'stable / transitioning / stalled（停滞天数 ≥ stageStableDays 判 stalled）' }),
  'formula.direction': (q) => ({ value: q.stage?.direction ?? null, note: '近 30 天主导类型阶梯位对比' }),
  'formula.stalledDays': (q) => ({ value: q.stage ? { stableDays: q.stage.stableDays, stableAtLeast: q.stage.stableAtLeast } : null, note: '构成签名连续天数' }),
  'formula.lactose': (q) => ({ value: q.stage?.lactose ?? null, note: 'eh_lactose → 含乳糖；其余依奶型' }),
  'formula.lastChangedAt': (q) => ({ value: q.stage ? { lastRecordAt: q.stage.lastRecordAt, staleDays: q.stage.staleDays } : null, note: '配方记录新鲜度' }),

  // ── C 喂养方式（profile.feeding / profile.mealRhythm）─────────
  'feeding.mode': (q, p) => ({ value: p.feeding?.mode ?? null, note: 'formula_only / mixed / breast_only（按最近母乳距今 ≥ weanedDays 判）' }),
  'feeding.lastBreastAt': (q, p) => ({ value: { lastBreastAt: p.feeding?.lastBreastAt ?? null, sinceBreastDays: p.feeding?.sinceBreastDays ?? null }, note: null }),
  'feeding.dailyMilkMl': (q, p) => ({ value: p.feeding?.avgFormulaMl7 ?? null, note: '近 7 天配方奶日均毫升（有记录的天取 AVG）' }),
  'feeding.solidKinds': (q, p) => ({ value: p.feeding?.solidKinds30 ?? null, note: '近 30 天辅食不同食材名数（未归一化）' }),
  'feeding.mealRhythm': (q, p) => ({ value: p.mealRhythm ?? null, note: '近 7 天有记录日的平均每天进食次数（不给达标结论）' }),

  // ── D 辅食与排敏（q.allergy / q.highRisk）────────────────────
  'food.safeList': (q) => ({ value: q.allergy ? { safeCount: q.allergy.safeCount, safeKinds: q.allergy.safeKinds, safeNames: q.allergy.safeNames } : null, note: '归一化去重后的种数（西兰花 / 西兰花泥算 1 种）' }),
  'food.suspectedList': (q) => ({ value: q.allergy?.suspected ?? null, note: null }),
  'food.allergicList': (q) => ({ value: q.allergy?.allergic ?? null, note: null }),
  'food.observingTask': (q) => ({ value: q.allergy?.observing ?? null, note: 'day/days = 第 N/共 N 天；idle = 未推进天数' }),
  'food.conflictFlags': (q) => ({
    value: q.allergy ? { stalled: q.allergy.stalledObserving?.map((o) => o.name) ?? [], overlaps: q.allergy.overlaps ?? [], dupGroups: q.allergy.dupGroups?.map((g) => g.normalized) ?? [] } : null,
    note: '四项检查中的三项（食用违纪见 flag eating_marked）',
  }),
  'food.highRiskIntroduced': (q) => ({ value: q.highRisk ?? null, note: '7 组高致敏引进状态；只描述不催引入' }),
  'food.observationLog': (q) => ({ value: q.allergy ? { logTotal: q.allergy.logTotal, lastLogAt: q.allergy.lastLogAt, loggedNotClosed: q.allergy.loggedNotClosed } : null, note: '逐日打卡（双源合并）' }),
  'food.normalization': (q) => ({ value: { dupGroups: q.allergy?.dupGroups ?? [] }, note: '三步归一化；此处展示重复建档组（同一食材多条目）' }),

  // ── E 生长与营养（profile.growth / q.growth / profile.supplements）──
  'growth.weightP': (q, p) => ({ value: p.growth?.latest ? { kg: p.growth.latest.weightKg, p: p.growth.latest.weightP, at: p.growth.latest.measuredAt, months: p.growth.latest.months } : null, note: null }),
  'growth.heightP': (q, p) => ({ value: p.growth?.latest ? { cm: p.growth.latest.heightCm, p: p.growth.latest.heightP, at: p.growth.latest.measuredAt } : null, note: null }),
  'growth.headP': (q, p) => ({ value: p.growth?.latest ? { cm: p.growth.latest.headCm, p: p.growth.latest.headP, at: p.growth.latest.measuredAt } : null, note: '头围（各指标分别回溯上次有效测量）' }),
  'growth.trend': (q, p) => ({
    value: p.growth?.latest && p.growth?.previous ? { current: p.growth.latest.weightP, previous: p.growth.previous.weightP, staleDays: p.growth.staleDays } : null,
    note: '最近两次体重分位对比（完整 trend 计算见注入块）',
  }),
  'growth.velocity': (q, p) => ({ value: p.growth?.velocity ?? null, note: '实测增速（g/天、cm/月）；不给达标结论' }),
  'growth.wfh': () => ({ value: null, note: '未实现（gap）：缺 WHO weight-for-length 参考表' }),
  'nutrition.supplementAdherence': (q, p) => ({ value: p.supplements ?? null, note: '维 D 等补充剂近窗口覆盖率' }),

  // ── F 症状与反应（q.symptoms / q.stool）──────────────────────
  'symptom.recent': (q) => ({ value: { total: q.symptoms?.symptomTotal ?? 0, recent: (q.symptoms?.symptomRecent ?? []).slice(0, 5), lastAt: q.symptoms?.lastSymptomAt ?? null }, note: '仅展示最近 5 条' }),
  allergyEvents: (q) => ({ value: { total: q.symptoms?.eventTotal ?? 0, events: (q.symptoms?.events ?? []).slice(0, 5), lastAt: q.symptoms?.lastEventAt ?? null, worstSeverity: q.symptoms?.worstSeverity ?? null }, note: 'health_record 第二入口；仅展示最近 5 条' }),
  stoolFlag: (q) => ({ value: q.stool ?? null, note: '性状分布 + 填写率（低于覆盖率下限不下阴性结论）' }),
  'symptom.activeDays': (q) => ({ value: { activeDays: q.symptoms?.activeDays ?? 0, activeDays14: q.symptoms?.activeDays14 ?? 0 }, note: null }),
  'symptom.foodLink': (q) => ({ value: { eventFoods: q.symptoms?.eventFoods ?? [], unlinked: q.symptoms?.unlinkedEvents ?? 0 }, note: '事件↔食材关联' }),

  // ── G 医疗与随访（profile.medical）───────────────────────────
  'medical.byType': (q, p) => ({ value: p.medical?.byType ?? null, note: '按 visit_type 计数' }),
  'medical.lastCheckup': (q, p) => ({ value: { lastCheckupAt: p.medical?.lastCheckupAt ?? null, lastVisitAt: p.medical?.lastVisitAt ?? null, lastVisitType: p.medical?.lastVisitType ?? null }, note: null }),
  'medical.followUp': (q, p) => ({ value: p.medical?.followUp ?? null, note: '复查计划（无则 null）' }),
  'medical.vaccineProgress': (q, p) => ({ value: { vaccineCount: p.medical?.byType?.vaccine ?? 0, degraded: p.medical?.degradedPartial ?? false }, note: '降级（degraded）：明细依赖 migration 020 上生产，当前仅计数' }),

  // ── H 日记与家长侧（profile.freshness / gap）──────────────────
  'diary.lastAt': (q, p) => ({ value: p.freshness?.diary ?? null, note: '日记新鲜度（8 源之一）' }),
  'diary.themes': () => ({ value: null, note: '未实现（gap）：PRD 标注"本版暂缓"' }),

  // ── I 数据可信度（profile.freshness / q.coverage）─────────────
  'freshness.staleDays': (q, p) => ({ value: p.freshness ?? null, note: '8 源陈旧天数' }),
  'coverage.rate': (q) => ({ value: q.coverage ?? null, note: '大便性状 / 头围 / 辅食记录三通道覆盖率' }),
  'coverage.negativeGate': (q) => ({ value: { coverageMin: q.ref?.coverageMin ?? null, stoolCoverageOk: q.stool?.coverageOk ?? null }, note: '覆盖率低于下限时注入块显式约束"不得下阴性结论"' }),
}

export function findFlag(q, key) {
  const f = (q.flags || []).find((x) => x.key === key)
  const meta = FLAG_META.get(key)
  if (!meta) return null
  return {
    value: f ? { triggered: true, label: f.label, strength: f.strength, detail: f.detail } : { triggered: false },
    note: `触发条件：${meta.trigger_desc}`,
  }
}

