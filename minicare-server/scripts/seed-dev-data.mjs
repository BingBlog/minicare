/**
 * dev 测试数据 seed（minicare_dev 库）
 *
 * 用途：给指定宝宝生成最近 N 天（默认 7 天）的真实感记录，用于联调/UI 自动化/周报月报测试。
 *
 * 用法：
 *   node scripts/seed-dev-data.mjs [babyId] [days]
 *   默认 babyId = 旺仔（8535bda2-...），days = 7
 *
 * 注意：
 *   - 幂等：先按 baby_id + 时间范围删除旧 seed 数据再插入（只删 7 天内本脚本造的数据），可重复执行
 *   - 只写业务表；record_timeline 由 016 迁移全量回填重建（执行完本脚本后运行：
 *     node scripts/seed-dev-data.mjs --backfill）
 *   - 测试账号 recorded_by 取 13146989718（b42b4c6f-...），不存在时用家庭成员任一 user_id
 */
import mysql from 'mysql2/promise'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const DB_BABY_ID = process.argv[2] || '8535bda2-7cdf-45c3-ba37-34a580822e5f' // 旺仔
const DAYS = Number(process.argv[3] || 7)
const BACKFILL = process.argv.includes('--backfill')

const env = {}
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}

const pool = await mysql.createPool({
  host: env.DB_HOST,
  port: Number(env.DB_PORT || 3306),
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASS,
  timezone: '+08:00',
  dateStrings: true,
  multipleStatements: true,
})

/** 今天（本地）与最近 DAYS 天的日期 */
function dayStrs() {
  const out = []
  const now = new Date()
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    )
  }
  return out
}

function dt(date, hhmm) {
  return `${date} ${hhmm}`
}

function durMin(start, end) {
  const [hs, ms] = start.split(':').map(Number)
  const [he, me] = end.split(':').map(Number)
  let diff = (he * 60 + me) - (hs * 60 + ms)
  if (diff <= 0) diff += 24 * 60 // 跨午夜：end 是次日凌晨（如 20:30 → 次日 06:30 = 600 分钟）
  return diff
}

/** end 时刻是否跨午夜（end <= start，即 end 属于次日） */
function crossesMidnight(start, end) {
  const [hs, ms] = start.split(':').map(Number)
  const [he, me] = end.split(':').map(Number)
  return (he * 60 + me) <= (hs * 60 + ms)
}

