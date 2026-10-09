import type { ReactNode } from 'react'
import { DOC_STATUS, STEP_LABEL, STEP_ORDER, STEP_STATUS_LABEL, docPillCls } from '../lib/labels'
import type { StepRun } from '../lib/types'
import { useApp } from '../lib/app-context'

/* ── 卡片 ─────────────────────────────────────────────── */

export function Card({ children }: { children: ReactNode }) {
  return <div className="card">{children}</div>
}

export function CardHead({ title, meta }: { title: ReactNode; meta?: ReactNode }) {
  return (
    <div className="card-h">
      <h2>{title}</h2>
      {meta != null ? <span className="meta">{meta}</span> : null}
    </div>
  )
}

export function CardBody({ children, flush }: { children: ReactNode; flush?: boolean }) {
  return <div className={flush ? 'card-b card-b-flush' : 'card-b'}>{children}</div>
}

/* ── 状态标记 ─────────────────────────────────────────── */

export function Pill({ kind, children }: { kind: string; children: ReactNode }) {
  return <span className={`pill ${kind}`}>{children}</span>
}

export function StepStatusPill({ status }: { status: string }) {
  const cls =
    status === 'succeeded'
      ? 'ok'
      : status === 'stale'
        ? 'warn'
        : status === 'failed'
          ? 'danger'
          : 'plain'
  return <Pill kind={cls}>{STEP_STATUS_LABEL[status] || status}</Pill>
}

export function DocPill({ status }: { status: string }) {
  return <Pill kind={docPillCls(status)}>{DOC_STATUS[status] || status}</Pill>
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="tag">{children}</span>
}

/**
 * 单次 run 的「人话异常」单元格：错误（红）> 警告（黄，取第一条）> 无（—）。
 *
 * 这是「处理详情 / 处理记录」的首要信息 —— manifest 里一直存着 `warnings` / `error`
 * （如"已屏蔽 1 块不参与检索：reference_list×1"），此前界面完全没露出，
 * 反而只摆了 run_id / 指纹这类没人读的字段（2026-10-09 用户反馈"内容看不懂"后的修正）。
 * `title` 永远给全量文本（多条警告不丢信息）。
 */
export function RunFlags({ run }: { run?: StepRun }) {
  if (!run) return <span className="hint">—</span>
  const err = (run.error || '').trim()
  const warns = run.warnings || []
  if (err) {
    return (
      <span className="flag-err" title={err}>
        {err}
      </span>
    )
  }
  if (warns.length) {
    return (
      <span className="flag-warn" title={warns.join('\n')}>
        ⚠ {warns[0]}
        {warns.length > 1 ? `（共 ${warns.length} 条）` : ''}
      </span>
    )
  }
  return <span className="hint">—</span>
}

/* ── 七步圆点 / 步骤条 ────────────────────────────────── */

export function Dots({ steps }: { steps?: Record<string, string> }) {
  return (
    <span className="dots">
      {STEP_ORDER.map((s) => {
        const st = (steps && steps[s]) || 'pending'
        return (
          <span key={s} className={`sdot ${st}`} title={`${STEP_LABEL[s]}：${STEP_STATUS_LABEL[st] || st}`} />
        )
      })}
    </span>
  )
}

export function Legend() {
  return (
    <div className="legend">
      {STEP_ORDER.map((s) => (
        <span key={s}>
          {s}. {STEP_LABEL[s]}
        </span>
      ))}
      <span style={{ marginLeft: 'auto' }}>已完成 / 缓存命中 / 待重跑 / 失败 / 未执行</span>
    </div>
  )
}

export function StepBar({ steps }: { steps: Record<string, string> }) {
  return (
    <div className="steps">
      {STEP_ORDER.map((s) => {
        const st = steps[s] || 'pending'
        const cls = st === 'stale' ? 'stale' : st === 'failed' ? 'failed' : st === 'succeeded' ? 'done' : ''
        return (
          <div key={s} className={`step ${cls}`}>
            <span className={`sdot ${st}`} />
            <span className="nm">{STEP_LABEL[s]}</span>
            <span className="st">{STEP_STATUS_LABEL[st] || st}</span>
          </div>
        )
      })}
    </div>
  )
}

/* ── KPI ─────────────────────────────────────────────── */

export function Kpis({ items }: { items: [string, ReactNode, string?][] }) {
  return (
    <div className="kpis">
      {items.map(([k, v, u]) => (
        <div key={k} className="kpi">
          <div className="k">{k}</div>
          <div className="v">
            {v}
            {u ? <span className="u">{u}</span> : null}
          </div>
        </div>
      ))}
    </div>
  )
}

export function KpiCard({ k, v, u }: { k: string; v: ReactNode; u?: string }) {
  return (
    <div className="kpi">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
      {u ? <div className="u">{u}</div> : null}
    </div>
  )
}

/* ── 提示 / 空态 / 错误 ──────────────────────────────── */

export function Notice({ children, tone = 'warn' }: { children: ReactNode; tone?: 'warn' | 'accent' | 'ok' }) {
  const style =
    tone === 'accent'
      ? { background: 'var(--accent-bg)', borderColor: 'var(--accent-line)', color: 'var(--accent)' }
      : tone === 'ok'
        ? { background: 'var(--ok-bg)', borderColor: 'var(--ok)', color: 'var(--ok)' }
        : undefined
  return (
    <div className="notice" style={style}>
      {children}
    </div>
  )
}

export function Loading() {
  return (
    <div className="empty">
      <span className="spin" /> 加载中…
    </div>
  )
}

export function ErrorBox({ error }: { error: Error }) {
  return (
    <div className="card">
      <div className="empty">
        <div className="big">加载失败</div>
        {error.message}
      </div>
    </div>
  )
}

export function Empty({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="big">{title}</div>
      {children}
    </div>
  )
}

/** 「尚未选择文档」占位（多数页面共用） */
export function NoDoc() {
  const { go } = useApp()
  return (
    <div className="card">
      <div className="empty">
        <div className="big">尚未选择文档</div>
        请到
        <button className="btn" style={{ margin: '0 4px' }} onClick={() => go('corpus')}>
          文档管理
        </button>
        点选一份文档。
      </div>
    </div>
  )
}

export function KV({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="kv">
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/* ── 表格骨架 ─────────────────────────────────────────── */

export function Table({ cols, children }: { cols: (string | number)[]; children: ReactNode }) {
  return (
    <table className="tbl">
      <colgroup>
        {cols.map((w, i) => (
          // 列宽约定：数字 > 0 → 固定 px；字符串 → 原样（如 '46%'）；**0 → 不设宽 = 弹性列**（吃剩余空间）。
          // ⚠️ 此前 0 被渲染成 `width: 0px`，而 `.tbl` 是 `table-layout: fixed` —— 全站 13 处
          // 用 0 标记的"弹性列"因此长期是 0 宽（内容整列不可见）。2026-10-09 修复。
          <col
            key={i}
            style={
              typeof w === 'number'
                ? w > 0
                  ? { width: `${w}px` }
                  : undefined
                : { width: w }
            }
          />
        ))}
      </colgroup>
      {children}
    </table>
  )
}
