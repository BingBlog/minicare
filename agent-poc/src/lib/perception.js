/**
 * 现状感知（lib/perception.js，TECH-014 v1）
 *
 * 定位：回答「宝宝现在到哪了、这样走合理吗」，**不回答**「要去哪」。
 * 把跨表推断出的现状结论算好注入 systemPrompt，让助手开口即带真实前提，
 * 并且知道**什么时候不该下结论**（信息缺失 / 数据陈旧）。
 *
 * 覆盖 TECH-014 六板块，其中四块复用 profile.js（不重算），三块为本模块新增：
 *   ① 奶粉阶段与进度  ← 复用 profile.formula（只补"下一阶 / 距终点 / 阶内进度"三个派生量）
 *   ② 排敏进度        ← food_observation          【新增】
 *   ③ 日常摄入多样性  ← feeding_food_item          【新增】
 *   ④ 已耐受维持暴露  ← food_observation × feeding_food_item 【新增】
 *   ⑤ 数据可信度      ← 复用 profile.freshness
 *   ⑥ 合理性判定      ← 以上各项的纯内存派生，零额外 SQL
 *
 * 三条硬约束（与 profile.js 一致）：
 *   1) **单一真相源**：奶粉阶段 / 月龄 / 数据新鲜度一律复用 profile.js；
 *      参考值只在 REF 定义一次（干跑脚本 perception-preview.mjs 亦从此处引入）。
 *   2) **失败静默降级**：任一组查询失败 → 该组置空，其余照常注入，感知缺失不影响对话。
 *   3) **只出事实与判定，不出建议** —— 建议由对话产生（分析只在对话）。
 *
 * 缓存：进程内 Map + 5 分钟 TTL。
 * 已知缺口：写入主动失效需要跨进程通知（写在 minicare-server、缓存在这里），
 * 当前只靠 TTL；`invalidatePerception()` 已导出备用（见 TECH-013 §4.2）。
 */
import { getDb } from './db.js'
import {
  getBabyProfile,
  cstToday,
  addDays,
  dayDiff,
  toDateStr,
  LADDER_LABEL,
  LADDER_LEVEL,
  FRESHNESS_LABEL as FRESH_LABEL, // 数据源中文名唯一出处，勿在本文件另立一份
} from './profile.js'

const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map() // babyId -> { at, perception }

/**
 * 参考值 —— 全产品唯一出处。
 * 来源：docs/agent/tech/RESEARCH-20260920-转奶与排敏行业参考值.md
 *   stageStableDays  NHS 标准阶梯 7 天 + FPIAP 1-2 周 → 取 14 天
 *   stageMinDays     硬下限：即使提前吃完规定量也须满 7 天（NHS）
 *   observeDays      国家卫健委「2-3 日」+ 中国营养学会「2-3 天」→ 取 3 天
 *   dailyKinds       每日辅食种类下限（含 1 动物性 + 1 蔬菜 + 1 谷薯）
 *   symptomUsableDays 症状数据超过此天数视为陈旧，不得下阴性结论（与 profile STALE_DAYS 同值）
 */
export const REF = Object.freeze({
  stageStableDays: 14,
  stageMinDays: 7,
  observeDays: 3,
  dailyKinds: 4,
  dailyCategories: 4,
  maintainPerWeek: 2,
  maintainPerWeekMax: 3,
  symptomUsableDays: 14,
  windowVarietyDays: 14,
  windowEatenDays: 30,
})

/** 阶梯推进路径（高 → 低）。eh 两态同阶，故都指向 ph。 */
const NEXT_STAGE = { aa: 'eh_lactose', eh_no_lactose: 'ph', eh_lactose: 'ph', ph: 'std' }
/** 排敏五态（PRD-006 §4.3.3 统一口径） */
const OBS_STATUS = ['observing', 'safe', 'suspected', 'allergic', 'paused']
const OBS_STATUS_LABEL = {
  observing: '观察中',
  safe: '已耐受',
  suspected: '疑似',
  allergic: '已确认过敏',
  paused: '已暂停',
}
// 数据源中文名 FRESH_LABEL 已统一由 profile.js 导出（见顶部 import）——勿在本文件另立清单

