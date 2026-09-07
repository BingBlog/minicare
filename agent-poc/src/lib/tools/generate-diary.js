/**
 * generate_diary 工具（M5 日记素材聚合）
 *
 * 聚合宝宝某一天的记录概览、当天图片素材，供模型生成每日日记。
 * 生活事件 MVP 简化：模型从会话上下文（FlexDB transcript）总结，不单独建事件表。
 */
import { z } from 'zod'
import { queryMetricOnDate, queryFeedingSummaryOnDate, METRICS, METRIC_LABELS } from '../query.js'
import { getDb } from '../db.js'

export const GENERATE_DIARY_TOOL = {
  name: 'generate_diary',
  description:
    '聚合宝宝某一天的记录概览、当天图片素材与宝宝档案（名字/月龄），用于生成每日日记。用户要求"写日记/写今天的日记/记录今天"时调用，先聚合素材再动笔。',
  parameters: z.object({
    date: z.string().describe('YYYY-MM-DD，默认今天'),
  }),
}

/** 指定日期的记录概览（按 date 精确取当天，非 NOW 窗口） */
async function dayRecords(babyId, date) {
  const out = []
  for (const metric of METRICS) {
    const res = await queryMetricOnDate(babyId, metric, date)
    if (res.hasData) {
      const isFeeding = metric === 'feeding'
      const item = {
        metric,
        label: METRIC_LABELS[metric],
        count: res.count,
        // 2026-09-07 修复：喂养明细不再截断（此前 slice(0,5) 把当天较早的配方奶行丢掉，
        // 模型按可见明细心算总量出错，460 vs 880 事故根因）；当日记录量级小，全量给出。
        // 其余维度保持前 5 行概览即可。
        rows: res.rows.slice(0, isFeeding ? 20 : 5),
      }
      // 喂养附当日 SQL 汇总（权威合计，写日记直接引用，勿对明细心算加总）
      if (isFeeding) {
        const summary = await queryFeedingSummaryOnDate(babyId, date)
        if (summary) item.summary = summary
      }
      out.push(item)
    }
  }
  return out
}

/** 当天图片：从带 photo_ids 的记录表收集（MVP：medical/symptom；JSON 列解析） */
async function dayPhotos(babyId, date) {
  const db = getDb()
  if (!db) return []
  const sources = [
    { table: 'medical_record', timeCol: 'visit_date' },
    { table: 'symptom_record', timeCol: 'record_time' },
  ]
  const photos = []
  for (const src of sources) {
    try {
      const [rows] = await db.query(
        `SELECT photo_ids FROM ${src.table} WHERE baby_id=? AND ${src.timeCol} BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY) AND photo_ids IS NOT NULL LIMIT 10`,
        [babyId, `${date} 00:00:00`, `${date} 00:00:00`],
      )
      for (const r of rows) {
        let ids = []
        try {
          ids = JSON.parse(r.photo_ids)
        } catch {
          /* 忽略坏 JSON */
        }
        for (const fid of Array.isArray(ids) ? ids : []) {
          if (typeof fid === 'string' && fid) photos.push({ fileId: fid, source: 'record' })
        }
      }
    } catch (e) {
      console.error(`[diary] 查 ${src.table} 图片失败:`, e.message)
    }
  }
  return photos
}

/** 宝宝档案：名字 + 出生日期 → 月龄（日记标题/称呼用，按日记日期计算） */
async function babyInfo(babyId, date) {
  const db = getDb()
  if (!db) return null
  try {
    const [rows] = await db.query(
      'SELECT name, birth_date FROM baby_profile WHERE id=? AND deleted_at IS NULL LIMIT 1',
      [babyId],
    )
    if (!rows?.length) return null
    const { name, birth_date: birthDate } = rows[0]
    if (!birthDate) return { name, ageMonths: null }
    const b = new Date(birthDate + 'T00:00:00')
    const at = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00') : new Date()
    let months = (at.getFullYear() - b.getFullYear()) * 12 + (at.getMonth() - b.getMonth())
    if (at.getDate() < b.getDate()) months -= 1
    return { name, birthDate, ageMonths: Math.max(0, months) }
  } catch (e) {
    console.error('[diary] 查 baby_profile 失败:', e.message)
    return null
  }
}

export async function executeGenerateDiary(input, ctx) {
  const babyId = ctx?.babyId
  if (!babyId) return JSON.stringify({ ok: false, error: '缺少 babyId 上下文' })
  const date = input?.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : new Date().toISOString().slice(0, 10)
  try {
    const [records, photos, info] = await Promise.all([
      dayRecords(babyId, date),
      dayPhotos(babyId, date),
      babyInfo(babyId, date),
    ])
    return JSON.stringify({
      ok: true,
      date,
      baby: info, // { name, birthDate, ageMonths } 或 null（写日记时用宝宝名字与月龄）
      records,
      photos,
      chatEvents: [], // MVP：模型从会话上下文总结生活事件，可靠性靠 prompt 约束
      note: '生活事件请只写用户明确提到的事实，不要编造；写日记时可结合当天记录和用户提到的趣事；若当天有提到活动但无照片，可在末尾提醒补充照片。feeding 记录的 summary 是当日权威合计（配方奶 formula_ml 毫升/母乳 breast_min 分钟/各类型次数），写奶量时直接引用 summary.formula_ml，不要对 rows 明细自行加总（明细里的辅食 food_name 是逐食材拆行，会干扰数数）。',
    })
  } catch (e) {
    console.error('[diary] ERROR:', e?.stack || e)
    return JSON.stringify({ ok: false, error: (e?.message || String(e)).slice(0, 300) })
  }
}
