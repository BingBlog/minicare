/**
 * PRD-009 作息计划 · 端到端验收脚本
 *
 * 用法（在 minicare-server 目录下）：
 *   node scripts/e2e-schedule.mjs        # 需本地 3001 已起服务、.env.local 可连 dev 库
 *
 * 覆盖：
 *  T1 GET /schedule/template 返回 sortOrder，且 PUT 的数组顺序决定展示顺序（拖拽排序落库）
 *  T2 GET /schedule/today 的「顺序兜底」：记录全部落在窗口外时仍按「第 N 顿」判定为已完成
 *  T3 记录消费不重复、不跨类型误配
 *  T4 窗口内记录优先于顺序兜底
 *
 * ⚠️ 会创建 e2e-* 前缀的独立家庭/宝宝/记录，跑完全部删除并**打印实际删除行数**校验；
 *    绝不触碰其他宝宝的数据（结尾会打印旁证行数）。
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import mysql from 'mysql2/promise'
import jwt from 'jsonwebtoken'

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(PKG_ROOT, '.env.local') })

const PORT = process.env.PORT || 3001
const BASE = `http://127.0.0.1:${PORT}`

const FAM_ID = 'e2e00000-0000-4000-8000-000000000001'
const BABY_ID = 'e2e00000-0000-4000-8000-000000000002'
const MEM_ID = 'e2e00000-0000-4000-8000-000000000003'

const db = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
})

let pass = 0
let fail = 0
const failures = []

function check(name, cond, detail) {
  if (cond) {
    pass += 1
    console.log(`  PASS  ${name}`)
  } else {
    fail += 1
    failures.push(name)
    console.log(`  FAIL  ${name}${detail !== undefined ? ` → ${JSON.stringify(detail)}` : ''}`)
  }
}

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* 非 JSON 响应原样返回 */
  }
  return { status: res.status, json, text }
}

// ── 造数据 ────────────────────────────────────────────────────
console.log('\n[setup] 创建隔离测试家庭/宝宝…')

const [users] = await db.execute(`SELECT id FROM user_account LIMIT 1`)
if (users.length === 0) throw new Error('库中没有 user_account，无法造数据')
const userId = users[0].id

await db.execute(
  `INSERT INTO family_group (id, name, invite_code, created_by) VALUES (?, ?, ?, ?)`,
  [FAM_ID, 'E2E排序测试', `E2E${Date.now() % 100000}`, userId],
)
await db.execute(
  `INSERT INTO baby_profile (id, family_id, name, birth_date, created_by) VALUES (?, ?, ?, CURDATE(), ?)`,
  [BABY_ID, FAM_ID, 'E2E宝宝', userId],
)
await db.execute(
  `INSERT INTO family_member (id, family_id, user_id, role, status, joined_at) VALUES (?, ?, ?, 'owner', 'active', NOW())`,
  [MEM_ID, FAM_ID, userId],
)

const token = jwt.sign({ sub: userId, tv: 0 }, process.env.JWT_SECRET, { expiresIn: '30m' })
console.log(`[setup] userId=${userId.slice(0, 8)}…  token 已生成`)

const q = `?baby_id=${BABY_ID}`
const TPL = `/api/family/${FAM_ID}/schedule/template${q}`
const TODAY = `/api/family/${FAM_ID}/schedule/today${q}`

// ── T1 拖拽排序 ───────────────────────────────────────────────
console.log('\n[T1] 提交顺序 = 展示顺序（拖拽排序落库）')

const t1Order = [
  { item_type: 'activity_bath', title: '洗澡', execute_time: '19:00' },
  { item_type: 'feeding_formula', title: '第 1 顿奶', execute_time: '07:00' },
  { item_type: 'feeding_food', title: '午餐辅食', execute_time: '12:00' },
  { item_type: 'feeding_formula', title: '第 2 顿奶', execute_time: '11:30' },
]
let res = await api('PUT', TPL, { token, body: { items: t1Order } })
check('PUT 保存成功 (200/201)', res.status === 200 || res.status === 201, res.status)