// ── 食材归一化（同一食材重复建档 / 形态差异）─────────────────────────
/** 七大类食物（膳食指南口径）关键词表 */
const CATEGORY_RULES = [
  ['谷薯', ['米粉', '米', '小米', '粥', '面', '馒头', '土豆', '红薯', '紫薯', '山药', '玉米', '燕麦', '南瓜']],
  ['蔬菜', ['青菜', '西兰花', '菠菜', '胡萝卜', '生菜', '芹菜', '白菜', '油菜', '番茄', '西红柿', '黄瓜', '冬瓜', '茄子', '豌豆', '西葫芦']],
  ['水果', ['苹果', '香蕉', '梨', '火龙果', '蓝莓', '草莓', '桃', '牛油果', '橙', '葡萄', '西梅']],
  ['肉禽鱼', ['鸡', '猪', '牛', '羊', '里脊', '鱼', '虾', '鳕鱼', '三文鱼', '肝']],
  ['蛋', ['蛋']],
  ['豆类坚果', ['豆腐', '豆', '花生', '芝麻', '核桃', '坚果']],
  ['奶类', ['奶', '酸奶', '奶酪']],
]
/** 形态后缀 / 修饰前缀：剥离后比对，是「同一食材重复建档」的主因 */
const SUFFIX = ['米糊', '泥糊', '泥', '糊', '粥', '水', '汁', '条', '块', '片', '粉', '沫', '羹', '汤']
const PREFIX = ['纯', '熟', '自制', '新鲜', '有机', '进口']
/**
 * 别名表：品牌 / 描述性命名差异，规则剥不出来只能显式枚举。
 * 刻意留空 —— dev 库曾出现「强化铁米」与「高铁米粉」指同一产品，
 * 但是否归并同一食材（如"纯米粉 vs 小米粉"）属待确认项（TECH-014 §12-Q1），
 * 未拍板前不猜；重复建档会通过 `dupGroups` 显式暴露而不是被静默合并。
 */
const ALIAS = new Map()

/** 归一化：① 复合名拆分 ② 剥修饰前后缀 ③ 别名兜底 → 食材数组 */
export function normalizeFoods(rawName) {
  const parts = String(rawName)
    .split(/[+＋、，,]/)
    .map((s) => s.trim())
    .filter(Boolean)
  const out = []
  for (let p of parts) {
    for (const pre of PREFIX) if (p.length > pre.length + 1 && p.startsWith(pre)) p = p.slice(pre.length)
    let changed = true
    while (changed) {
      changed = false
      for (const suf of SUFFIX) {
        if (p.length > suf.length + 1 && p.endsWith(suf)) {
          p = p.slice(0, -suf.length)
          changed = true
          break
        }
      }
    }
    out.push(ALIAS.get(p) || p)
  }
  return out.length ? out : [String(rawName).trim()]
}

/** 归类到七大类（首个命中）；未命中计「未归类」 */
export function categoryOf(name) {
  for (const [cat, keys] of CATEGORY_RULES) if (keys.some((k) => name.includes(k))) return cat
  return '未归类'
}

// ── 分组查询（各自独立降级）──────────────────────────────────────────

/** ② 排敏建档（全量，量级为几十条） */
async function queryObservations(db, babyId) {
  const [rows] = await db.query(
    `SELECT food_name, status, current_day, observation_days, first_intro_at, last_intro_at,
            retry_after_date, severity, intro_count, DATE(updated_at) AS upd
     FROM food_observation WHERE baby_id = ? ORDER BY updated_at DESC`,
    [babyId],
  )
  const today = cstToday()
  const byStatus = (s) => rows.filter((r) => r.status === s)

  // 已耐受：归一化去重（西兰花 / 西兰花泥 算一种）
  const safeMap = new Map()
  for (const o of byStatus('safe')) {
    for (const n of normalizeFoods(o.food_name)) {
      if (!safeMap.has(n)) safeMap.set(n, new Set())
      safeMap.get(n).add(o.food_name)
    }
  }
  const dupGroups = [...safeMap.entries()]
    .filter(([, s]) => s.size > 1)
    .map(([n, s]) => ({ normalized: n, raw: [...s] }))

  const observing = byStatus('observing').map((o) => {
    const days = Number(o.observation_days) || REF.observeDays
    const idle = dayDiff(toDateStr(o.upd), today)
    return { name: o.food_name, day: o.current_day, days, idle, stalled: idle != null && idle > days }
  })

  return {
    total: rows.length,
    byStatus: Object.fromEntries(OBS_STATUS.map((s) => [s, byStatus(s).length])),
    safeCount: byStatus('safe').length,
    safeKinds: safeMap.size,
    safeNames: [...safeMap.keys()],
    dupGroups,
    observing,
    stalledObserving: observing.filter((o) => o.stalled),
    suspected: byStatus('suspected').map((o) => ({ name: o.food_name, severity: o.severity })),
    allergic: byStatus('allergic').map((o) => o.food_name),
    paused: byStatus('paused').map((o) => o.food_name),
  }
}

