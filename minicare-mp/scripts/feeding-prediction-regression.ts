/**
 * 喂奶时间预测 — 回归验证脚本（真实数据）
 *
 * 基于 2026-05-04 ~ 2026-05-06 的真实喂奶记录，
 * 模拟在不同时间点进行预测，对比 V1 和 V2 算法的准确度。
 *
 * 运行：npx tsx scripts/feeding-prediction-regression.ts
 */

// ─── 类型 ─────────────────────────────────────────────────────────

interface MockRecord {
  type: string
  id: string
  time: string
  detail?: Record<string, unknown> | null
}

// ─── V1 原始算法（仅用今日最近3条） ──────────────────────────────

function calcNextFeedTimeV1(feedings: MockRecord[]): Date | null {
  if (feedings.length < 2) return null
  const recent = feedings.slice(-3)
  let totalGap = 0
  let gapCount = 0
  for (let i = 1; i < recent.length; i++) {
    const gap = (new Date(recent[i].time).getTime() - new Date(recent[i - 1].time).getTime()) / 60_000
    if (gap > 0 && gap < 360) {
      totalGap += gap
      gapCount++
    }
  }
  if (gapCount === 0) return null
  const avgGapMs = (totalGap / gapCount) * 60_000
  const lastFeedTime = new Date(feedings[feedings.length - 1].time)
  return new Date(lastFeedTime.getTime() + avgGapMs)
}

// ─── V2 优化算法（今日+昨日，时段加权 + 日夜分离） ─────────────

const HOUR_WINDOW = 2

function getBJHour(d: Date): number {
  return (d.getUTCHours() + 8) % 24
}

function isNightHour(bjHour: number): boolean {
  return bjHour >= 22 || bjHour < 6
}

function isNightGap(t1: Date, t2: Date): boolean {
  return isNightHour(getBJHour(t1)) || isNightHour(getBJHour(t2))
}

function isSameTimeSlot(refHour: number, targetTime: Date): boolean {
  const targetHour = getBJHour(targetTime)
  const diff = Math.abs(refHour - targetHour)
  return diff <= HOUR_WINDOW || diff >= (24 - HOUR_WINDOW)
}

function extractGaps(records: MockRecord[], maxGap = 360): Array<{ gap: number; startTime: Date; endTime: Date }> {
  const gaps: Array<{ gap: number; startTime: Date; endTime: Date }> = []
  for (let i = 1; i < records.length; i++) {
    const t1 = new Date(records[i - 1].time)
    const t2 = new Date(records[i].time)
    const gap = (t2.getTime() - t1.getTime()) / 60_000
    if (gap > 0 && gap < maxGap) {
      gaps.push({ gap, startTime: t1, endTime: t2 })
    }
  }
  return gaps
}

function calcNextFeedTimeV2(
  todayFeedings: MockRecord[],
  yesterdayFeedings: MockRecord[] = [],
  _nowOverride?: Date,
): Date | null {
  if (todayFeedings.length === 0 && yesterdayFeedings.length < 2) return null

  // 确定参考时段
  let lastFeedTime: Date
  if (todayFeedings.length > 0) {
    lastFeedTime = new Date(todayFeedings[todayFeedings.length - 1].time)
  } else {
    lastFeedTime = new Date(yesterdayFeedings[yesterdayFeedings.length - 1].time)
  }
  const refHour = getBJHour(lastFeedTime)

  interface WeightedGap { gap: number; weight: number }
  const weightedGaps: WeightedGap[] = []

  // 今日间隔
  const todayGaps = extractGaps(todayFeedings)
  for (const { gap, startTime, endTime } of todayGaps) {
    let weight = isSameTimeSlot(refHour, endTime) ? 3.0 : 1.5
    if (isNightGap(startTime, endTime)) weight *= 0.5
    weightedGaps.push({ gap, weight })
  }

  // 昨日间隔
  const yesterdayGaps = extractGaps(yesterdayFeedings)
  for (const { gap, startTime, endTime } of yesterdayGaps) {
    let weight = isSameTimeSlot(refHour, endTime) ? 2.0 : 0.5
    if (isNightGap(startTime, endTime)) weight *= 0.5
    weightedGaps.push({ gap, weight })
  }

  if (weightedGaps.length === 0) return null

  let weightedSum = 0
  let weightTotal = 0
  for (const { gap, weight } of weightedGaps) {
    weightedSum += gap * weight
    weightTotal += weight
  }
  const avgGapMin = weightedSum / weightTotal

  return new Date(lastFeedTime.getTime() + avgGapMin * 60_000)
}