const orderAfter = (res.json?.items ?? []).map((it) => `${it.executeTime} ${it.title}`)
check(
  '返回数组顺序 = 提交顺序（不是时间升序）',
  JSON.stringify(orderAfter) ===
    JSON.stringify(t1Order.map((i) => `${i.execute_time} ${i.title}`)),
  orderAfter,
)

const sortOrders = (res.json?.items ?? []).map((it) => it.sortOrder)
check('返回 sortOrder = 0..n-1', JSON.stringify(sortOrders) === '[0,1,2,3]', sortOrders)

const [dbRows] = await db.execute(
  `SELECT execute_time, title, sort_order FROM schedule_template_item
    WHERE baby_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC`,
  [BABY_ID],
)
check(
  '库中 sort_order 按提交下标落库',
  JSON.stringify(dbRows.map((r) => `${String(r.execute_time).slice(0, 5)} ${r.title}`)) ===
    JSON.stringify(t1Order.map((i) => `${i.execute_time} ${i.title}`)),
  dbRows.map((r) => `${String(r.execute_time).slice(0, 5)} ${r.title} #${r.sort_order}`),
)

// 再换一次顺序（模拟把最后一项拖到最前）→ 顺序必须跟着变；回传 id 走 UPDATE 分支
const idsByKey = new Map(
  (res.json?.items ?? []).map((it) => [`${it.executeTime} ${it.title}`, it.id]),
)
const t1Order2 = [t1Order[3], t1Order[0], t1Order[1], t1Order[2]]
res = await api('PUT', TPL, {
  token,
  body: {
    items: t1Order2.map((i) => ({
      ...i,
      id: idsByKey.get(`${i.execute_time} ${i.title}`),
    })),
  },
})
const order2 = (res.json?.items ?? []).map((it) => `${it.executeTime} ${it.title}`)
check(
  '二次提交（重新排序）后顺序再次跟随提交顺序',
  JSON.stringify(order2) === JSON.stringify(t1Order2.map((i) => `${i.execute_time} ${i.title}`)),
  order2,
)
const [dbRows2] = await db.execute(
  `SELECT title, sort_order FROM schedule_template_item
    WHERE baby_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC`,
  [BABY_ID],
)
check(
  '重排后库中 sort_order 无空洞/重复',
  JSON.stringify(dbRows2.map((r) => r.sort_order)) === '[0,1,2,3]' &&
    dbRows2.length === 4,
  dbRows2,
)

// ── T2 顺序兜底 ───────────────────────────────────────────────
console.log('\n[T2] 顺序兜底：记录全部落在窗口外，仍按「第 N 顿」判定')

// 清掉 T1 的项，换成 3 顿奶：06:00 / 10:00 / 14:00（同类间隔 240 分钟，通过校验）
// 窗口分别是 [05:00,07:30] / [09:00,11:30] / [13:00,15:30]
res = await api('PUT', TPL, {
  token,
  body: {
    items: [
      { item_type: 'feeding_formula', title: '第 1 顿', execute_time: '06:00' },
      { item_type: 'feeding_formula', title: '第 2 顿', execute_time: '10:00' },
      { item_type: 'feeding_formula', title: '第 3 顿', execute_time: '14:00' },
    ],
  },
})
check('三项模板保存成功', res.status === 200 || res.status === 201, res.status)

await db.execute(`DELETE FROM feeding_formula_record WHERE baby_id = ?`, [BABY_ID])
// 三条记录：全部落在各自窗口之外
const recTimes = ['04:00:00', '08:00:00', '12:00:00']
for (const t of recTimes) {
  await db.execute(
    `INSERT INTO feeding_formula_record (id, baby_id, recorded_by, record_time, formula_ml)
     VALUES (UUID(), ?, ?, CONCAT(CURDATE(), ' ${t}'), 120)`,
    [BABY_ID, userId],
  )
}