/** 日期字符串 +1 天（YYYY-MM-DD） */
function nextDayStr(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── 主流程 ──────────────────────────────────────────────────────
const [babyRows] = await pool.query('SELECT id, name, family_id FROM baby_profile WHERE id = ?', [DB_BABY_ID])
if (babyRows.length === 0) {
  console.error(`宝宝不存在: ${DB_BABY_ID}`)
  process.exit(1)
}
const baby = babyRows[0]

// recorded_by：优先测试账号 13146989718（b42b4c6f-...），不存在时用家庭成员任一 user_id
const [testUserRows] = await pool.query(
  `SELECT u.id FROM family_member m JOIN user_account u ON u.id = m.user_id
   WHERE m.family_id = ? AND m.status = 'active' AND u.phone = '13146989718' LIMIT 1`,
  [baby.family_id],
)
const [userRows] = await pool.query(
  `SELECT u.id FROM family_member m JOIN user_account u ON u.id = m.user_id
   WHERE m.family_id = ? AND m.status = 'active' ORDER BY m.role DESC LIMIT 1`,
  [baby.family_id],
)
const recorderId = testUserRows[0]?.id ?? userRows[0]?.id
if (!recorderId) {
  console.error('家庭无 active 成员，无法确定 recorded_by')
  process.exit(1)
}

// 清理窗口：DAY-1 天前 00:00 到明天
const startDate = dayStrs()[0]
const endDate = new Date()
endDate.setDate(endDate.getDate() + 1)
const endStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`
const windowSql = `(record_time >= '${startDate} 00:00:00' AND record_time < '${endStr} 00:00:00')`

console.log(`[seed] 宝宝=${baby.name}(${baby.id}) recorded_by=${recorderId} 窗口=${startDate} ~ ${endStr} ${BACKFILL ? '(仅回填)' : ''}`)

if (!BACKFILL) {
  // 1. 清理窗口内旧数据（业务表 + 子表 + timeline 对应行）
  const tables = [
    'feeding_formula_record', 'feeding_breast_record', 'feeding_food_record',
    'feeding_supplement_record', 'sleep_record', 'diaper_record',
    'health_record', 'symptom_record', 'activity_record', 'growth_record',
  ]
  const timeCol = (t) => (t === 'sleep_record' ? 'start_time' : t === 'growth_record' ? 'record_date' : 'record_time')
  for (const t of tables) {
    const col = timeCol(t)
    const [rows] = await pool.query(`SELECT id FROM ${t} WHERE baby_id = ? AND ${col} >= ? AND ${col} < ?`, [DB_BABY_ID, startDate, endStr])
    if (rows.length) {
      const ids = rows.map((r) => r.id)
      if (t === 'feeding_formula_record') {
        await pool.query(`DELETE FROM feeding_formula_mix WHERE record_id IN (${ids.map(() => '?').join(',')})`, ids)
      }
      if (t === 'feeding_food_record') {
        await pool.query(`DELETE FROM feeding_food_item WHERE record_id IN (${ids.map(() => '?').join(',')})`, ids)
      }
      await pool.query(`DELETE FROM record_timeline WHERE source_type = ? AND source_id IN (${ids.map(() => '?').join(',')})`, [t === 'feeding_formula_record' ? 'feeding' : t === 'feeding_breast_record' ? 'feeding' : t, ...ids])
      await pool.query(`DELETE FROM ${t} WHERE id IN (${ids.map(() => '?').join(',')})`, ids)
    }
  }
  console.log(`[seed] 已清理窗口内旧数据`)

  // 2. 造数据（每天）
  const days = dayStrs()
  const mk = () => randomUUID()
  let count = 0
  const insert = async (sql, params) => {
    await pool.query(sql, params)
    count++
  }

  for (let di = 0; di < days.length; di++) {
    const date = days[di]
    // 第几天（0=最早 6=今天），用于制造差异
    const idx = di
    const isWeekendLike = di === 5 // 8/22 周六

    // ── 配方奶：4 次（早中晚 + 睡前），偶尔加 1 次母乳 ──
    const feeds = [
      ['07:05', 150], ['11:20', 150], ['15:30', 160], ['19:40', 150],
    ]
    if (di === 4) feeds.push(['21:00', 90]) // 8/21 加餐
    for (const [t, ml] of feeds) {
      const rid = mk()
      await insert(
        `INSERT INTO feeding_formula_record (id, baby_id, recorded_by, record_time, duration_min, formula_ml, note) VALUES (?,?,?,?,?,?,?)`,
        [rid, DB_BABY_ID, recorderId, dt(date, t), Math.min(25, 10 + Math.round(ml / 15)), ml, di === 2 ? '转奶观察期，奶量稳定' : null],
      )
      // 配比：深度水解无乳糖 3 勺 + 适度水解 1 勺（轻度 CMPA 家庭常见方案）
      await insert(
        `INSERT INTO feeding_formula_mix (id, record_id, milk_type, scoops) VALUES (?,?,?,?),(?,?,?,?)`,
        [mk(), rid, 'eh_no_lactose', 3, mk(), rid, 'ph', 1],
      )
    }
    if (di % 3 === 0) {
      // 早晨母乳 1 次
      await insert(
        `INSERT INTO feeding_breast_record (id, baby_id, recorded_by, record_time, breast_side, duration_min) VALUES (?,?,?,?,?,?)`,
        [mk(), DB_BABY_ID, recorderId, dt(date, '06:20'), 'both', 18],
      )
    }

    // ── 辅食：2 次（8/18 起，逐日换样）──
    const foods = [
      { t: '10:10', items: [['高铁米粉', 30, '3 勺'], ['南瓜泥', 40]] },
      { t: '17:30', items: [['苹果泥', 50], ['西兰花泥', 30]] },
    ]
    if (di >= 1) {
      for (const f of foods) {
        const rid = mk()
        await insert(
          `INSERT INTO feeding_food_record (id, baby_id, recorded_by, record_time, note) VALUES (?,?,?,?,?)`,
          [rid, DB_BABY_ID, recorderId, dt(date, f.t), di === 5 ? '周末辅食吃得不错' : null],
        )
        for (const [name, amount, note] of f.items) {
          await insert(
            `INSERT INTO feeding_food_item (id, record_id, food_name, amount_g, amount_note) VALUES (?,?,?,?,?)`,
            [mk(), rid, name, amount, note || null],
          )
        }
      }
    }

    // ── 营养素：每天维生素 D ──
    await insert(
      `INSERT INTO feeding_supplement_record (id, baby_id, recorded_by, record_time, supplement_items, note) VALUES (?,?,?,?,?,?)`,
      [mk(), DB_BABY_ID, recorderId, dt(date, '09:00'),
        JSON.stringify([{ key: 'vitamin_d', label: '维生素D', dose: '400IU' }]), null],
    )

    // ── 睡眠：夜觉 + 上午觉 + 下午觉（8/21 夜觉差）──
    const sleeps = [
      { start: '20:30', end: '06:30', period: 'night', quality: di === 4 ? 'poor' : 'good' },
      { start: '09:30', end: '10:30', period: 'morning_nap', quality: 'normal' },
      { start: '14:00', end: '15:30', period: 'afternoon_nap', quality: di === 4 ? 'normal' : 'good' },
    ]
    if (di === 4) sleeps[0] = { start: '21:10', end: '05:40', period: 'night', quality: 'poor' }
    for (const s of sleeps) {
      // 跨午夜（夜间觉）：end_time 落次日日期，duration_min 按跨天计算（修复负值 bug）
      const endDate = crossesMidnight(s.start, s.end) ? nextDayStr(date) : date
      await insert(
        `INSERT INTO sleep_record (id, baby_id, recorded_by, start_time, end_time, duration_min, status, quality, sleep_period, note) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [mk(), DB_BABY_ID, recorderId, dt(date, s.start), dt(endDate, s.end), durMin(s.start, s.end), 'ended', s.quality, s.period,
          di === 4 ? '夜里醒了两次，有点闹' : null],
      )
    }

    // ── 尿布：5 次（1 次大便；8/20 大便偏稀）──
    const diapers = [
      { t: '07:40', type: 'wet', note: null },
      { t: '10:00', type: 'dirty', poop: di === 3 ? 'watery' : 'normal', note: di === 3 ? '便便偏稀，继续观察' : null },
      { t: '12:30', type: 'wet' },
      { t: '16:00', type: 'wet' },
      { t: '20:00', type: 'wet' },
    ]
    if (di === 5) diapers.push({ t: '21:30', type: 'mixed', poop: 'loose' })
    for (const d of diapers) {
      await insert(
        `INSERT INTO diaper_record (id, baby_id, recorded_by, record_time, diaper_type, poop_type, butt_condition, diaper_count, note) VALUES (?,?,?,?,?,?,?,?,?)`,
        [mk(), DB_BABY_ID, recorderId, dt(date, d.t), d.type, d.poop ?? null, 'normal', 1, d.note ?? null],
      )
    }

    // ── 活动：户外 + 俯趴/玩耍 ──
    await insert(
      `INSERT INTO activity_record (id, baby_id, recorded_by, record_time, activity_type, duration_min, intensity, note) VALUES (?,?,?,?,?,?,?,?)`,
      [mk(), DB_BABY_ID, recorderId, dt(date, '16:30'), 'outdoor', 60, 'moderate', isWeekendLike ? '带旺仔去公园走了走' : null],
    )
    await insert(
      `INSERT INTO activity_record (id, baby_id, recorded_by, record_time, activity_type, duration_min, intensity, note) VALUES (?,?,?,?,?,?,?,?)`,
      [mk(), DB_BABY_ID, recorderId, dt(date, '18:00'), 'tummy_time', 10, 'low', null],
    )

    // ── 健康/表现：8/19 轻微皮疹（过敏表现）+ 日常精神记录 ──
    if (di === 2) {
      await insert(
        `INSERT INTO health_record (id, baby_id, recorded_by, record_time, temperature, allergy_symptoms, allergy_severity, medications, skin_care, note) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [mk(), DB_BABY_ID, recorderId, dt(date, '14:20'), 36.9,
          JSON.stringify(['轻微皮疹']), 'mild', null, JSON.stringify(['已做保湿']),
          '辅食后嘴角起了一点红疹，半小时消退，继续观察'],
      )
      await insert(
        `INSERT INTO symptom_record (id, baby_id, recorded_by, record_time, symptoms, mood, spirit, note) VALUES (?,?,?,?,?,?,?,?)`,
        [mk(), DB_BABY_ID, recorderId, dt(date, '14:25'), JSON.stringify(['皮疹']), 'calm', 'normal', '皮疹不痒，精神好'],
      )
    } else {
      await insert(
        `INSERT INTO symptom_record (id, baby_id, recorded_by, record_time, symptoms, mood, spirit, note) VALUES (?,?,?,?,?,?,?,?)`,
        [mk(), DB_BABY_ID, recorderId, dt(date, '08:30'), JSON.stringify([]), 'happy', 'active', null],
      )
    }
    if (di % 2 === 1) {
      await insert(
        `INSERT INTO health_record (id, baby_id, recorded_by, record_time, temperature, note) VALUES (?,?,?,?,?,?)`,
        [mk(), DB_BABY_ID, recorderId, dt(date, '18:00'), 36.7, null],
      )
    }

    // ── 生长：8/18 与 8/23 各一次 ──
    if (di === 1 || di === days.length - 1) {
      const w = di === 1 ? 8300 : 8450
      const h = di === 1 ? 700 : 705
      await insert(
        `INSERT INTO growth_record (id, baby_id, recorded_by, record_date, record_time, weight_g, height_mm, head_mm, note) VALUES (?,?,?,?,?,?,?,?,?)`,
        [mk(), DB_BABY_ID, recorderId, date, '09:15', w, h, di === 1 ? 440 : 445, null],
      )
    }
  }
  console.log(`[seed] 完成：共写入 ${count} 行记录（${days.length} 天）`)
}

// 3. timeline 回填（复用 016 迁移的幂等 INSERT ... ON DUPLICATE KEY UPDATE 段）
const backfillSql = readFileSync(new URL('../migrations/016_timeline_backfill.sql', import.meta.url), 'utf8')
// 去掉文件头的注释与 USE/SET 语句，仅保留 INSERT 段（避免 USE 切换库）
const insertOnly = backfillSql
  .split('\n')
  .filter((line) => !line.trim().startsWith('--') && !/^(USE|SET)/i.test(line.trim()))
  .join('\n')
await pool.query(insertOnly)
console.log('[seed] record_timeline 回填完成（016 幂等重建）')

await pool.end()