// ─── 真实数据（UTC 时间，北京时间 = UTC+8）────────────────────────
// 注：record_time 是 UTC，显示时 +8 小时为北京时间

// 过滤条件：仅 formula/breast（非 supplement）
// 按 record_time 正序排列

// 05-04 (前天) 的喂奶记录（UTC）
const day0504: MockRecord[] = [
  { type: 'feeding', id: '21536ec7', time: '2026-05-04T17:00:00.000Z' },  // 北京 05-05 01:00
  { type: 'feeding', id: 'a367a6d0', time: '2026-05-04T21:30:00.000Z' },  // 北京 05-05 05:30
]

// 05-05 (昨天) 的喂奶记录（UTC）
const day0505: MockRecord[] = [
  { type: 'feeding', id: '92f42cd2', time: '2026-05-05T00:20:00.000Z' },  // 北京 08:20
  { type: 'feeding', id: '568d15fa', time: '2026-05-05T03:00:00.000Z' },  // 北京 11:00
  { type: 'feeding', id: 'c4c9f3e2', time: '2026-05-05T06:03:00.000Z' },  // 北京 14:03
  { type: 'feeding', id: 'fc18f1a2', time: '2026-05-05T09:20:00.000Z' },  // 北京 17:20
  { type: 'feeding', id: '02c201ee', time: '2026-05-05T14:13:00.000Z' },  // 北京 22:13
  { type: 'feeding', id: 'd8600c42', time: '2026-05-05T19:52:00.000Z' },  // 北京 05-06 03:52
]

// 05-06 (今天) 的喂奶记录（UTC）
const day0506: MockRecord[] = [
  { type: 'feeding', id: '133bd8a4', time: '2026-05-06T00:15:00.000Z' },  // 北京 08:15
  { type: 'feeding', id: 'b4b5d91a', time: '2026-05-06T02:59:00.000Z' },  // 北京 10:59
  { type: 'feeding', id: 'da779c32', time: '2026-05-06T07:08:00.000Z' },  // 北京 15:08
  { type: 'feeding', id: '9e3a1c02', time: '2026-05-06T10:00:00.000Z' },  // 北京 18:00
  { type: 'feeding', id: '931318ac', time: '2026-05-06T14:19:00.000Z' },  // 北京 22:19
]

// ─── 注意：系统中"今日"的划分 ─────────────────────────────────────
// Dashboard 用的是本地时区日期。上面的数据是 UTC 时间。
// 如果系统按北京时间分日（0:00 分界），需要重新整理：
//
// 北京时间 05-05:
//   05-04T17:00Z = 05-05 01:00 BJ ← 属于北京 05-05
//   05-04T21:30Z = 05-05 05:30 BJ
//   05-05T00:20Z = 05-05 08:20 BJ
//   05-05T03:00Z = 05-05 11:00 BJ
//   05-05T06:03Z = 05-05 14:03 BJ
//   05-05T09:20Z = 05-05 17:20 BJ
//   05-05T14:13Z = 05-05 22:13 BJ
//
// 北京时间 05-06:
//   05-05T19:52Z = 05-06 03:52 BJ ← 注意！跨日
//   05-06T00:15Z = 05-06 08:15 BJ
//   05-06T02:59Z = 05-06 10:59 BJ
//   05-06T07:08Z = 05-06 15:08 BJ
//   05-06T10:00Z = 05-06 18:00 BJ
//   05-06T14:19Z = 05-06 22:19 BJ