/** ③ 逐日摄入多样性（近 14 天） */
async function queryVariety(db, babyId) {
  const [rows] = await db.query(
    `SELECT DATE(r.record_time) AS d, COUNT(DISTINCT i.food_name) AS kinds,
            GROUP_CONCAT(DISTINCT i.food_name ORDER BY i.food_name SEPARATOR '、') AS foods
     FROM feeding_food_record r JOIN feeding_food_item i ON i.record_id = r.id
     WHERE r.baby_id = ? AND r.record_time >= ? GROUP BY DATE(r.record_time) ORDER BY d`,
    [babyId, addDays(cstToday(), -REF.windowVarietyDays)],
  )
  const days = rows.map((r) => {
    const foods = normalizeFoods(String(r.foods).replace(/、/g, '+'))
    return {
      date: toDateStr(r.d),
      kinds: Number(r.kinds),
      kindsNormalized: foods.length,
      categories: [...new Set(foods.map(categoryOf))],
      foods,
    }
  })
  const hitDays = days.filter((d) => d.kindsNormalized >= REF.dailyKinds).length
  return {
    days,
    recordedDays: days.length,
    hitDays,
    avgKinds: days.length ? days.reduce((s, d) => s + d.kindsNormalized, 0) / days.length : 0,
    categories: [...new Set(days.flatMap((d) => d.categories))],
  }
}

/** ④ 近 30 天真实吃过什么（维持暴露的判据） */
async function queryEaten(db, babyId) {
  const [rows] = await db.query(
    `SELECT i.food_name, COUNT(*) AS times, MAX(DATE(r.record_time)) AS last_d
     FROM feeding_food_item i JOIN feeding_food_record r ON r.id = i.record_id
     WHERE r.baby_id = ? AND r.record_time >= ? GROUP BY i.food_name ORDER BY last_d DESC`,
    [babyId, addDays(cstToday(), -REF.windowEatenDays)],
  )
  const cut14 = addDays(cstToday(), -REF.windowVarietyDays)
  const eaten30 = new Set(rows.flatMap((e) => normalizeFoods(e.food_name)))
  const eaten14 = new Set(
    rows.filter((e) => toDateStr(e.last_d) >= cut14).flatMap((e) => normalizeFoods(e.food_name)),
  )
  return { items: rows, eaten30: [...eaten30], eaten14: [...eaten14] }
}

// ── ⑥ 合理性判定（纯内存派生，零额外 SQL）────────────────────────────
/**
 * flag key 与 TECH-013 §7.6 的命名对齐：能对上的复用（observing_overlap / data_stale），
 * 语义不同的新起（observe_stalled / safe_not_maintained / transition_ready / variety_insufficient）。
 */
