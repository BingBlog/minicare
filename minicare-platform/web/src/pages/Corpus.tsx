import { Fragment, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useAsync } from '../lib/use-async'
import type { DocStatus, ExcerptsGet, Overview, RunProgress, StepDetail } from '../lib/types'
import { DOC_STATUS, STEP_LABEL, STEP_ORDER, STEP_STATUS_LABEL } from '../lib/labels'
import { isDocDone, nextAction, nextStep, stepStatus } from '../lib/steps'
import { fmtElapsed } from '../lib/run-progress'
import { PROCESSING_MODAL_ID, STEP_SHORT, UPLOAD_MODAL_ID } from '../nav'
import { ErrorBox, Kpis, Loading } from '../components/ui'
import { ProcessingModal } from './ProcessingModal'
import { UploadDocModal } from './UploadDocModal'

function fmtMs(ms?: number | null): string {
  if (ms == null) return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/** 管线节点/连接段能直接用的状态类（其余状态一律走默认灰） */
const PIPE_STATES = new Set(['succeeded', 'skipped_cached', 'stale', 'failed'])
const pipeCls = (st: string) => (PIPE_STATES.has(st) ? st : '')

/**
 * 七步「管线」—— 把"这是一条处理流水线"直接画出来。
 *
 * · 节点颜色 = 该步状态（沿用既有 `.sdot` 的色语言，不引入新色系）
 * · 连接段颜色 = **前一个**节点的颜色（"跑到哪一步"的进度感来自这里）
 * · 蓝色环 = 下一步要跑的那一步（与操作按钮文案同源，都来自 `lib/steps.ts:nextStep`）
 * · 蓝色脉冲 = 运行中正在执行的那一步（`prog` 来自 app-context 的 1s 轮询）——
 *   运行期间**已完成步骤立即着色**（不等 overview 刷新），步骤推进一眼可见。
 * · 节点名小字 = **常显**在节点正下方（`data-label` → CSS `::after`）——
 *   原方案名字只进 hover 提示：7 个节点逐个悬停才认得出哪颗是什么，且原生 title
 *   有延迟（"hover 等一会儿"）。小字走 absolute 定位：不占 flex 宽度、不把节点挤歪。
 *   染色只给「需要注意」的状态（下一步 / 运行中 / 待重跑 / 失败），其余保持灰 ——
 *   7 个全上色反而看不出重点。
 *
 * 相比原来的「6 个带文字的胶囊」省掉约 300px 宽度 —— 省下的空间还给了文档名。
 * 逐步耗时没丢：在 hover 提示里，另在卡片右下角显示**最近一次**耗时。
 */
function StepPipeline({ doc, prog }: { doc: DocStatus; prog?: RunProgress | null }) {
  const next = nextStep(doc)
  const runningStep = prog?.running ? (prog.step_id ?? null) : null
  const done = prog?.running ? prog.done : undefined
  /** 步骤状态：本次运行的实时结果（done）优先于 overview 快照 */
  const stOf = (sid: string) =>
    done?.[sid] ?? (sid === runningStep ? 'running' : stepStatus(doc, sid))
  const tip = STEP_ORDER.map(
    (sid) => `${STEP_LABEL[sid]}：${STEP_STATUS_LABEL[stOf(sid)] || stOf(sid)}`,
  ).join('\n')
  return (
    <span className="pipeline" title={tip}>
      {STEP_ORDER.map((sid, i) => (
        <Fragment key={sid}>
          {i > 0 ? <span className={`pipe-seg ${pipeCls(stOf(STEP_ORDER[i - 1]))}`} /> : null}
          <span
            className={`pipe-node ${pipeCls(stOf(sid))}${sid === next ? ' next' : ''}${
              sid === runningStep ? ' running' : ''
            }`}
            data-label={STEP_SHORT[sid] || STEP_LABEL[sid] || sid}
          />
        </Fragment>
      ))}
    </span>
  )
}

/** 最近一次跑完的那一步（用于卡片右下角显示耗时） */
function latestStep(doc: DocStatus): { sid: string; ms: number | null } | null {
  const runs = STEP_ORDER.map((sid) => ({ sid, d: doc.steps_detail?.[sid] as StepDetail | undefined }))
    .filter((x) => x.d?.finished_at)
    .sort((a, b) => String(b.d?.finished_at).localeCompare(String(a.d?.finished_at)))
  const top = runs[0]
  return top ? { sid: top.sid, ms: top.d?.duration_ms ?? null } : null
}

/**
 * 单份文档的卡片 = 左「PDF 首页缩略图」+ 右「标题 / 元信息 / 原文摘要 / 七步管线 / 操作」。
 *
 * 缩略图由 `/api/docs/{id}/page/0.png` 现场渲染（首次约 420ms，之后走磁盘缓存 + HTTP 缓存），
 * 因此必须 `loading="lazy"` —— 只渲可见的那几张，否则 17 份串行渲染要 7 秒以上。
 * HTML 来源的文档没有 PDF（`has_pdf=false`），用虚线占位，**不发注定 404 的请求**。
 */
function DocCard({
  doc,
  excerpt,
  busy,
  prog,
  onOpenSource,
  onProcessing,
  onRun,
}: {
  doc: DocStatus
  excerpt: string | null | undefined
  busy: boolean
  /** 运行中的实时进度（来自 app-context 的轮询；不运行时为 undefined） */
  prog?: RunProgress | null
  onOpenSource: () => void
  onProcessing: () => void
  onRun: () => void
}) {
  const act = nextAction(doc)
  const last = latestStep(doc)
  const running = !!prog?.running
  const runText = prog?.step_label
    ? `第 ${prog.step_index}/${prog.total_steps} 步 · ${prog.step_label}`
    : '准备中…'
  const thumb = `/api/docs/${encodeURIComponent(doc.doc_id)}/page/0.png?scale=0.5`
  const meta = [
    doc.region === 'cn' ? '国内' : '国际',
    DOC_STATUS[doc.status] || doc.status,
    doc.has_products === false ? '未解析' : null,
  ].filter(Boolean)

  return (
    <div className="doccard">
      {doc.has_pdf ? (
        <button
          type="button"
          className="doccard-thumb"
          onClick={onOpenSource}
          title="打开「文档工作台 · 解析结果对照」"
        >
          <img src={thumb} alt={`${doc.doc_id} 首页`} loading="lazy" decoding="async" />
        </button>
      ) : (
        <div className="doccard-thumb is-html" title="该文档是 HTML 下载页来源，没有 PDF 可预览">
          <span className="hint">
            {doc.has_products === false ? '尚未解析' : 'HTML 来源'}
            <br />
            无 PDF 预览
          </span>
        </div>
      )}

      <div className="doccard-main">
        <div className="doccard-title">
          <b className="link" onClick={onOpenSource} title={doc.doc_id}>
            {doc.doc_id}
          </b>
        </div>
        <div className="doccard-meta">{meta.join(' · ')}</div>
        <div className={`doccard-excerpt${excerpt ? '' : ' muted'}`}>
          {excerpt ||
            (doc.has_products === false
              ? '尚未解析，暂无正文摘要'
              : '该文档开头是版权 / 作者信息，无可用摘要')}
        </div>
        <StepPipeline doc={doc} prog={prog} />
        <div className="doccard-actions">
          <button type="button" className="btn" onClick={onProcessing}>
            处理详情
          </button>
          <button type="button" className="btn btn-primary" disabled={busy || !act.enabled} onClick={onRun} title={act.hint}>
            {busy ? '运行中…' : act.label}
          </button>
          <span className={`mext${running ? ' runprog' : ''}`}>
            {running ? (
              <>
                <span className="spin" /> {runText} · 已 {fmtElapsed(prog?.elapsed_ms)}
              </>
            ) : last ? (
              `${STEP_SHORT[last.sid] || ''} ${fmtMs(last.ms)}`
            ) : (
              ''
            )}
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * 页面：文档管理（US-01 / US-02）
 *
 * 形态：**卡片矩阵**，每张卡内嵌该文档的 PDF 首页缩略图 + 原文摘要 ——
 * 表格形态塞不下缩略图，而"这份文档长什么样"恰恰是最省事的识别依据。
 *
 * 两次取数并行：`/api/overview`（状态 / 七步明细）+ `/api/corpus/excerpts`（批量摘要）。
 * 摘要是批量端点而非逐个 `parsed/md`：后者会把每份**全文**都传一遍（有几份上百 KB）。
 */
export function CorpusPage() {
  const { go, toast, nonce, doc: selected, modal, ensureOverview, activeRuns, trackRun } = useApp()
  /** 正在运行的那一份文档。按行记录而不是全局布尔：全表按钮一起变灰会让人不知道是哪一份在跑。 */
  const [busyDoc, setBusyDoc] = useState<string | null>(null)

  const { data, error, loading } = useAsync<[Overview, ExcerptsGet]>(
    () => Promise.all([api.overview(), api.corpusExcerpts()]),
    [nonce],
  )

  useEffect(() => {
    ensureOverview(true).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function runDoc(docId: string) {
    setBusyDoc(docId)
    // 进度跟踪：右下角浮标 + 卡片七步管线实时高亮（后端 run_registry 驱动，1s 轮询）。
    // 替代早期的「运行中（dry-run）…」静态 toast —— 运行多久就显示多久，还能看到跑到哪一步了。
    trackRun(docId)
    try {
      const r = await api.runDoc(docId, { force: false })
      if (r.blocked) {
        // 执行失败时**绝不能报「完成」**：那正是"点了按钮状态没变"看起来像故障的根源。
        toast(
          <>
            <b>执行失败 · {r.blocked.step_label}</b>
            <div style={{ marginTop: 4 }}>
              {r.blocked.message}
              {r.blocked.advice ? <div style={{ marginTop: 4 }}>{r.blocked.advice}</div> : null}
            </div>
          </>,
          14000,
        )
      } else {
        const done = r.steps.filter((s) => s.status === 'succeeded').length
        const cached = r.steps.filter((s) => s.status === 'skipped_cached').length
        toast(`完成 · 派生状态 ${DOC_STATUS[r.status] || r.status} · 执行 ${done} / 缓存 ${cached}`)
      }
      await ensureOverview(true).catch(() => {})
      // 跑完直接摊开处理弹框：七步明细 + 历史 run 都在那一处
      go('corpus', { doc: docId, modal: PROCESSING_MODAL_ID, refresh: true })
    } catch (e) {
      toast(`失败：${(e as Error).message}`, 8000)
    } finally {
      setBusyDoc(null)
    }
  }

  if (loading && !data) return <Loading />
  if (error) return <ErrorBox error={error} />
  if (!data) return null

  const [ov, ex] = data
  const counts = ov.docs.reduce<Record<string, number>>((a, d) => {
    a[d.status] = (a[d.status] || 0) + 1
    return a
  }, {})

  return (
    <>
      <Kpis
        items={[
          ['文档总数', ov.docs.length, '份'],
          ['七步全绿', ov.docs.filter(isDocDone).length, '份'],
          ['已就绪待发布', counts.ready || 0, '份'],
          ['失败', counts.failed || 0, '份'],
        ]}
      />

      <div className="toolbar">
        <b style={{ fontSize: 14 }}>文档</b>
        <span className="hint">共 {ov.docs.length} 份</span>
        <span style={{ marginLeft: 'auto' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => go('corpus', { modal: UPLOAD_MODAL_ID })}
          >
            ＋ 上传新文档
          </button>
        </span>
      </div>

      <div className="docgrid">
        {ov.docs.map((d) => (
          <DocCard
            key={d.doc_id}
            doc={d}
            excerpt={ex.excerpts?.[d.doc_id]}
            // busy 有两个来源：本页点击（busyDoc，点击瞬间即有反馈）+
            // 全局跟踪（activeRuns，覆盖"刷新页面后运行仍在继续"的场景）
            busy={busyDoc === d.doc_id || !!activeRuns[d.doc_id]?.running}
            prog={activeRuns[d.doc_id]}
            // 点缩略图/标题 → 文档工作台的「解析结果对照」（PDF + Markdown 并排 + bbox 高亮）
            onOpenSource={() => go('source', { doc: d.doc_id, tab: 'compare' })}
            onProcessing={() => go('corpus', { doc: d.doc_id, modal: PROCESSING_MODAL_ID })}
            onRun={() => void runDoc(d.doc_id)}
          />
        ))}
      </div>

      {modal === PROCESSING_MODAL_ID && selected ? (
        <ProcessingModal docId={selected} onClose={() => go('corpus', { modal: null })} />
      ) : null}

      {modal === UPLOAD_MODAL_ID ? (
        <UploadDocModal onClose={() => go('corpus', { modal: null })} />
      ) : null}
    </>
  )
}