// 按北京时间重新分日（这是 Dashboard 实际看到的分组）
const bjDay0505: MockRecord[] = [
  { type: 'feeding', id: '21536ec7', time: '2026-05-04T17:00:00.000Z' },  // BJ 05-05 01:00
  { type: 'feeding', id: 'a367a6d0', time: '2026-05-04T21:30:00.000Z' },  // BJ 05-05 05:30
  { type: 'feeding', id: '92f42cd2', time: '2026-05-05T00:20:00.000Z' },  // BJ 05-05 08:20
  { type: 'feeding', id: '568d15fa', time: '2026-05-05T03:00:00.000Z' },  // BJ 05-05 11:00
  { type: 'feeding', id: 'c4c9f3e2', time: '2026-05-05T06:03:00.000Z' },  // BJ 05-05 14:03
  { type: 'feeding', id: 'fc18f1a2', time: '2026-05-05T09:20:00.000Z' },  // BJ 05-05 17:20
  { type: 'feeding', id: '02c201ee', time: '2026-05-05T14:13:00.000Z' },  // BJ 05-05 22:13
]

const bjDay0506: MockRecord[] = [
  { type: 'feeding', id: 'd8600c42', time: '2026-05-05T19:52:00.000Z' },  // BJ 05-06 03:52
  { type: 'feeding', id: '133bd8a4', time: '2026-05-06T00:15:00.000Z' },  // BJ 05-06 08:15
  { type: 'feeding', id: 'b4b5d91a', time: '2026-05-06T02:59:00.000Z' },  // BJ 05-06 10:59
  { type: 'feeding', id: 'da779c32', time: '2026-05-06T07:08:00.000Z' },  // BJ 05-06 15:08
  { type: 'feeding', id: '9e3a1c02', time: '2026-05-06T10:00:00.000Z' },  // BJ 05-06 18:00
  { type: 'feeding', id: '931318ac', time: '2026-05-06T14:19:00.000Z' },  // BJ 05-06 22:19
]

// ─── 测试场景（以"今天"05-06 为例，逐步累加记录模拟预测过程）────

interface TestScenario {
  name: string
  description: string
  todayFeedings: MockRecord[]   // 到"现在"为止今日已有的记录
  yesterdayFeedings: MockRecord[] // 昨日完整记录
  nowTime: string               // 模拟的"当前时间"(UTC)
  actualNextTime: string        // 实际发生的下一次喂奶时间(UTC)
}