function buildFlags({ stage, allergy, variety, maintain, trust }, ref) {
  const flags = []
  if (allergy.stalledObserving.length) {
    flags.push({
      key: 'observe_stalled',
      label: '排敏任务停滞',
      detail: allergy.stalledObserving
        .map((o) => `${o.name} 停 ${o.idle} 天（观察期仅 ${o.days} 天）`)
        .join('；'),
    })
  }
  if (allergy.observing.length > 1) {
    flags.push({
      key: 'observing_overlap',
      label: '排敏并行',
      detail: `同时 ${allergy.observing.length} 项在观察，无法归因反应`,
    })
  }
  if (maintain.idleSafe.length) {
    flags.push({
      key: 'safe_not_maintained',
      label: '已耐受未维持',
      detail: `${maintain.idleSafe.length} 种已判耐受但近 ${ref.windowVarietyDays} 天未再食用`,
    })
  }
  // stage 可为 null（尚无配方记录的宝宝：新用户 / 纯母乳 / 未开始转奶）——
  // 这是合法状态，不是异常。缺此守卫会抛 TypeError 导致整个感知层降级为 null，
  // 使这些宝宝连排敏、多样性、可信度都拿不到。
  if (stage && stage.level > 1 && stage.stableDays >= ref.stageStableDays) {
    flags.push({
      key: 'transition_ready',
      label: '转奶可推进',
      detail: `本阶已 ${stage.stableDays} 天 ≥ 参考 ${ref.stageStableDays} 天`,
    })
  }
  if (variety.recordedDays && variety.hitDays < variety.recordedDays * 0.5) {
    flags.push({
      key: 'variety_insufficient',
      label: '日常种类不足',
      detail: `近 ${ref.windowVarietyDays} 天仅 ${variety.hitDays}/${variety.recordedDays} 天达到 ${ref.dailyKinds} 种（排敏期单一种属正常，需排除）`,
    })
  }
  if (trust.symptomStaleDays != null && trust.symptomStaleDays > ref.symptomUsableDays) {
    flags.push({
      key: 'data_stale',
      label: '症状数据陈旧',
      detail: `${trust.symptomStaleDays} 天无症状记录，相关阴性结论不可下`,
    })
  }
  return flags
}

// ── 主入口 ──────────────────────────────────────────────────────────

/**
 * 取现状感知（带 5 分钟进程内缓存）。
 * @param {string} babyId
 * @param {object} [opts]
 * @param {object} [opts.profile] 已取到的画像（runtime.js 并行取过，避免重复 5 条 SQL）
 * @param {object} [opts.ref]     参考值覆盖（仅测试用）
 * @returns {Promise<object|null>} 无 babyId / 档案缺失时 null（调用方按"无感知"处理）
 */
export async function getPerception(babyId, { profile = null, ref = null } = {}) {
  if (!babyId) return null
  // 传了 ref 就绕过缓存：缓存键只有 babyId，否则参数化参考值会被上一次的结果顶掉
  const hit = ref ? null : cache.get(babyId)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.perception
  const R = ref ? { ...REF, ...ref } : REF
  try {
    const p = profile || (await getBabyProfile(babyId))
    if (!p?.basic) return null
    const db = getDb()
    if (!db) return null

    const safe = async (label, fn) => {
      try {
        return await fn()
      } catch (e) {
        console.warn(`[perception] ${label} 查询失败，该组降级为空:`, e?.message || e)
        return null
      }
    }

    const [allergy, variety, eaten] = await Promise.all([
      safe('allergy', () => queryObservations(db, babyId)),
      safe('variety', () => queryVariety(db, babyId)),
      safe('eaten', () => queryEaten(db, babyId)),
    ])

    // ① 阶段：全部复用 profile.formula，只做派生
    const f = p.formula
    const stage = f?.dominant
      ? (() => {
          const next = NEXT_STAGE[f.dominant] || null
          const nextPct = next ? f.current.find(([t]) => t === next)?.[1] || 0 : 0
          const verdict =
            f.ladderLevel === 1
              ? '已在普通配方（终点）'
              : f.stalledDays < R.stageMinDays
                ? '未满下限，观察中'
                : f.stalledDays < R.stageStableDays
                  ? '进度正常'
                  : `本阶已 ${f.stalledDays} 天 ≥ 参考 ${R.stageStableDays} 天，具备推进条件（需无症状前提）`
          return {
            key: f.dominant,
            label: f.dominantLabel,
            level: f.ladderLevel,
            nextKey: next,
            nextLabel: next ? LADDER_LABEL[next] || next : null,
            nextLevel: next ? LADDER_LEVEL[next] : null,
            gapToEnd: f.ladderLevel != null ? f.ladderLevel - 1 : null,
            mix: f.current,
            nextPct,
            stableDays: f.stalledDays,
            stableAtLeast: !!f.stalledAtLeast,
            status: f.status,
            lactose: f.lactose || null,
            aaStoppedDays: f.aaStoppedDays ?? null,
            staleDays: f.staleDays ?? 0,
            lastRecordAt: toDateStr(f.lastRecordAt) || null,
            verdict,
          }
        })()
      : null

    // ④ 维持暴露：需 ② 的已耐受清单与 ③/④ 的实测食用清单交叉
    const eatenInfo = eaten || { items: [], eaten30: [], eaten14: [] }
    const safeNames = allergy?.safeNames || []
    const eaten14Set = new Set(eatenInfo.eaten14)
    const maintain = {
      eaten30: eatenInfo.eaten30,
      eaten14: eatenInfo.eaten14,
      idleSafe: safeNames.filter((n) => !eaten14Set.has(n)),
    }

    // ⑤ 数据可信度：复用 profile.freshness
    const symptomStaleDays = p.freshness?.symptom?.staleDays ?? null
    const trust = {
      sources: p.freshness || {},
      symptomStaleDays,
      symptomUsable: !(symptomStaleDays != null && symptomStaleDays > R.symptomUsableDays),
    }

    const varietyInfo = variety || { days: [], recordedDays: 0, hitDays: 0, avgKinds: 0, categories: [] }
    const allergyInfo = allergy || {
      total: 0,
      byStatus: Object.fromEntries(OBS_STATUS.map((s) => [s, 0])),
      safeCount: 0,
      safeKinds: 0,
      safeNames: [],
      dupGroups: [],
      observing: [],
      stalledObserving: [],
      suspected: [],
      allergic: [],
      paused: [],
    }

    const perception = {
      babyId,
      at: Date.now(),
      today: cstToday(),
      ref: R,
      stage,
      allergy: allergyInfo,
      variety: varietyInfo,
      maintain,
      trust,
      flags: [],
    }
    perception.flags = buildFlags(perception, R)
    // 参数化参考值的结果不写缓存，避免污染线上口径
    if (!ref) cache.set(babyId, { at: Date.now(), perception })
    return perception
  } catch (e) {
    console.warn('[perception] 构建失败，降级为无感知:', e?.message || e)
    return null
  }
}

