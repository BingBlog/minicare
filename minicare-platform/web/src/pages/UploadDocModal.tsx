import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '../lib/api'
import { useApp } from '../lib/app-context'
import { Modal } from '../components/Modal'
import { Notice } from '../components/ui'
import { DOC_STATUS, EVIDENCE_LABEL, META_FIELDS, REGION_LABEL } from '../lib/labels'
import {
  UPLOAD_ACCEPT,
  UPLOAD_MAX_BYTES,
  type CorpusConflict,
  type CorpusUploadResult,
} from '../lib/types'

/**
 * 上传新文档（PRD-008 US-01：登记源文件 · 自动判重 · 来源预填）
 *
 * 与「批量同步」的分工：同步是把**已经在盘上解析好**的语料补进台账；
 * 这里是真正的入口 —— 用户从浏览器把新文件交进来。
 *
 * 流程刻意做成**两步**（先「检查」再「登记」），对齐 PRD 的「核对预填结果，点登记」：
 *   ① 检查 → `dry=1`：只做格式校验 + 判重 + 来源预填，**不落盘、不登记**；
 *   ② 登记 → 正式请求：落源目录 `docs/knowledge/source/raw/{国内,国际}/` 并登记进 `kb_corpus`。
 * 两次都带文件字节（本机 localhost、上限 100MB，重传一遍比在服务端存临时文件简单得多），
 * 换来的是「登记是原子的」——中途失败不会留下半条记录。
 *
 * ⚠️ 登记**不会自动开始处理**（PRD US-01 明确要求）。登记完在文档管理列表里
 * 点「进行预检」即可继续六步。
 */
