/**
 * 现状感知（lib/perception.js，TECH-014）
 *
 * 定位：回答「宝宝现在到哪了、这样走合理吗」，**不回答**「要去哪」。
 * 把跨表推断出的现状结论算好注入 systemPrompt，让助手开口即带真实前提，
 * 并且知道**什么时候不该下结论**（信息缺失 / 数据陈旧 / 覆盖率不足）。
 *
 * 覆盖 PRD-006 §4.3 的 10 组信号，其中复用 profile.js 的不重算：
 *   ① 奶粉阶段与进度  ← 复用 profile.formula（补"下一阶 / 距终点 / 阶内进度"派生量）
 *   ② 排敏进度        ← food_observation × food_observation_log × feeding_food_item（双源合并）
 *   ③ 日常摄入多样性  ← feeding_food_item
 *   ④ 已耐受维持暴露  ← food_observation × feeding_food_item
 *   ⑤ 数据可信度      ← 复用 profile.freshness + 覆盖率 coverage
 *   ⑥ 症状与反应      ← symptom_record × health_record.allergy_symptoms × diaper_record
 *   ⑦ 合理性判定      ← 以上各项的纯内存派生，零额外 SQL
 *   ⑧ 判定优先级链    ← §4.4 五级（护栏 > 数据不足 > 分型 > 活跃计划 > 空档）
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
 * flag 频控（单轮 ≤1 条 / 同 flag 7 天去重）同样是**进程内**状态，CloudRun 缩容到 0
 * 后重来 —— 属已知折中，跨进程去重需 migration 022 落库（TECH-013 §7.6）。
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
  /** 过敏事件回看窗口：过敏史比"近期症状"更需要长窗（一次反应会定义后续数周的喂养策略） */
  allergyEventDays: 90,
  /** 大便性状窗口与最低填写率（低于此值任何"没有便血/腹泻"都不得当阴性结论，§4.6.2） */
  stoolWindowDays: 14,
  coverageMin: 0.5,
  /** 生长分位连续下降多少档算"下降趋势"（flag #7） */
  growthDropLevels: 1,
  /** 补充剂依从性窗口 */
  adherenceDays: 30,
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

// ── 枚举中文名（唯一出处：后端 DTO / 小程序 constants，勿凭印象改）─────────
/** 症状类型编号（minicare-server create-symptom.dto.ts：1=rash…6=other） */
const SYMPTOM_TYPE_LABEL = {
  1: '皮疹',
  2: '呕吐',
  3: '发热',
  4: '腹泻',
  5: '便秘',
  6: '其他表现',
}
/** 过敏症状 key（小程序 REACTION_FLAGS_LABELS）；兼容历史中文串 */
const REACTION_FLAG_LABEL = {
  rash: '皮疹',
  vomit: '呕吐',
  diarrhea: '腹泻',
  blood_stool: '血便',
  wheeze: '喘息',
  face_swelling: '面部肿胀',
  other: '其他',
}
/** 大便性状（小程序 POOP_TYPE_LABELS + 生产实测出现 hard） */
const POOP_TYPE_LABEL = {
  normal: '正常软便',
  loose: '稀便',
  watery: '水样便',
  constipated: '偏硬便',
  hard: '偏硬便',
}
/** 异常性状（需要点名的）：稀便 / 水样便 / 偏硬便 */
const POOP_ABNORMAL = ['loose', 'watery', 'constipated', 'hard']
const SEVERITY_LABEL = { none: '无', mild: '轻度', moderate: '中度', severe: '重度' }
const SEVERITY_RANK = { none: 0, mild: 1, moderate: 2, severe: 3 }
/**
 * 高致敏食物清单（PRD §4.3.3 的"蛋/小麦/大豆/花生/鱼虾/坚果"）。
 * 只用于回答"高致敏类引入到哪一步了"，**不用于劝阻引入**（是否引入是医生的判断）。
 */
const HIGH_RISK_GROUPS = [
  ['蛋类', ['蛋']],
  ['小麦', ['小麦', '面粉', '面条', '馒头', '面包']],
  // 注意：不能放单字「豆」—— 会把「土豆」「豆角」误归到大豆
  ['大豆', ['大豆', '黄豆', '豆腐', '豆浆', '豆奶', '豆制品']],
  ['花生', ['花生']],
  ['鱼虾', ['鱼', '虾', '鳕鱼', '三文鱼', '鲈鱼', '龙利鱼', '贝']],
  ['坚果', ['坚果', '核桃', '芝麻', '杏仁', '腰果', '榛子']],
  ['乳制品', ['酸奶', '奶酪', '芝士', '黄油']],
]

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

const round4 = (n) => Math.round(n * 10000) / 10000

/** 高致敏食物引入状态（组 D 第 6 项）：建档或实际食用过即算"已引入" */
function computeHighRisk(observations, eaten) {
  const seen = new Set([...(eaten?.eaten90 || [])])
  for (const o of observations?.suspected || []) for (const n of normalizeFoods(o.name)) seen.add(n)
  for (const o of observations?.allergic || []) for (const n of normalizeFoods(o.name)) seen.add(n)
  for (const n of observations?.safeNames || []) seen.add(n)
  return HIGH_RISK_GROUPS.map(([group, keys]) => {
    const hits = [...seen].filter((n) => keys.some((k) => n.includes(k)))
    return { group, introduced: hits.length > 0, foods: hits.slice(0, 4) }
  })
}

// ── 分组查询（各自独立降级）──────────────────────────────────────────

