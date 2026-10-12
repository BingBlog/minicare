/**
 * mergeMedicationBatches — 多药批次聚合（F14 增强，迁移 025）
 *
 * 一次服药 = 一批（batch_id），批内每药一条 medication_record。
 * 时间线 / 记录列表把同 batch_id 的多条记录聚合为「一条服药事件」展示：
 * 聚合到「首条出现的位置」（锚点），并改写锚点字段：
 *   - merged_items：[{ medication_name, dose }]，展示层消费（多药名 tags / 剂量摘要）
 *   - medication_name：'西替利嗪、蒙脱石散'（join 兜底，防未覆盖展示死角）
 *   - dose：'5ml · 1袋'
 *
 * 幂等：已合并锚点（带 merged_items）再次输入不会重复追加；
 * 增量：分页拼接后（旧锚点 merged_items + 新页散条）再次合并可继续吸收。
 * 无 batch_id 的历史单药记录 / 非用药记录 / 单条批次原样保留。
 */

export interface BatchItem {
  medication_name: string
  dose?: string
}

export interface BatchMergeableRecord {
  id?: string
  type?: string
  batch_id?: string | null
  medication_name?: string | null
  dose?: string | null
  detail?: Record<string, unknown> | null
  merged_items?: BatchItem[] | null
}

/** 批 id 兼容两种来源：列表记录（展平后顶层）/ 今日聚合（detail 内） */
function pickBatchId(rec: BatchMergeableRecord): string {
  const fromTop = rec.batch_id ?? null
  const fromDetail = ((rec.detail?.batch_id as string | undefined) ?? null)
  return (fromTop || fromDetail || '') as string
}

/** 单条记录 → 展示行（顶层优先，兼容 detail 内） */
function itemOf(rec: BatchMergeableRecord): BatchItem {
  const name =
    (rec.medication_name as string | undefined) ??
    ((rec.detail?.medication_name as string | undefined) ?? '')
  const dose =
    (rec.dose as string | undefined) ??
    ((rec.detail?.dose as string | undefined) ?? undefined)
  return { medication_name: name, dose: dose || undefined }
}

export function mergeMedicationBatches<T extends BatchMergeableRecord>(records: T[]): T[] {
  // 1. 归组（按出现顺序，首条为锚点）
  const groups = new Map<string, { anchor: T; items: BatchItem[] }>()
  for (const rec of records) {
    if (rec.type !== 'medication') continue
    const bid = pickBatchId(rec)
    if (!bid) continue
    const carry =
      Array.isArray(rec.merged_items) && rec.merged_items.length > 0
        ? rec.merged_items
        : [itemOf(rec)]
    const existing = groups.get(bid)
    if (!existing) {
      groups.set(bid, { anchor: rec, items: [...carry] })
    } else {
      existing.items.push(...carry)
    }
  }

  // 2. 输出：锚点写出合并态，同批其余成员并入锚点后跳过
  const out: T[] = []
  for (const rec of records) {
    if (rec.type === 'medication') {
      const bid = pickBatchId(rec)
      if (bid) {
        const g = groups.get(bid)
        if (g && g.anchor !== rec) continue
        if (g && g.items.length > 1) {
          const names = g.items.map((i) => i.medication_name).filter(Boolean)
          const doseJoined = g.items.map((i) => i.dose).filter(Boolean).join(' · ')
          const merged = {
            ...rec,
            merged_items: g.items,
            medication_name: names.join('、') || null,
            dose: doseJoined || null,
          } as T & { summary?: Record<string, unknown> }
          if (rec.detail) {
            ;(merged as BatchMergeableRecord).detail = { ...rec.detail, merged_items: g.items }
          }
          // 记录列表（feed）消费后端物化 summary（RecordListItem 后端 summary 优先）→
          // 同步重写为聚合态，否则会展示「单条药名 + 单条剂量」
          const sum = (rec as { summary?: Record<string, unknown> }).summary
          if (sum) {
            merged.summary = {
              ...sum,
              tags: names,
              value: doseJoined || undefined,
              unit: undefined,
            }
          }
          out.push(merged)
          continue
        }
      }
    }
    out.push(rec)
  }
  return out
}
