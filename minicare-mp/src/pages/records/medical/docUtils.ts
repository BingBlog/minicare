/**
 * 单据档案展示工具（PRD-017 / TECH-035 §5.2）
 *
 * - View 归一：解析结果（协议层）与存档档案（服务器行）→ 统一 DocView
 * - 合并规则（PRD §3.4）：同 docType 聚合为一张卡片；数组字段（诊断/药品/指标）拼接去重；
 *   标量字段取首个非空；排序 病历→处方→检验→影像→其他
 * - DocumentParseSheet（识别确认层）与 DocumentArchiveCard（详情档案卡）共用本模块
 */
import type { ParsedDocResult, MedicalDocumentInput } from '@/api/medical'
import { DOC_TYPE_ORDER, DOC_FIELD_LABELS } from '@/lib/constants'

/** 统一展示模型 */
export interface DocView {
  fileId: string
  docType: string
  status: 'success' | 'failed'
  confidence?: 'high' | 'low'
  lowConfidenceFields: string[]
  data: Record<string, any>
  errorNote?: string
}

export interface MedRow {
  name: string
  dose?: string
  frequency?: string
  spec?: string
  quantity?: string
  route?: string
  note?: string
}

export interface LabRow {
  name: string
  abbr?: string
  value: string
  unit?: string
  refRange?: string
  flag?: string
}

export interface DocGroup {
  docType: string
  fileIds: string[]
  /** 页数（同类型合并的图数） */
  pageCount: number
  confidence: 'high' | 'low'
  lowConfidenceFields: string[]
  /** 标量字段（键见 SCALAR_KEYS；取首个非空） */
  scalar: Record<string, string>
  diagnosis: string[]
  medications: MedRow[]
  labItems: LabRow[]
  /** 长文本（主诉/现病史/医嘱等；各取首个非空） */
  longTexts: { key: string; label: string; text: string }[]
}

/** 标量字段与展示顺序（label 取 DOC_FIELD_LABELS 单一文案源） */
const SCALAR_KEYS = [
  'hospital', 'visitDate', 'visitTime', 'doctor', 'department',
  'sampleType', 'reportedAt', 'examName',
] as const

/** 长文本字段（折叠展示） */
const LONG_TEXT_KEYS = [
  'chiefComplaint', 'presentIllness', 'pastHistory', 'physicalExam', 'advice', 'findings', 'conclusion',
] as const

export function resultToView(r: ParsedDocResult): DocView {
  return {
    fileId: r.fileId,
    docType: r.ok ? (r.docType ?? 'other') : 'other',
    status: r.ok ? 'success' : 'failed',
    confidence: r.confidence,
    lowConfidenceFields: r.lowConfidenceFields ?? [],
    data: r.data ?? {},
    errorNote: r.error?.message,
  }
}

export function documentToView(d: MedicalDocumentInput): DocView {
  const pj = (d.parsed_json ?? {}) as Record<string, any>
  return {
    fileId: d.file_id,
    docType: d.doc_type,
    status: d.status,
    confidence: d.confidence,
    lowConfidenceFields: Array.isArray(pj.lowConfidenceFields) ? pj.lowConfidenceFields : [],
    data: (pj.data ?? {}) as Record<string, any>,
    errorNote: d.error_note ?? undefined,
  }
}

/** 成功视图 → 按类型分组的合并卡片（失败视图不参与，调用方单独处理） */
export function mergeDocViews(views: DocView[]): DocGroup[] {
  const byType = new Map<string, DocView[]>()
  for (const v of views) {
    if (v.status !== 'success') continue
    const t = v.docType && DOC_TYPE_ORDER.includes(v.docType) ? v.docType : 'other'
    if (!byType.has(t)) byType.set(t, [])
    byType.get(t)!.push(v)
  }
  return [...byType.entries()]
    .sort((a, b) => DOC_TYPE_ORDER.indexOf(a[0]) - DOC_TYPE_ORDER.indexOf(b[0]))
    .map(([docType, list]) => {
      const low = new Set<string>()
      let confidence: 'high' | 'low' = 'high'
      for (const v of list) {
        if (v.confidence === 'low') confidence = 'low'
        v.lowConfidenceFields.forEach((f) => low.add(f))
      }

      const scalar: Record<string, string> = {}
      for (const k of SCALAR_KEYS) {
        const hit = list.find((v) => {
          const val = v.data[k]
          return val != null && String(val).trim() !== ''
        })
        if (hit) scalar[k] = String(hit.data[k])
      }

      const diagnosis: string[] = []
      for (const v of list) {
        const arr = Array.isArray(v.data.diagnosis) ? v.data.diagnosis : []
        for (const d of arr) {
          const s = String(d).trim()
          if (s && !diagnosis.includes(s)) diagnosis.push(s)
        }
      }

      const medications: MedRow[] = []
      for (const v of list) {
        const arr = Array.isArray(v.data.medications) ? v.data.medications : []
        for (const m of arr) {
          if (!m?.name) continue
          const key = `${m.name}|${m.spec ?? ''}`
          if (medications.some((x) => `${x.name}|${x.spec ?? ''}` === key)) continue
          medications.push({
            name: m.name,
            dose: m.dose,
            frequency: m.frequency,
            spec: m.spec,
            quantity: m.quantity,
            route: m.route,
            note: m.note,
          })
        }
      }

      const labItems: LabRow[] = []
      for (const v of list) {
        const arr = Array.isArray(v.data.items) ? v.data.items : []
        for (const it of arr) {
          if (!it?.name) continue
          if (labItems.some((x) => x.name === it.name && x.value === String(it.value ?? ''))) continue
          labItems.push({
            name: it.name,
            abbr: it.abbr,
            value: String(it.value ?? ''),
            unit: it.unit,
            refRange: it.refRange,
            flag: it.flag,
          })
        }
      }

      const longTexts = LONG_TEXT_KEYS.flatMap((key) => {
        const hit = list.find((v) => typeof v.data[key] === 'string' && v.data[key].trim() !== '')
        return hit ? [{ key, label: DOC_FIELD_LABELS[key] ?? key, text: String(hit.data[key]) }] : []
      })

      return {
        docType,
        fileIds: list.map((v) => v.fileId),
        pageCount: list.length,
        confidence,
        lowConfidenceFields: [...low],
        scalar,
        diagnosis,
        medications,
        labItems,
        longTexts,
      }
    })
}

/** 化验异常判定：flag 高/低 或值域比较标记 */
export function labIsAbnormal(row: LabRow): boolean {
  return row.flag === 'high' || row.flag === 'low'
}

/** 药品单行摘要（名称 + 用量/频次拼合） */
export function formatMedSummary(m: MedRow): string {
  const parts = [m.dose, m.frequency].filter((x) => x && String(x).trim() !== '')
  return parts.join(' · ')
}