/** ② 排敏建档（全量，量级为几十条）—— 双源合并：food_observation × food_observation_log */
async function queryObservations(db, babyId) {
  const [rows] = await db.query(
    `SELECT food_name, status, current_day, observation_days, first_intro_at, last_intro_at,
            retry_after_date, severity, intro_count, DATE(updated_at) AS upd
     FROM food_observation WHERE baby_id = ? ORDER BY updated_at DESC`,
    [babyId],
  )
  // 逐日打卡（PRD §4.3.3「必须双源合并」）：状态机管"结论"，日志管"过程证据"
  const [logs] = await db.query(
    `SELECT l.observation_id, o.food_name, l.day_index, DATE(l.record_date) AS d,
            l.reaction_flags, l.reaction_level, l.action
       FROM food_observation_log l JOIN food_observation o ON o.id = l.observation_id
      WHERE l.baby_id = ? ORDER BY l.record_date`,
    [babyId],
  )
  const today = cstToday()
  const byStatus = (s) => rows.filter((r) => r.status === s)

  // 日志按**食材名**聚合（同名重复建档合并同一份过程证据）：
  // 打卡天数 / 最近打卡 / 最重反应等级 / 反应标签并集
  const logByFood = new Map()
  for (const l of logs) {
    const key = l.food_name
    if (!logByFood.has(key)) {
      logByFood.set(key, { days: new Set(), lastAt: null, maxLevel: null, flags: new Set(), actions: new Set() })
    }
    const e = logByFood.get(key)
    if (l.d) {
      e.days.add(l.d)
      if (!e.lastAt || l.d > e.lastAt) e.lastAt = l.d
    }
    const lv = String(l.reaction_level || '')
    if (lv && (e.maxLevel == null || (SEVERITY_RANK[lv] ?? -1) > (SEVERITY_RANK[e.maxLevel] ?? -1))) e.maxLevel = lv
    for (const f of Array.isArray(l.reaction_flags) ? l.reaction_flags : []) e.flags.add(f)
    if (l.action) e.actions.add(l.action)
  }
  const logOf = (foodName) => logByFood.get(foodName) || null

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
    const start = toDateStr(o.first_intro_at)
    const log = logOf(o.food_name)
    return {
      name: o.food_name,
      day: o.current_day,
      days,
      idle,
      stalled: idle != null && idle > days,
      // 观察窗口 [start, start + days]，用于"窗口重叠"判定（PRD 语义是交集，不是计数）
      start,
      end: start ? addDays(start, days) : null,
      loggedDays: log ? log.days.size : 0,
      lastLoggedAt: log?.lastAt || null,
    }
  })
  // PRD flag #3「多个排敏窗口重叠」= 观察期**有交集**（原实现仅在数量 >1 时触发，语义偏了）
  const overlaps = []
  for (let i = 0; i < observing.length; i++) {
    for (let j = i + 1; j < observing.length; j++) {
      const a = observing[i]
      const b = observing[j]
      if (!a.start || !b.start) continue
      if (a.start <= b.end && b.start <= a.end) overlaps.push([a.name, b.name])
    }
  }

  // 日志源独有的"过程证据"：有打卡但状态机未结案的，说明观察在推进
  const loggedNotClosed = rows.filter((r) => r.status === 'observing' && logOf(r.food_name))

  return {
    total: rows.length,
    byStatus: Object.fromEntries(OBS_STATUS.map((s) => [s, byStatus(s).length])),
    safeCount: byStatus('safe').length,
    safeKinds: safeMap.size,
    safeNames: [...safeMap.keys()],
    dupGroups,
    observing,
    stalledObserving: observing.filter((o) => o.stalled),
    overlaps,
    loggedNotClosed: loggedNotClosed.length,
    logTotal: logs.length,
    lastLogAt: logs.length ? toDateStr(logs[logs.length - 1].d) : null,
    suspected: byStatus('suspected').map((o) => ({ name: o.food_name, severity: o.severity })),
    allergic: byStatus('allergic').map((o) => ({ name: o.food_name, severity: o.severity })),
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

/**
 * ④ 真实吃过什么（维持暴露 + 高致敏引入的判据）
 * 窗口取到 allergyEventDays（90 天）——一次性拉回后本地派生 7/14/30/90 天视图，
 * 避免为每个窗口各发一条 SQL（PRD §4.8 的 SQL 预算约束）。
 */
async function queryEaten(db, babyId) {
  const [rows] = await db.query(
    `SELECT i.food_name, COUNT(*) AS times, MAX(DATE(r.record_time)) AS last_d
     FROM feeding_food_item i JOIN feeding_food_record r ON r.id = i.record_id
     WHERE r.baby_id = ? AND r.record_time >= ? GROUP BY i.food_name ORDER BY last_d DESC`,
    [babyId, addDays(cstToday(), -REF.allergyEventDays)],
  )
  const today = cstToday()
  const cut = (d) => addDays(today, -d)
  const setIn = (raws, windowDays) =>
    [...new Set(raws.filter((e) => toDateStr(e.last_d) >= cut(windowDays)).flatMap((e) => normalizeFoods(e.food_name)))]
  const items30 = rows.filter((e) => toDateStr(e.last_d) >= cut(REF.windowEatenDays))
  return {
    items: items30,
    eaten7: setIn(rows, 7),
    eaten14: setIn(rows, REF.windowVarietyDays),
    eaten30: setIn(rows, REF.windowEatenDays),
    eaten90: setIn(rows, REF.allergyEventDays),
    /** 原始名 → 上次食用日（未归一化，用于"某食材最后一次吃是哪天"这类回答） */
    lastEatenOf: (rawName) => {
      const hit = rows.filter((e) => normalizeFoods(e.food_name).some((n) => normalizeFoods(rawName).includes(n)))
      return hit.length ? toDateStr(hit[0].last_d) : null
    },
  }
}

/** ⑥ 症状与反应（组 F）：症状谱 + 过敏事件 + 活跃度 + 食材关联 */
async function querySymptoms(db, babyId) {
  const today = cstToday()
  // 表现记录（symptom_record.symptoms 是 [{type,severity}]，type 编号见后端 DTO）
  const [sym] = await db.query(
    `SELECT record_time, symptoms, spirit, mood, note FROM symptom_record
      WHERE baby_id = ? AND record_time >= ? ORDER BY record_time DESC`,
    [babyId, addDays(today, -REF.allergyEventDays)],
  )
  const symptomRecent = sym.map((r) => {
    const arr = Array.isArray(r.symptoms) ? r.symptoms : []
    const types = arr.map((s) => SYMPTOM_TYPE_LABEL[s?.type] || (s?.type != null ? `编号${s.type}` : null)).filter(Boolean)
    const sev = arr.reduce((m, s) => {
      const lv = s?.severity === 1 ? 'mild' : s?.severity === 2 ? 'moderate' : s?.severity >= 3 ? 'severe' : null
      return (SEVERITY_RANK[lv] ?? -1) > (SEVERITY_RANK[m] ?? -1) ? lv : m
    }, null)
    return {
      date: toDateStr(r.record_time),
      types: [...new Set(types)],
      severity: sev,
      note: r.note || null,
      spiritLow: r.spirit === 'low' || r.spirit === 'tired' || r.mood === 'crying',
    }
  })

  // 过敏事件（health_record.allergy_symptoms）——**这是"真实反应"的另一个入口**，
  // 只读 symptom_record 会漏掉全部由排敏流程记下的反应（生产实测：symptom 最新 08-19，
  // 而 09-20 的三文鱼泥 severe 腹泻只存在于 health_record）。
  const [ev] = await db.query(
    `SELECT h.record_time, h.food_name_snapshot, h.allergy_symptoms, h.allergy_severity,
            h.observation_id, o.status AS obs_status, o.food_name AS obs_food
       FROM health_record h LEFT JOIN food_observation o ON o.id = h.observation_id
      WHERE h.baby_id = ? AND h.allergy_symptoms IS NOT NULL AND h.record_time >= ?
      ORDER BY h.record_time DESC`,
    [babyId, addDays(today, -REF.allergyEventDays)],
  )
  const events = ev.map((r) => {
    const raws = Array.isArray(r.allergy_symptoms) ? r.allergy_symptoms : [r.allergy_symptoms]
    const symptoms = raws
      .filter(Boolean)
      .map((x) => REACTION_FLAG_LABEL[String(x)] || String(x))
    const food = r.food_name_snapshot || r.obs_food || null
    return {
      date: toDateStr(r.record_time),
      food,
      symptoms,
      severity: r.allergy_severity || null,
      linked: Boolean(r.observation_id),
      obsStatus: r.obs_status || null,
    }
  })
  const lastSymptomAt = symptomRecent[0]?.date || null
  const lastEventAt = events[0]?.date || null
  const activeDays = new Set([
    ...symptomRecent.map((s) => s.date),
    ...events.map((e) => e.date),
  ])
  return {
    symptomTotal: sym.length,
    symptomRecent,
    lastSymptomAt,
    symptomStaleDays: lastSymptomAt ? Math.max(0, dayDiff(lastSymptomAt, today) ?? 0) : null,
    eventTotal: events.length,
    events,
    lastEventAt,
    eventStaleDays: lastEventAt ? Math.max(0, dayDiff(lastEventAt, today) ?? 0) : null,
    activeDays: activeDays.size,
    activeDays14: [...activeDays].filter((d) => d >= addDays(today, -14)).length,
    eventFoods: [...new Set(events.map((e) => e.food).filter(Boolean))],
    unlinkedEvents: events.filter((e) => !e.linked).length,
    worstSeverity: events.reduce((m, e) => ((SEVERITY_RANK[e.severity] ?? -1) > (SEVERITY_RANK[m] ?? -1) ? e.severity : m), null),
    /** 最近一次"严重"事件（转奶停滞期的关键判据，flag #5） */
    lastSevereEvent: events.find((e) => e.severity === 'severe') || null,
  }
}

/** 组 F 第 3 项：大便性状（含填写率 —— 阴性结论的必要前提） */
async function queryStool(db, babyId) {
  const today = cstToday()
  const [rows] = await db.query(
    `SELECT DATE(record_time) AS d, poop_type, stool_colors FROM diaper_record
      WHERE baby_id = ? AND record_time >= ? ORDER BY record_time DESC`,
    [babyId, addDays(today, -REF.stoolWindowDays)],
  )
  const byType = {}
  let filled = 0
  const abnormalDays = new Set()
  for (const r of rows) {
    const t = r.poop_type || null
    if (t) {
      filled += 1
      byType[t] = (byType[t] || 0) + 1
      if (POOP_ABNORMAL.includes(t)) abnormalDays.add(toDateStr(r.d))
    } else {
      byType['未填写'] = (byType['未填写'] || 0) + 1
    }
  }
  const rate = rows.length ? filled / rows.length : 0
  const abnormalList = [...abnormalDays].sort().reverse()
  return {
    windowDays: REF.stoolWindowDays,
    total: rows.length,
    filled,
    fillRate: round4(rate),
    // 覆盖率不足时**不得**下"没有腹泻/便血"这类阴性结论（PRD §4.6.2 硬约束）
    coverageOk: rows.length > 0 && rate >= REF.coverageMin,
    byType,
    abnormalDays: abnormalList.length,
    lastAbnormalAt: abnormalList[0] || null,
    lastAt: rows.length ? toDateStr(rows[0].d) : null,
  }
}

/** 组 I 第 2 项：覆盖率（阴性结论的开关） */
async function queryCoverage(db, babyId, { variety, stool }) {
  const [[growth]] = await db.query(
    `SELECT COUNT(*) AS total, COUNT(head_mm) AS head FROM growth_record WHERE baby_id = ?`,
    [babyId],
  )
  const gTotal = Number(growth?.total || 0)
  const gHead = Number(growth?.head || 0)
  return {
    poopType: { filled: stool?.filled ?? 0, total: stool?.total ?? 0, rate: stool?.fillRate ?? 0 },
    growthHead: { filled: gHead, total: gTotal, rate: gTotal ? round4(gHead / gTotal) : 0 },
    foodIntake: {
      filled: variety?.recordedDays ?? 0,
      total: REF.windowVarietyDays,
      rate: round4((variety?.recordedDays ?? 0) / REF.windowVarietyDays),
    },
  }
}


// ── ⑥ 合理性判定（纯内存派生，零额外 SQL）────────────────────────────
/** 分位档 → 序数（用于趋势与"降档"判定；与渲染层共用，避免两处各算一套） */
const P_RANK = { '低于P3': -1, 'P3-P15': 0, 'P15-P50': 1, 'P50-P85': 2, 'P85-P97': 3, '高于P97': 4 }

/**
 * 生长趋势（PRD §4.3.4 组 E 的 `growth.trend` / `stagnationFlag`）。
 * 比单点分位更有临床意义：体重分位连续下滑比"当前 P50"更值得提示。
 */
export function growthTrend(growth) {
  const l = growth?.latest
  const p = growth?.previous
  if (!l || !p) return null
  const out = {}
  for (const [key, label] of [['weightP', 'weight'], ['heightP', 'height']]) {
    const a = P_RANK[p[key]]
    const b = P_RANK[l[key]]
    if (a == null || b == null) continue
    out[label] = {
      from: p[key],
      to: l[key],
      delta: b - a,
      dir: b > a ? 'rising' : b < a ? 'falling' : 'stable',
      fromAt: p.measuredAt,
      toAt: l.measuredAt,
    }
  }
  return Object.keys(out).length ? out : null
}

/** flag 强度（PRD §4.5 原文：「强」可打断话题，「拦截型」不主动说） */
const FLAG_STRENGTH_RANK = { strong: 0, medium: 1, weak: 2, intercept: 3 }

/**
 * flag key 与 TECH-013 §7.6 的命名对齐；PRD §4.5 的 8 条按原文编号落进 key
 * （见 docs/agent/tech/SIGNALS 与 GAP 文档的对照表）。
 */
export function buildFlags({ stage, allergy, variety, maintain, trust, symptoms, stool, growth, highRisk }, ref) {
  const flags = []
  const push = (key, label, strength, detail) => flags.push({ key, label, strength, detail })

  // ── 强项（不受频控，可直接打断）──────────────────────────────────
  // #1 过敏食材仍在食用：安全底线。已判疑似/确认过敏的食材出现在近 14 天实际食用里。
  const marked = [
    ...(allergy.suspected || []).map((o) => o.name),
    ...(allergy.allergic || []).map((o) => o.name),
  ]
  const markedSet = new Map()
  for (const n of marked) for (const norm of normalizeFoods(n)) markedSet.set(norm, n)
  const stillEating = [...markedSet.entries()]
    .filter(([norm]) => (maintain.eaten14 || []).includes(norm))
    .map(([, raw]) => raw)
  if (stillEating.length) {
    push(
      'eating_marked',
      '过敏食材仍在食用',
      'strong',
      `${stillEating.join('、')} 已标记为疑似/确认过敏，但近 ${ref.windowVarietyDays} 天仍有食用记录`,
    )
  }

  // #5 转奶停滞期出现过敏反应（PRD 标「强」）
  const hasRecentEvent = (symptoms?.eventTotal || 0) > 0
  if (stage && stage.status === 'stalled' && hasRecentEvent) {
    push(
      'stage_stalled_symptomatic',
      '转奶停滞期有过敏反应',
      'strong',
      `配方构成已停滞 ${stage.stableDays} 天，同期有 ${symptoms.eventTotal} 次反应记录（最近 ${symptoms.lastEventAt}）`,
    )
  }
  // 同一前提被违反的另一种形态：判定给"可推进"但近期有反应 ——
  // 这是 2026-09-22 生产核对暴露的洞（判定说具备条件，宝宝当天在腹泻）。
  if (stage && stage.status !== 'stalled' && stage.stableDays >= ref.stageStableDays && hasRecentEvent) {
    push(
      'stage_ready_but_symptomatic',
      '转奶前提被违反',
      'strong',
      `本阶已 ${stage.stableDays} 天达参考，但近 ${ref.allergyEventDays} 天有 ${symptoms.eventTotal} 次反应记录（最近 ${symptoms.lastEventAt}${symptoms.worstSeverity ? `，最重${SEVERITY_LABEL[symptoms.worstSeverity] || symptoms.worstSeverity}` : ''}）`,
    )
  }

  // ── 中 / 弱项（受频控）────────────────────────────────────────────
  // #3 多个排敏窗口重叠（拦截型：不主动说，仅在家长要加新食物时阻断）
  if (allergy.overlaps?.length) {
    push(
      'observing_overlap',
      '排敏观察窗口重叠',
      'intercept',
      allergy.overlaps.map(([a, b]) => `${a} 与 ${b} 的观察期有交集`).join('；'),
    )
  }
  // #2 排敏任务停滞
  if (allergy.stalledObserving.length) {
    push(
      'observe_stalled',
      '排敏任务停滞',
      'medium',
      allergy.stalledObserving.map((o) => `${o.name} 停 ${o.idle} 天（观察期仅 ${o.days} 天）`).join('；'),
    )
  }
  // #4 转奶停滞（此前只算进 status，没有升级成 flag）
  if (stage && stage.status === 'stalled') {
    push(
      'stage_stalled',
      '转奶停滞（混合配比未推进）',
      'medium',
      `混合配比维持${stage.stableAtLeast ? '至少' : ''} ${stage.stableDays} 天未变`,
    )
  }
  // #6 配方阶梯上移（PRD：仅写入画像，不主动提醒 → 强度 weak，会被频控压住）
  if (stage && stage.direction === 'escalated') {
    push('ladder_escalated', '配方阶梯上移', 'weak', `近 30 天主导配方向高阶梯调整过（当前 ${stage.label}）`)
  }
  // #7 生长分位下降
  const gt = growthTrend(growth)
  const falling = gt ? Object.entries(gt).filter(([, v]) => v.delta <= -ref.growthDropLevels) : []
  if (falling.length) {
    push(
      'growth_falling',
      '生长分位下降',
      'medium',
      falling
        .map(
          ([k, v]) =>
            `${k === 'weight' ? '体重' : '身长'}分位由 ${v.from} 降至 ${v.to}（${v.fromAt} → ${v.toAt}，跨 ${dayDiff(v.fromAt, v.toAt)} 天）`,
        )
        .join('；'),
    )
  }
  // #8 关键数据陈旧（PRD 要求症状 + 生长）
  const staleBits = []
  if (trust.symptomStaleDays != null && trust.symptomStaleDays > ref.symptomUsableDays) {
    staleBits.push(`症状 ${trust.symptomStaleDays} 天无记录`)
  }
  if (growth?.staleDays != null && growth.staleDays > STALE_GROWTH_DAYS) {
    staleBits.push(`生长测量 ${growth.staleDays} 天未更新`)
  }
  if (staleBits.length) {
    push('data_stale', '关键数据陈旧', 'medium', `${staleBits.join('、')}，相关阴性结论不可下`)
  }
  // 已耐受未维持
  if (maintain.idleSafe.length) {
    push(
      'safe_not_maintained',
      '已耐受未维持',
      'medium',
      `${maintain.idleSafe.length} 种已判耐受但近 ${ref.windowVarietyDays} 天未再食用`,
    )
  }
  // 转奶可推进（提示型，非风险）
  if (stage && stage.level > 1 && stage.stableDays >= ref.stageStableDays) {
    push(
      'transition_ready',
      '转奶可推进',
      'weak',
      `本阶已 ${stage.stableDays} 天 ≥ 参考 ${ref.stageStableDays} 天` + (hasRecentEvent ? '（但有近期反应，见上）' : '（需无症状前提）'),
    )
  }
  // 日常种类不足
  if (variety.recordedDays && variety.hitDays < variety.recordedDays * 0.5) {
    push(
      'variety_insufficient',
      '日常种类不足',
      'medium',
      `近 ${ref.windowVarietyDays} 天仅 ${variety.hitDays}/${variety.recordedDays} 天达到 ${ref.dailyKinds} 种（排敏期单一种属正常，需排除）`,
    )
  }
  // 高致敏类全部未引入（信息型，只提示"还没试过"，不催引入）
  const notIntroduced = (highRisk || []).filter((g) => !g.introduced).map((g) => g.group)
  if (notIntroduced.length && allergy.safeCount > 0) {
    push('high_risk_none', '高致敏类尚未引入', 'weak', `尚未见引入记录：${notIntroduced.join('、')}`)
  }
  return flags
}

/** 生长陈旧阈值（与 profile.STALE_DAYS.growth 同尺度：45 天） */
const STALE_GROWTH_DAYS = 45

// ── flag 频控（PRD §4.5「频控规则」）──────────────────────────────────
/**
 * 单轮最多 1 条非强项；同一 flag 7 天内不重复；强度「强」不受限制。
 * 状态是**进程内**的：CloudRun 缩容到 0 会重置 —— 跨进程去重需 migration 022 落库，
 * 当前折中方案已足够（防止同一会话里反复念同一条，这是 PRD 的真实意图）。
 */
const flagGate = new Map() // babyId -> Map(flagKey -> lastShownTs)
export const FLAG_COOLDOWN_MS = 7 * 24 * 3600 * 1000

/** 供测试与线上排障用：清空频控状态 */
export function resetFlagGate(babyId) {
  if (babyId) flagGate.delete(babyId)
  else flagGate.clear()
}

/**
 * 从全量 flag 中挑出"本轮该说"的。
 * @returns {{shown: object[], suppressed: object[]}}
 */
export function pickFlagsForTurn(flags, babyId, opts = {}) {
  const now = opts.now || Date.now()
  const enabled = opts.enabled != null ? opts.enabled : process.env.FLAG_THROTTLE !== 'off'
  const all = flags || []
  if (!enabled || !babyId) return { shown: all, suppressed: [] }

  const gate = flagGate.get(babyId) || new Map()
  const shown = []
  const suppressed = []
  const candidates = []
  for (const f of all) {
    if (f.strength === 'strong') {
      shown.push(f) // 强项直接给，不受第 2、3 条限制
      continue
    }
    if (f.strength === 'intercept') {
      // 拦截型（#3 窗口重叠）不主动说，仅在家长要加新食物时由对话拦截
      suppressed.push({ ...f, reason: 'intercept_only' })
      continue
    }
    const last = gate.get(f.key)
    if (last != null && now - last < FLAG_COOLDOWN_MS) {
      suppressed.push({ ...f, reason: 'cooldown' })
      continue
    }
    candidates.push(f)
  }
  // 非强项里只取 1 条：先看强度，再看 PRD 原文顺序（buildFlags 的 push 顺序即优先级）
  candidates.sort((a, b) => (FLAG_STRENGTH_RANK[a.strength] ?? 9) - (FLAG_STRENGTH_RANK[b.strength] ?? 9))
  if (candidates.length) {
    const top = candidates[0]
    shown.push(top)
    for (const f of candidates.slice(1)) suppressed.push({ ...f, reason: 'single_per_turn' })
  }
  for (const f of shown) if (f.strength !== 'strong') gate.set(f.key, now)
  flagGate.set(babyId, gate)
  return { shown, suppressed }
}


// ── ⑧ 判定优先级链（PRD §4.4，顺序即优先级）──────────────────────────
/**
 * 顺序错了会把不该推进的宝宝推进去。五级链：
 *   护栏 > 数据不足 > 分型 > 活跃计划 > 空档
 * 说明：本版只实现服务端**能靠数据判定**的部分。「活跃计划」需 `milk_transition_plan`
 * 等计划表（尚未建），「分型」需 migration 022 的字段 —— 两者都按信息缺失标注，
 * 不做硬锁定（缺数据时假装锁定等于把已知的缺失包装成结论）。
 */
export function deriveRoute({ stage, allergy, symptoms, stool, trust, medicalDegraded = false }) {
  const guardHits = []
  const notes = []

  // ── Q1 护栏：能靠"已记录的事实"判定的高危信号 ──
  const recentEvents = (symptoms?.events || []).filter((e) => (symptoms.eventStaleDays ?? 99) <= 7)
  const bloodStool = (symptoms?.events || []).filter((e) => e.symptoms.includes('血便') && (symptoms.eventStaleDays ?? 99) <= 30)
  if (bloodStool.length) {
    guardHits.push({ key: 'blood_stool_recorded', detail: `记录中出现过血便（最近 ${bloodStool[0].date}）` })
  }
  const severeRecent = recentEvents.filter((e) => e.severity === 'severe')
  if (severeRecent.length) {
    guardHits.push({
      key: 'severe_reaction_recent',
      detail: `近 7 天有重度反应记录（${severeRecent[0].date}${severeRecent[0].food ? ` · ${severeRecent[0].food}` : ''}）`,
    })
  }
  if ((stool?.byType?.watery || 0) >= 2 && stool.lastAbnormalAt && dayDiff(stool.lastAbnormalAt, cstToday()) <= 3) {
    const hasVomitOrFever = (symptoms?.symptomRecent || []).some(
      (s) => dayDiff(s.date, cstToday()) <= 3 && (s.types.includes('呕吐') || s.types.includes('发热')),
    )
    if (hasVomitOrFever) {
      guardHits.push({ key: 'watery_stool_with_systemic', detail: '近 3 天水样便同时伴呕吐/发热记录' })
    }
  }
  const lowSpirit = (symptoms?.symptomRecent || []).find(
    (s) => dayDiff(s.date, cstToday()) <= 3 && s.spiritLow,
  )
  if (lowSpirit && (symptoms?.worstSeverity === 'severe' || guardHits.length)) {
    guardHits.push({ key: 'spirit_low', detail: `${lowSpirit.date} 记录到精神/情绪明显变差` })
  }

  // ── Q2 关键信号组是否可用 ──
  const missing = []
  if (!stage) missing.push('配方记录')
  if (!allergy || allergy.total === 0) missing.push('排敏建档')
  if (!symptoms || (symptoms.symptomTotal === 0 && symptoms.eventTotal === 0)) missing.push('症状记录')
  const degraded = []
  if (trust?.symptomStaleDays != null && trust.symptomStaleDays > REF.symptomUsableDays) degraded.push('症状数据陈旧')
  if (stool && stool.total > 0 && !stool.coverageOk) degraded.push('大便性状填写率不足')
  if (medicalDegraded) degraded.push('医疗类型化字段不可读（migration 020 未应用）')

  // ── Q3 机制分型（字段未采集 → 只能标注，不能假装分型已知）──
  const mechanismKnown = false // baby_profile 尚无 allergy_mechanism 字段（migration 022）

  // ── Q4/Q5 活跃状态 ──
  const hasObserving = (allergy?.observing?.length || 0) > 0
  const stableNoSymptom =
    stage && stage.status === 'stable' && stage.stableDays >= REF.stageStableDays && (symptoms?.activeDays14 || 0) === 0

  let route
  if (guardHits.length) route = 'guard_hit'
  else if (missing.length >= 2 || degraded.length) route = 'data_insufficient'
  else if (hasObserving) route = 'observing'
  else if (stableNoSymptom) route = 'stable_avoidance'
  else route = 'both_idle'

  return {
    route,
    guardHits,
    missing,
    degraded,
    mechanismKnown,
    note: notes,
    // 该判定只描述"当前处于哪条路径"，不产生计划（计划类能力属后续期次）
  }
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

    const [allergy, variety, eaten, symptoms, stool] = await Promise.all([
      safe('allergy', () => queryObservations(db, babyId)),
      safe('variety', () => queryVariety(db, babyId)),
      safe('eaten', () => queryEaten(db, babyId)),
      safe('symptoms', () => querySymptoms(db, babyId)),
      safe('stool', () => queryStool(db, babyId)),
    ])

    const varietyInfo = variety || { days: [], recordedDays: 0, hitDays: 0, avgKinds: 0, categories: [] }
    const stoolInfo = stool || {
      windowDays: REF.stoolWindowDays,
      total: 0,
      filled: 0,
      fillRate: 0,
      coverageOk: false,
      byType: {},
      abnormalDays: 0,
      lastAbnormalAt: null,
      lastAt: null,
    }
    const symptomsInfo = symptoms || {
      symptomTotal: 0,
      symptomRecent: [],
      lastSymptomAt: null,
      symptomStaleDays: null,
      eventTotal: 0,
      events: [],
      lastEventAt: null,
      eventStaleDays: null,
      activeDays: 0,
      activeDays14: 0,
      eventFoods: [],
      unlinkedEvents: 0,
      worstSeverity: null,
      lastSevereEvent: null,
    }

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
            direction: f.direction,
            lactose: f.lactose || null,
            aaStoppedDays: f.aaStoppedDays ?? null,
            staleDays: f.staleDays ?? 0,
            lastRecordAt: toDateStr(f.lastRecordAt) || null,
            verdict,
          }
        })()
      : null

    // ④ 维持暴露：需 ② 的已耐受清单与 ③/④ 的实测食用清单交叉
    const eatenInfo = eaten || { items: [], eaten7: [], eaten14: [], eaten30: [], eaten90: [] }
    const safeNames = allergy?.safeNames || []
    const eaten14Set = new Set(eatenInfo.eaten14)
    const maintain = {
      eaten14: eatenInfo.eaten14,
      eaten30: eatenInfo.eaten30,
      eaten90: eatenInfo.eaten90,
      idleSafe: safeNames.filter((n) => !eaten14Set.has(n)),
    }

    // ⑤ 数据可信度：复用 profile.freshness（含覆盖率 —— 阴性结论的开关）
    const symptomStaleDays = p.freshness?.symptom?.staleDays ?? null
    const coverage = await safe('coverage', () => queryCoverage(db, babyId, { variety: varietyInfo, stool: stoolInfo }))
    const trust = {
      sources: p.freshness || {},
      symptomStaleDays,
      symptomUsable: !(symptomStaleDays != null && symptomStaleDays > R.symptomUsableDays),
      // 症状"有没有效"要看两个入口：symptom_record 与 health_record.allergy_symptoms
      eventStaleDays: symptomsInfo.eventStaleDays,
      coverage: coverage || {},
    }

    const allergyInfo = allergy || {
      total: 0,
      byStatus: Object.fromEntries(OBS_STATUS.map((s) => [s, 0])),
      safeCount: 0,
      safeKinds: 0,
      safeNames: [],
      dupGroups: [],
      observing: [],
      stalledObserving: [],
      overlaps: [],
      loggedNotClosed: 0,
      logTotal: 0,
      lastLogAt: null,
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
      symptoms: symptomsInfo,
      stool: stoolInfo,
      coverage: coverage || {},
      highRisk: computeHighRisk(allergyInfo, eatenInfo),
      growth: p.growth || null,
      flags: [],
      route: null,
    }
    perception.flags = buildFlags(perception, R)
    perception.route = deriveRoute({
      stage,
      allergy: allergyInfo,
      symptoms: symptomsInfo,
      stool: stoolInfo,
      trust,
      medicalDegraded: !!p.medical?.degradedPartial,
    })
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
 * 体积刻意压紧：这一段每轮都进 prompt，长一点就是每轮的成本。
 * @param {object} perception
 * @param {object} [opts] 传了就启用 flag 频控（单轮 ≤1 条非强项 / 同 flag 7 天去重），
 *                        并返回 { block, flags }；不传则返回字符串且全量输出 flag（干跑/核对用）。
 */