export function UploadDocModal({ onClose }: { onClose: () => void }) {
  const { toast, ensureOverview, go } = useApp()
  const [file, setFile] = useState<File | null>(null)
  const [region, setRegion] = useState('cn')
  const [preview, setPreview] = useState<CorpusUploadResult | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [action, setAction] = useState<'skip' | 'overwrite' | 'keep_both'>('overwrite')
  const [busy, setBusy] = useState<'' | 'check' | 'commit'>('')
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  /** 换文件 / 换地区后，之前那次检查的结论就作废了 */
  useEffect(() => {
    setPreview(null)
    setForm({})
  }, [file, region])

  function pick(f: File | null) {
    if (!f) {
      setFile(null)
      return
    }
    if (!new RegExp(`(${UPLOAD_ACCEPT.split(',').join('|')})$`, 'i').test(f.name)) {
      toast(
        <>
          <b>不支持的格式：{f.name}</b>
          <div style={{ marginTop: 4 }}>本平台只收 PDF 与 HTML（.pdf / .html / .htm）</div>
        </>,
        8000,
      )
      setFile(null)
      return
    }
    if (f.size > UPLOAD_MAX_BYTES) {
      toast(
        <>
          <b>文件过大：{(f.size / 1048576).toFixed(1)}MB</b>
          <div style={{ marginTop: 4 }}>单文件上限 {UPLOAD_MAX_BYTES / 1048576}MB</div>
        </>,
        8000,
      )
      setFile(null)
      return
    }
    setFile(f)
  }

  async function check() {
    if (!file) return
    setBusy('check')
    try {
      const r = await api.corpusUpload(file, { region, dry: true })
      setPreview(r)
      const next: Record<string, string> = {}
      for (const [k] of META_FIELDS) {
        const v = (r.prefill as unknown as Record<string, unknown>)[k]
        next[k] = v == null ? '' : String(v)
      }
      setForm(next)
      if (r.conflict) setAction('overwrite')
    } catch (e) {
      toast(`检查失败：${(e as Error).message}`, 9000)
    } finally {
      setBusy('')
    }
  }

  async function commit() {
    if (!file || !preview) return
    setBusy('commit')
    try {
      const r = await api.corpusUpload(file, {
        region,
        onConflict: preview.conflict ? action : undefined,
      })
      if (r.skipped) {
        toast('已跳过：既未落盘、也未登记，未产生任何新记录')
        onClose()
        return
      }
      // 预填表单里用户改过的字段，登记后再写回台账（登记本身只落预填值）
      const patch: Record<string, string> = {}
      for (const [k] of META_FIELDS) {
        const edited = form[k] ?? ''
        const orig = (r.prefill as unknown as Record<string, unknown>)[k]
        if (edited !== (orig == null ? '' : String(orig))) patch[k] = edited
      }
      let patched = false
      if (Object.keys(patch).length) {
        try {
          await api.corpusUpdate(r.doc_id, patch)
          patched = true
        } catch (e) {
          toast(`已登记，但字段写回失败：${(e as Error).message}`, 9000)
        }
      }
      if (r.replaced.length) {
        toast(
          <>
            已清理同名旧文件：{r.replaced.join('、')}
          </>,
          6000,
        )
      }
      toast(
        <>
          <b>{r.message}</b>
          {patched ? <div style={{ marginTop: 4 }}>已按你的修改更新台账字段</div> : null}
        </>,
        9000,
      )
      await ensureOverview(true).catch(() => {})
      onClose()
      go('corpus', { doc: r.doc_id, modal: null, refresh: true })
    } catch (e) {
      toast(`登记失败：${(e as Error).message}`, 9000)
    } finally {
      setBusy('')
    }
  }

  const conflict = preview?.conflict ?? null
  const missing = preview?.missing_required ?? []

  return (
    <Modal
      title="上传新文档"
      subtitle="登记源文件（US-01）· 自动判重 · 来源信息预填；登记后**不会自动处理**，在列表里点「进行预检」继续"
      onClose={onClose}
      width={880}
    >
      {/* ── ① 选文件 + 选地区 ─────────────────────────────────────── */}
      <div className="modal-section">① 选择源文件与归属地区</div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          pick(e.dataTransfer.files?.[0] ?? null)
        }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `1.5px dashed ${dragging ? 'var(--accent)' : 'var(--line-strong)'}`,
          background: dragging ? 'var(--accent-bg)' : 'var(--surface-2)',
          borderRadius: 'var(--r-sm)',
          padding: '22px 16px',
          textAlign: 'center',
          cursor: 'pointer',
          marginBottom: 12,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={UPLOAD_ACCEPT}
          style={{ display: 'none' }}
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <>
            <div style={{ fontSize: 13, color: 'var(--text)' }}>
              <b>{file.name}</b>
            </div>
            <div className="hint" style={{ marginTop: 4 }}>
              {(file.size / 1024).toFixed(0)} KB ·
              {file.name.toLowerCase().endsWith('.pdf') ? ' PDF' : ' HTML'}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>把文件拖到这里，或点击选择</div>
            <div className="hint" style={{ marginTop: 4 }}>
              仅支持 PDF / HTML（.pdf / .html / .htm），单文件 ≤ {UPLOAD_MAX_BYTES / 1048576}MB
            </div>
          </>
        )}
      </div>

      <div className="toolbar" style={{ marginBottom: 4 }}>
        <span className="hint">归属地区</span>
        {(['cn', 'intl'] as const).map((r) => (
          <label className="chk" key={r}>
            <input type="radio" checked={region === r} onChange={() => setRegion(r)} /> {REGION_LABEL[r]}
          </label>
        ))}
        <span className="sep" />
        <span className="hint">
          地区决定源文件落到 <code>source/raw/{region === 'cn' ? '国内' : '国际'}/</code>
        </span>
        <span style={{ marginLeft: 'auto' }}>
          <button
            type="button"
            className="btn"
            disabled={!file || busy !== ''}
            onClick={() => void check()}
          >
            {busy === 'check' ? '检查中…' : preview ? '重新检查' : '检查并预填'}
          </button>
        </span>
      </div>

      {/* ── ② 判重结果 ───────────────────────────────────────────── */}
      {conflict ? <ConflictPanel conflict={conflict} action={action} onAction={setAction} /> : null}

      {/* ── ③ 来源预填表单 ───────────────────────────────────────── */}
      {preview && !conflict ? (
        <Notice tone="ok">
          <b>未发现重复</b> · 内容指纹 <code>{preview.sha256}</code> · 可以登记
        </Notice>
      ) : null}

      {preview ? (
        <>
          <div className="modal-section">② 来源信息（已按「文件名规则 → 正文抽取」预填，可直接改）</div>
          {missing.length ? (
            <Notice>
              <b>必填缺失：{missing.join('、')}</b>
              <div style={{ marginTop: 4 }}>
                补不齐也能先登记、也能照常跑六步；但**缺必填项不可发布**（PRD D-08）。
              </div>
            </Notice>
          ) : null}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '76px minmax(0,1fr) 76px minmax(0,1fr)',
              gap: '8px 10px',
              alignItems: 'center',
            }}
          >
            {META_FIELDS.map(([k, label, required]) => {
              const v = form[k] ?? ''
              const src = preview.prefill.field_source?.[k]
              const miss = required && v === ''
              const filled = v !== ''
              return (
                <Field key={k} label={label} required={required} miss={miss}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {k === 'region' ? (
                      <select
                        className="inp"
                        style={{ flex: 1 }}
                        value={v || region}
                        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                      >
                        {(['cn', 'intl'] as const).map((r) => (
                          <option key={r} value={r}>
                            {REGION_LABEL[r]}
                          </option>
                        ))}
                      </select>
                    ) : k === 'evidence_level' ? (
                      <select
                        className="inp"
                        style={{ flex: 1 }}
                        value={v}
                        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                      >
                        <option value="">— 未判定 —</option>
                        {Object.entries(EVIDENCE_LABEL).map(([val, lab]) => (
                          <option key={val} value={val}>
                            {lab}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="inp"
                        style={{ flex: 1 }}
                        value={v}
                        placeholder={miss ? '必填，请补齐' : ''}
                        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                      />
                    )}
                    <span
                      className="hint"
                      title={src ? `${src.origin} · ${src.evidence}` : '无预填值'}
                      style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                    >
                      {filled ? (src ? '预填' : '手填') : '—'}
                    </span>
                  </div>
                </Field>
              )
            })}
          </div>
        </>
      ) : null}

      {/* ── ④ 动作 ───────────────────────────────────────────────── */}
      <div className="toolbar" style={{ marginTop: 16, marginBottom: 0 }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!preview || busy !== '' || (!!conflict && action === 'skip')}
          onClick={() => void commit()}
        >
          {busy === 'commit'
            ? '登记中…'
            : !preview
              ? '登记'
              : conflict
                ? CONFLICT_ACTIONS.find((a) => a.value === action)?.label
                : '登记'}
        </button>
        <button type="button" className="btn" onClick={onClose} disabled={busy !== ''}>
          取消
        </button>
        <span className="hint" style={{ marginLeft: 'auto' }}>
          登记只落源目录 + 台账；**不会**自动解析，也不写远程知识库
        </span>
      </div>
    </Modal>
  )
}