/** 写记录后主动失效缓存（跨进程场景见 TECH-013 §4.2，当前未接线） */
export function invalidatePerception(babyId) {
  if (babyId) cache.delete(babyId)
  else cache.clear()
}

/**
 * 渲染为可注入 systemPrompt 的中文现状块。无感知时返回空串。
 * 行数刻意压到 ~10 行：这一段每轮都进 prompt，长一点就是每轮的成本。
 */
export function renderPerceptionBlock(perception) {
  if (!perception) return ''
  const { stage, allergy, variety, maintain, trust, flags, ref } = perception
  const lines = ['【宝宝现状（服务端算好的结论，直接作为前提使用）】']

  // ① 奶粉阶段与进度
  if (stage) {
    const bits = [`当前 ${stage.mix.map(([t, r]) => `${LADDER_LABEL[t] || t} ${Math.round(r * 100)}%`).join(' + ')}`]
    bits.push(stage.nextLabel ? `下一阶 ${stage.nextLabel}` : '已在终点')
    bits.push(`距终点 ${stage.gapToEnd} 阶`)
    bits.push(`阶内进度 ${Math.round(stage.nextPct * 100)}%`)
    bits.push(`本阶稳定 ${stage.stableDays} 天${stage.stableAtLeast ? '（至少）' : ''}（参考 ${ref.stageStableDays} 天）`)
    if (stage.lactose) bits.push(`乳糖 ${stage.lactose}`)
    const stale = stage.staleDays > 3 ? `；配方记录截至 ${stage.lastRecordAt}，已 ${stage.staleDays} 天未更新` : ''
    lines.push(`转奶：${bits.join('｜')}${stale}。判定：${stage.verdict}`)
  } else {
    lines.push('转奶：无足够配方记录，无法判定阶段（信息缺失，不要据此说"还在某某配方"）。')
  }

  // ② 排敏进度
  const st = allergy.byStatus
  const dist = OBS_STATUS.filter((s) => st[s] > 0)
    .map((s) => `${OBS_STATUS_LABEL[s]} ${st[s]}`)
    .join(' / ')
  if (allergy.total) {
    lines.push(
      `排敏：建档 ${allergy.total} 条（${dist}）；已耐受 ${allergy.safeCount} 条归一化后 ${allergy.safeKinds} 种。`,
    )
    if (allergy.observing.length) {
      lines.push(
        `观察中：${allergy.observing
          .map((o) => `${o.name} 第 ${o.day}/${o.days} 天（${o.idle} 天未推进）`)
          .join('；')}。`,
      )
    }
    if (allergy.suspected.length) {
      lines.push(`疑似：${allergy.suspected.map((o) => `${o.name}${o.severity ? `(${o.severity})` : ''}`).join('、')}。`)
    }
    if (allergy.allergic.length) lines.push(`已确认过敏：${allergy.allergic.join('、')}。`)
    if (allergy.paused.length) lines.push(`已暂停：${allergy.paused.join('、')}。`)
    if (allergy.dupGroups.length) {
      lines.push(
        `重复建档（同一食材多条目）：${allergy.dupGroups.map((g) => `${g.normalized} ← ${g.raw.join(' / ')}`).join('；')}。`,
      )
    }
  } else {
    lines.push('排敏：无任何建档记录（信息缺失，不要据此说"还没开始排敏"或"都耐受"）。')
  }

  // ③ 日常摄入多样性
  if (variety.recordedDays) {
    lines.push(
      `日常种类：近 ${ref.windowVarietyDays} 天有辅食记录 ${variety.recordedDays} 天，平均每天 ${variety.avgKinds.toFixed(1)} 种（参考 ≥${ref.dailyKinds} 种），达标 ${variety.hitDays}/${variety.recordedDays} 天；覆盖类别 ${variety.categories.length} 类。`,
    )
  } else {
    lines.push(`日常种类：近 ${ref.windowVarietyDays} 天无辅食记录（信息缺失，不等于"种类不足"）。`)
  }

  // ④ 已耐受维持暴露
  if (maintain.eaten30.length || maintain.idleSafe.length) {
    const idle = maintain.idleSafe.length
      ? `${maintain.idleSafe.length} 种已判耐受但近 ${ref.windowVarietyDays} 天未再吃：${maintain.idleSafe.join('、')}`
      : '已耐受的都在维持'
    lines.push(
      `维持暴露：近 ${ref.windowEatenDays} 天实际吃过 ${maintain.eaten30.length} 种；${idle}（参考：已耐受食物每周维持 ${ref.maintainPerWeek}-${ref.maintainPerWeekMax} 次）。`,
    )
  }

  // ⑤ 数据可信度（元信号）
  const trustBits = Object.entries(FRESH_LABEL).map(([k, label]) => {
    const info = trust.sources?.[k]
    if (!info?.lastAt) return `${label}无记录`
    return info.staleDays === 0 ? `${label}今天` : `${label}${info.staleDays}天前`
  })
  lines.push(`数据可信度：${trustBits.join(' / ')}。`)
  if (!trust.symptomUsable) {
    lines.push(
      `症状结论不可用：${trust.symptomStaleDays} 天无症状记录，只能表述"这段时间没有相关记录"，不得推断"没有过敏反应"。`,
    )
  }

  // ⑥ 合理性判定
  if (flags.length) {
    lines.push(`需要注意：${flags.map((f) => `${f.label}（${f.detail}）`).join('；')}。`)
  }

  // 行为约束：这一段决定现状块是否真的改变回答，而不是变成一段"资料"
  lines.push(
    [
      '【现状使用要求】',
      '- 以上是"现在到哪了、走得合不合理"的结论，直接当前提用；只在与家长问题相关时自然带出，**不要**逐条复述给家长，也不要暴露统计口径（条数/窗口/均值）。',
      '- 标注"信息缺失/无记录/陈旧/未更新"的项不得当阴性结论（症状久无记录 ≠ 无症状；辅食无记录 ≠ 种类不足）；被家长问到时如实说这段没有记录。',
      '- 这些**不是计划**：不要据此给出"应该转奶了/应该加辅食了"的目标、倒计时或待办清单；只描述现状，建议在家长具体问到该怎么走时再给。',
      '- 涉及医疗判断（转阶、复引入、停配方）时附"仅供参考，不能替代专业医疗建议"。',
    ].join('\n'),
  )

  return lines.join('\n')
}