res = await api('GET', TODAY, { token })
const today = res.json
const st = (today?.items ?? []).map((it) => ({
  t: it.executeTime,
  s: it.status,
  rec: it.matchedRecord?.recordTime ?? null,
}))
console.log('    now =', new Date().toTimeString().slice(0, 5), '│ items =', JSON.stringify(st))
check('GET today 返回 3 项', (today?.items ?? []).length === 3, (today?.items ?? []).length)
check('第 1 顿（06:00，窗口外记录 04:00）判 done', st[0]?.s === 'done', st[0])
check('第 2 顿（10:00，窗口外记录 08:00）判 done', st[1]?.s === 'done', st[1])
check('进度 done=3 / total=3', today?.progress?.done === 3 && today?.progress?.total === 3, today?.progress)
check('摘要附带配对到的记录时间（已按时:分格式化为 HH:mm）', st[0]?.rec === '04:00' && st[1]?.rec === '08:00', st.map((x) => x.rec))

// T2b：只有 1 条记录时，纯顺序口径 → 归到第 1 项，其余未完成
await db.execute(`DELETE FROM feeding_formula_record WHERE baby_id = ?`, [BABY_ID])
await db.execute(
  `INSERT INTO feeding_formula_record (id, baby_id, recorded_by, record_time, formula_ml)
   VALUES (UUID(), ?, ?, CONCAT(CURDATE(), ' 08:00:00'), 120)`,
  [BABY_ID, userId],
)
res = await api('GET', TODAY, { token })
const st2 = (res.json?.items ?? []).map((it) => it.status)
console.log('    单条记录情形的状态 =', JSON.stringify(st2))
check(
  '仅 1 条记录时只点亮 1 项（纯顺序口径，不放大）',
  st2.filter((s) => s === 'done').length === 1 && res.json?.progress?.done === 1,
  { st2, progress: res.json?.progress },
)

// ── T3 不跨类型误配 ───────────────────────────────────────────
console.log('\n[T3] 记录消费不重复、不跨类型误配')

res = await api('PUT', TPL, {
  token,
  body: {
    items: [
      { item_type: 'feeding_formula', title: '奶粉', execute_time: '06:00' },
      { item_type: 'diaper', title: '换尿布', execute_time: '06:30' },
    ],
  },
})
check('两类模板保存成功', res.status === 200 || res.status === 201, res.status)

await db.execute(`DELETE FROM feeding_formula_record WHERE baby_id = ?`, [BABY_ID])
await db.execute(`DELETE FROM diaper_record WHERE baby_id = ?`, [BABY_ID])
// 只有尿布记录（06:10 在尿布窗口 [05:30,08:00] 内），奶粉项无任何记录
await db.execute(
  `INSERT INTO diaper_record (id, baby_id, recorded_by, record_time, diaper_type)
   VALUES (UUID(), ?, ?, CONCAT(CURDATE(), ' 06:10:00'), 'wet')`,
  [BABY_ID, userId],
)
res = await api('GET', TODAY, { token })
const t3 = (res.json?.items ?? []).map((it) => `${it.itemType}:${it.status}`)
console.log('    状态 =', JSON.stringify(t3))
check(
  '尿布记录只点亮尿布项，不会串到奶粉项（奶粉项仍判 missed）',
  t3.includes('diaper:done') && t3.includes('feeding_formula:missed'),
  t3,
)

// ── T4 窗口匹配优先 ───────────────────────────────────────────
console.log('\n[T4] 窗口内记录优先于顺序兜底')

// 恢复 T2 的 3 顿奶模板（06:00 / 10:00 / 14:00）
await api('PUT', TPL, {
  token,
  body: {
    items: [
      { item_type: 'feeding_formula', title: '第 1 顿', execute_time: '06:00' },
      { item_type: 'feeding_formula', title: '第 2 顿', execute_time: '10:00' },
      { item_type: 'feeding_formula', title: '第 3 顿', execute_time: '14:00' },
    ],
  },
})