/* ── 子组件 ─────────────────────────────────────────────────────── */

function Field({
  label,
  required,
  miss,
  children,
}: {
  label: string
  required?: boolean
  miss?: boolean
  children: ReactNode
}) {
  return (
    <>
      <label style={{ fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
        {label}
        {required ? <span style={{ color: 'var(--danger)' }}>*</span> : null}
        {miss ? <span title="必填缺失"> ⚠</span> : null}
      </label>
      {children}
    </>
  )
}

/** 判重窗口（PRD US-01 场景 2）：既有文档现状 + 三选一处置 */
const CONFLICT_ACTIONS: { value: 'skip' | 'overwrite' | 'keep_both'; label: string; desc: string }[] = [
  { value: 'skip', label: '跳过', desc: '什么都不做，不产生任何新记录' },
  {
    value: 'overwrite',
    label: '覆盖为新版本',
    desc: '新版本进入「待处理」；旧版归档、产物保留可查，且该文档原有切片与向量失效',
  },
  {
    value: 'keep_both',
    label: '并存为 v2',
    desc: '换一个 doc_id（_v2 / _v3…）登记为独立文档，旧文档完全不受影响',
  },
]

function ConflictPanel({
  conflict,
  action,
  onAction,
}: {
  conflict: CorpusConflict
  action: string
  onAction: (v: 'skip' | 'overwrite' | 'keep_both') => void
}) {
  const sameContent = conflict.kind === 'same_content'
  return (
    <Notice>
      <b>
        {sameContent ? '这份文件已经登记过了（内容哈希一致）' : '同名文档已存在，但内容不同'}
      </b>
      <div style={{ marginTop: 6, lineHeight: 1.7 }}>
        <div>
          <b>{conflict.doc_id}</b>
          {conflict.source_name ? ` · ${conflict.source_name}` : ''}
        </div>
        <div>
          地区 {REGION_LABEL[conflict.region] || conflict.region} · 台账状态{' '}
          {conflict.registered ? DOC_STATUS[conflict.status] || conflict.status : '未登记'} · v{conflict.version} · 切片{' '}
          {conflict.chunks == null ? '—' : conflict.chunks}
        </div>
        <div>
          首次登记 {conflict.created_at ? conflict.created_at.replace('T', ' ').slice(0, 19) : '—'} ·{' '}
          {conflict.has_products ? '已有解析产物' : '尚无解析产物'}
          {conflict.renamed ? ' · 本次文件名与已登记的不同' : ''}
        </div>
      </div>
      <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
        {CONFLICT_ACTIONS.map((a) => (
          <label className="chk" key={a.value} style={{ alignItems: 'flex-start', gap: 8 }}>
            <input
              type="radio"
              checked={action === a.value}
              onChange={() => onAction(a.value)}
              style={{ marginTop: 2 }}
            />
            <span>
              <b>{a.label}</b>
              <span style={{ color: 'inherit', opacity: 0.85 }}> —— {a.desc}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="hint" style={{ marginTop: 6 }}>
        选「跳过」不会写入任何东西；选完点下方按钮才会真正执行。
      </div>
    </Notice>
  )
}