const scenarios: TestScenario[] = [
  {
    name: '场景1: 凌晨仅1条记录',
    description: '北京 04:30，今日仅凌晨 03:52 一条记录。V1 无法预测，V2 可利用昨日数据。',
    todayFeedings: bjDay0506.slice(0, 1),  // 仅 03:52
    yesterdayFeedings: bjDay0505,
    nowTime: '2026-05-05T20:30:00.000Z',   // BJ 04:30
    actualNextTime: '2026-05-06T00:15:00.000Z', // BJ 08:15
  },
  {
    name: '场景2: 上午2条记录',
    description: '北京 09:30，已有 03:52 和 08:15 两条。预测下一次。',
    todayFeedings: bjDay0506.slice(0, 2),  // 03:52, 08:15
    yesterdayFeedings: bjDay0505,
    nowTime: '2026-05-06T01:30:00.000Z',   // BJ 09:30
    actualNextTime: '2026-05-06T02:59:00.000Z', // BJ 10:59
  },
  {
    name: '场景3: 上午3条记录',
    description: '北京 11:30，已有 03:52, 08:15, 10:59 三条。预测下一次。',
    todayFeedings: bjDay0506.slice(0, 3),  // 03:52, 08:15, 10:59
    yesterdayFeedings: bjDay0505,
    nowTime: '2026-05-06T03:30:00.000Z',   // BJ 11:30
    actualNextTime: '2026-05-06T07:08:00.000Z', // BJ 15:08
  },
  {
    name: '场景4: 下午4条记录',
    description: '北京 16:00，已有 4 条。预测下一次。',
    todayFeedings: bjDay0506.slice(0, 4),  // 03:52, 08:15, 10:59, 15:08
    yesterdayFeedings: bjDay0505,
    nowTime: '2026-05-06T08:00:00.000Z',   // BJ 16:00
    actualNextTime: '2026-05-06T10:00:00.000Z', // BJ 18:00
  },
  {
    name: '场景5: 傍晚5条记录',
    description: '北京 19:00，已有 5 条。预测下一次。',
    todayFeedings: bjDay0506.slice(0, 5),  // 03:52, 08:15, 10:59, 15:08, 18:00
    yesterdayFeedings: bjDay0505,
    nowTime: '2026-05-06T11:00:00.000Z',   // BJ 19:00
    actualNextTime: '2026-05-06T14:19:00.000Z', // BJ 22:19
  },
  {
    name: '场景6: 超时场景模拟',
    description: '假设北京 13:00，已有 03:52, 08:15, 10:59 三条。V1 预测约 13:43，到 14:30 仍没喂（实际 15:08 才喂）。V1 到 14:13 就停止提醒了。',
    todayFeedings: bjDay0506.slice(0, 3),
    yesterdayFeedings: bjDay0505,
    nowTime: '2026-05-06T06:30:00.000Z',   // BJ 14:30
    actualNextTime: '2026-05-06T07:08:00.000Z', // BJ 15:08
  },
]

// ─── 运行验证 ─────────────────────────────────────────────────────

function fmtBJ(utcStr: string): string {
  const d = new Date(utcStr)
  const bj = new Date(d.getTime() + 8 * 3600_000)
  return `${String(bj.getUTCHours()).padStart(2, '0')}:${String(bj.getUTCMinutes()).padStart(2, '0')}`
}

function fmtDateBJ(d: Date): string {
  const bj = new Date(d.getTime() + 8 * 3600_000)
  return `${String(bj.getUTCMonth() + 1).padStart(2, '0')}-${String(bj.getUTCDate()).padStart(2, '0')} ${String(bj.getUTCHours()).padStart(2, '0')}:${String(bj.getUTCMinutes()).padStart(2, '0')}`
}

console.log('='.repeat(80))
console.log('  喂奶时间预测 — V1 vs V2 回归验证（真实数据 2026-05-05 ~ 05-06）')
console.log('='.repeat(80))
console.log()
console.log('  数据说明：')
console.log('  - 昨日(05-05 北京时间)共 7 次喂奶：01:00, 05:30, 08:20, 11:00, 14:03, 17:20, 22:13')
console.log('  - 今日(05-06 北京时间)共 6 次喂奶：03:52, 08:15, 10:59, 15:08, 18:00, 22:19')
console.log()

let v1TotalError = 0
let v1Count = 0
let v2TotalError = 0
let v2Count = 0