export function renderPerceptionBlock(perception, opts = null) {
  if (!perception) return opts ? { block: '', flags: [] } : ''
  const { stage, allergy, variety, maintain, trust, flags, ref, symptoms, stool, coverage, highRisk, route } =
    perception
  const s = symptoms || { eventTotal: 0, events: [], symptomTotal: 0, symptomRecent: [], activeDays14: 0, unlinkedEvents: 0 }
  const st2 = stool || { total: 0, windowDays: ref.stoolWindowDays, byType: {}, fillRate: 0, coverageOk: false }

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
          .map(
            (o) =>
              `${o.name} 第 ${o.day}/${o.days} 天（${o.idle} 天未推进${o.loggedDays ? `，已打卡 ${o.loggedDays} 天` : '，无逐日打卡'}）`,
          )
          .join('；')}。`,
      )
    } else {
      // 无观察任务也要显式说"无"：整段消失会让模型以为"没问过"而重新追问家长
      lines.push('观察中：当前无进行中的排敏观察任务。')
    }
    if (allergy.suspected.length) {
      lines.push(
        `疑似：${allergy.suspected.map((o) => `${o.name}${o.severity ? `(${SEVERITY_LABEL[o.severity] || o.severity})` : ''}`).join('、')}。`,
      )
    }
    if (allergy.allergic.length) {
      lines.push(
        `已确认过敏：${allergy.allergic.map((o) => `${o.name}${o.severity ? `(${SEVERITY_LABEL[o.severity] || o.severity})` : ''}`).join('、')}。`,
      )
    }
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

  // ⑥ 症状与反应（组 F）——真实反应有两个入口（symptom_record / health_record），必须都看
  const evBits = []
  if (s.eventTotal) {
    evBits.push(`近 ${ref.allergyEventDays} 天有 ${s.eventTotal} 次反应记录（最近 ${s.lastEventAt}）`)
    const named = s.events
      .slice(0, 3)
      .map(
        (e) =>
          `${e.date}${e.food ? ` ${e.food}` : ''}${e.symptoms?.length ? ` · ${e.symptoms.join('/')}` : ''}${e.severity ? ` · ${SEVERITY_LABEL[e.severity] || e.severity}` : ''}`,
      )
    if (named.length) evBits.push(named.join('；'))
    if (s.unlinkedEvents) evBits.push(`${s.unlinkedEvents} 次未关联具体食材`)
  } else {
    evBits.push(`近 ${ref.allergyEventDays} 天无反应记录`)
  }
  if (s.symptomTotal) {
    const types = [...new Set((s.symptomRecent || []).flatMap((x) => x.types || []))]
    evBits.push(`表现记录 ${s.symptomTotal} 条（最近 ${s.lastSymptomAt}${types.length ? `，类型 ${types.join('/')}` : ''}）`)
  } else {
    evBits.push('无表现记录')
  }
  evBits.push(`近 14 天有反应的天数 ${s.activeDays14 || 0}`)
  lines.push(`近期反应：${evBits.join('；')}。`)

  // ⑥-b 大便性状（带填写率 —— 阴性结论的必要前提）
  if (st2.total) {
    const dist2 = Object.entries(st2.byType || {})
      .map(([k, n]) => `${POOP_TYPE_LABEL[k] || k} ${n}`)
      .join(' / ')
    const covNote = st2.coverageOk
      ? ''
      : `，填写率不足 ${Math.round(ref.coverageMin * 100)}%，不得据此下"没有腹泻/便血"这类结论`
    lines.push(
      `大便：近 ${st2.windowDays} 天 ${st2.total} 条（${dist2}），性状填写率 ${Math.round(st2.fillRate * 100)}%${st2.lastAbnormalAt ? `，最近异常 ${st2.lastAbnormalAt}` : ''}${covNote}。`,
    )
  } else {
    lines.push(`大便：近 ${st2.windowDays} 天无尿布记录（信息缺失，不等于"没有异常"）。`)
  }

  // ④-b 高致敏引入状态（组 D 第 6 项；只描述引入状态，不建议是否引入）
  if (highRisk?.length && allergy.safeCount) {
    const intro = highRisk.filter((g) => g.introduced).map((g) => `${g.group}(${g.foods.join('/')})`)
    const not = highRisk.filter((g) => !g.introduced).map((g) => g.group)
    lines.push(
      `高致敏引入：已引入 ${intro.length ? intro.join('、') : '无'}；未见引入记录 ${not.length ? not.join('、') : '无'}（是否引入由医生决定）。`,
    )
  }

  // ⑤ 数据可信度（元信号）
  const trustBits = Object.entries(FRESH_LABEL).map(([k, label]) => {
    const info = trust.sources?.[k]
    if (!info?.lastAt) return `${label}无记录`
    return info.staleDays === 0 ? `${label}今天` : `${label}${info.staleDays}天前`
  })
  lines.push(`数据可信度：${trustBits.join(' / ')}。`)
  if (coverage && Object.keys(coverage).length) {
    const covBits = [
      `大便性状 ${Math.round((coverage.poopType?.rate || 0) * 100)}%`,
      `头围 ${Math.round((coverage.growthHead?.rate || 0) * 100)}%`,
      `辅食记录 ${coverage.foodIntake?.filled || 0}/${coverage.foodIntake?.total || ref.windowVarietyDays} 天`,
    ]
    lines.push(`覆盖率：${covBits.join(' / ')}（低于 ${Math.round(ref.coverageMin * 100)}% 的维度不得下阴性结论）。`)
  }
  if (!trust.symptomUsable) {
    lines.push(
      `症状结论不可用：${trust.symptomStaleDays} 天无表现记录，只能表述"这段时间没有相关记录"，不得推断"没有过敏反应"。`,
    )
  }

  // ⑧ 判定路径（§4.4 五级链的服务端结论）
  if (route) {
    const ROUTE_TEXT = {
      guard_hit: '护栏命中 —— 涉及医疗判断时须先引导就医，并停止推进转奶/加新食物',
      data_insufficient: '数据不足 —— 关键信号缺失或陈旧，不给推进结论',
      observing: '排敏观察中',
      stable_avoidance: '稳定期（单一配方稳定、近期无反应）',
      both_idle: '无活跃观察任务',
    }
    const bits = [ROUTE_TEXT[route.route] || route.route]
    if (route.guardHits?.length) bits.push(...route.guardHits.map((g) => g.detail))
    if (route.degraded?.length) bits.push(`降级：${route.degraded.join('、')}`)
    if (!route.mechanismKnown) bits.push('过敏分型未采集（涉及分型的判断需向医生确认）')
    lines.push(`判定路径：${bits.join('；')}。`)
  }

  // ⑦ 合理性判定（PRD §4.5 频控：单轮最多 1 条非强项、同 flag 7 天去重、强项豁免）
  const picked = opts ? pickFlagsForTurn(flags, perception.babyId, opts) : { shown: flags }
  const shownFlags = picked.shown
  if (shownFlags.length) {
    lines.push(`需要注意：${shownFlags.map((f) => `${f.label}（${f.detail}）`).join('；')}。`)
  }

  // 行为约束：这一段决定现状块是否真的改变回答，而不是变成一段"资料"
  lines.push(
    [
      '【现状使用要求】',
      '- 以上是"现在到哪了、走得合不合理"的结论，直接当前提用；只在与家长问题相关时自然带出，不要逐条复述给家长，也不要暴露统计口径（条数/窗口/均值/覆盖率）。',
      '- 标注"信息缺失/无记录/陈旧/未更新/覆盖率不足"的项不得当阴性结论（症状久无记录 ≠ 无症状；辅食无记录 ≠ 种类不足；大便填得少 ≠ 没有腹泻）；被家长问到时如实说这段没有记录。',
      '- 这些不是计划：不要据此给出"应该转奶了/应该加辅食了"的目标、倒计时或待办清单；只描述现状，建议在家长具体问到该怎么走时再给。',
      '- 涉及医疗判断（转阶、复引入、停配方）时附"仅供参考，不能替代专业医疗建议"；判定路径为"护栏命中"时先引导就医，不做安抚性淡化。',
    ].join('\n'),
  )

  const block = lines.join('\n')
  return opts ? { block, flags: shownFlags } : block
}