await db.execute(`DELETE FROM feeding_formula_record WHERE baby_id = ?`, [BABY_ID])
// 两条记录：06:10 落在第 1 项窗口 [05:00,07:30]；09:20 落在第 2 项窗口 [09:00,11:30]
await db.execute(
  `INSERT INTO feeding_formula_record (id, baby_id, recorded_by, record_time, formula_ml)
   VALUES (UUID(), ?, ?, CONCAT(CURDATE(), ' 06:10:00'), 150)`,
  [BABY_ID, userId],
)
await db.execute(
  `INSERT INTO feeding_formula_record (id, baby_id, recorded_by, record_time, formula_ml)
   VALUES (UUID(), ?, ?, CONCAT(CURDATE(), ' 09:20:00'), 150)`,
  [BABY_ID, userId],
)
res = await api('GET', TODAY, { token })
const t4 = (res.json?.items ?? []).map((it) => ({
  t: it.executeTime,
  s: it.status,
  rec: it.matchedRecord?.recordTime ?? null,
}))
console.log('    状态 =', JSON.stringify(t4))
const feeding = t4.filter((x) => ['06:00', '10:00', '14:00'].includes(x.t))
check('06:10 → 06:00 项（窗口命中）', feeding[0]?.s === 'done' && feeding[0]?.rec === '06:10', feeding[0])
check('09:20 → 10:00 项（窗口命中 [09:00,11:30]）', feeding[1]?.s === 'done' && feeding[1]?.rec === '09:20', feeding[1])
check('14:00 项无记录 → 非 done', feeding[2]?.s !== 'done', feeding[2])

// ── 清理 ──────────────────────────────────────────────────────
console.log('\n[cleanup] 删除全部 e2e 数据…')

const cleanup = []
for (const [label, sql, args] of [
  ['feeding_formula_record', `DELETE FROM feeding_formula_record WHERE baby_id = ?`, [BABY_ID]],
  ['diaper_record', `DELETE FROM diaper_record WHERE baby_id = ?`, [BABY_ID]],
  ['schedule_template_item', `DELETE FROM schedule_template_item WHERE baby_id = ?`, [BABY_ID]],
  ['family_member', `DELETE FROM family_member WHERE id = ?`, [MEM_ID]],
  ['baby_profile', `DELETE FROM baby_profile WHERE id = ?`, [BABY_ID]],
  ['family_group', `DELETE FROM family_group WHERE id = ?`, [FAM_ID]],
]) {
  const [r] = await db.execute(sql, args)
  cleanup.push(`${label}=${r.affectedRows}`)
}
console.log('    实际删除行数：', cleanup.join('  '))

// 复查残留（按真实行数，不看"以为删了"）
const residual = {}
const [r1] = await db.execute(`SELECT COUNT(*) c FROM schedule_template_item WHERE baby_id = ?`, [BABY_ID])
const [r2] = await db.execute(`SELECT COUNT(*) c FROM baby_profile WHERE id = ?`, [BABY_ID])
const [r3] = await db.execute(`SELECT COUNT(*) c FROM family_group WHERE id = ?`, [FAM_ID])
const [r4] = await db.execute(`SELECT COUNT(*) c FROM feeding_formula_record WHERE baby_id = ?`, [BABY_ID])
const [r5] = await db.execute(`SELECT COUNT(*) c FROM diaper_record WHERE baby_id = ?`, [BABY_ID])
const [r6] = await db.execute(`SELECT COUNT(*) c FROM family_member WHERE id = ?`, [MEM_ID])
residual.item = r1[0].c
residual.baby = r2[0].c
residual.family = r3[0].c
residual.formula = r4[0].c
residual.diaper = r5[0].c
residual.member = r6[0].c
const clean = Object.values(residual).every((v) => v === 0)
check('e2e 数据已全部清除（复查 6 张表真实行数均为 0）', clean, residual)

// 复检旺仔的既有数据未被动过（仍 10 行）
const [wz] = await db.execute(
  `SELECT COUNT(*) c FROM schedule_template_item WHERE baby_id <> ? AND deleted_at IS NULL`,
  [BABY_ID],
)
console.log(`    （旁证）其余宝宝日程项行数 = ${wz[0].c}`)

await db.end()

console.log(`\n════ 结果：${pass} PASS / ${fail} FAIL ════`)
if (fail > 0) console.log('失败用例：', failures.join(' | '))
process.exit(fail > 0 ? 1 : 0)