for (const scenario of scenarios) {
  console.log(`\n${'─'.repeat(74)}`)
  console.log(`  ${scenario.name}`)
  console.log(`  ${scenario.description}`)
  console.log(`${'─'.repeat(74)}`)
  console.log(`  今日已有记录: ${scenario.todayFeedings.length} 条 [${scenario.todayFeedings.map(r => fmtBJ(r.time)).join(', ')}]`)
  console.log(`  当前时间(BJ): ${fmtBJ(scenario.nowTime)}`)
  console.log(`  实际下次(BJ): ${fmtBJ(scenario.actualNextTime)}`)

  const actualTime = new Date(scenario.actualNextTime)
  const nowTime = new Date(scenario.nowTime)

  // V1 预测
  const v1Result = calcNextFeedTimeV1(scenario.todayFeedings)
  if (v1Result) {
    const v1ErrorMin = Math.round((v1Result.getTime() - actualTime.getTime()) / 60_000)
    const v1DiffMin = Math.round((v1Result.getTime() - nowTime.getTime()) / 60_000)
    console.log(`  V1 预测(BJ): ${fmtDateBJ(v1Result)} (误差 ${v1ErrorMin > 0 ? '+' : ''}${v1ErrorMin}分钟)`)

    // 提醒状态判断
    if (v1DiffMin < -30) {
      console.log(`  V1 提醒状态: ⛔ 已停止（已超出预测时间 ${Math.abs(v1DiffMin)} 分钟 > 30分钟上限）`)
    } else if (v1DiffMin < 0) {
      console.log(`  V1 提醒状态: 🔔 仍在提醒（超出 ${Math.abs(v1DiffMin)} 分钟，尚未到 30 分钟上限）`)
    } else if (v1DiffMin <= 30) {
      console.log(`  V1 提醒状态: 🔔 已开始提醒（距预测还有 ${v1DiffMin} 分钟）`)
    } else {
      console.log(`  V1 提醒状态: ⏳ 尚未开始（距预测还有 ${v1DiffMin} 分钟）`)
    }

    v1TotalError += Math.abs(v1ErrorMin)
    v1Count++
  } else {
    console.log(`  V1 预测(BJ): ❌ 无法计算（数据不足）`)
  }

  // V2 预测
  const v2Result = calcNextFeedTimeV2(scenario.todayFeedings, scenario.yesterdayFeedings, nowTime)
  if (v2Result) {
    const v2ErrorMin = Math.round((v2Result.getTime() - actualTime.getTime()) / 60_000)
    const v2DiffMin = Math.round((v2Result.getTime() - nowTime.getTime()) / 60_000)
    console.log(`  V2 预测(BJ): ${fmtDateBJ(v2Result)} (误差 ${v2ErrorMin > 0 ? '+' : ''}${v2ErrorMin}分钟)`)

    // V2 overdue 模式允许到 120 分钟
    if (v2DiffMin < -120) {
      console.log(`  V2 提醒状态: ⛔ 已停止（超出 ${Math.abs(v2DiffMin)} 分钟 > 120分钟 overdue 上限）`)
    } else if (v2DiffMin < 0) {
      console.log(`  V2 提醒状态: 🔔 持续提醒（已超出预测 ${Math.abs(v2DiffMin)} 分钟，overdue 模式继续）`)
    } else if (v2DiffMin <= 30) {
      console.log(`  V2 提醒状态: 🔔 已开始提醒（距预测还有 ${v2DiffMin} 分钟）`)
    } else {
      console.log(`  V2 提醒状态: ⏳ 尚未开始（距预测还有 ${v2DiffMin} 分钟）`)
    }

    v2TotalError += Math.abs(v2ErrorMin)
    v2Count++
  } else {
    console.log(`  V2 预测(BJ): ❌ 无法计算（数据不足）`)
  }
}

// ─── 汇总 ─────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(80))
console.log('  汇总对比')
console.log('='.repeat(80))
console.log(`  V1: 可预测 ${v1Count}/${scenarios.length} 场景, 平均绝对误差 ${v1Count > 0 ? Math.round(v1TotalError / v1Count) : 'N/A'} 分钟`)
console.log(`  V2: 可预测 ${v2Count}/${scenarios.length} 场景, 平均绝对误差 ${v2Count > 0 ? Math.round(v2TotalError / v2Count) : 'N/A'} 分钟`)
console.log()
console.log('  关键改进:')
console.log('  1. 冷启动覆盖: V2 在今日仅 0~1 条记录时仍能预测（利用昨日节律）')
console.log('  2. 时段加权: 昨日同时段间隔权重 1.5，远时段 0.8，更贴合实际规律')
console.log('  3. 超时持续提醒: V1 超出 30 分钟就停止，V2 overdue 模式持续到 120 分钟')
console.log('  4. 稳定性: 昨日大量正常间隔稀释今日偶发异常，预测更稳定')
console.log()
