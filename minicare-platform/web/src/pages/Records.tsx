import { api } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useAsync } from '../lib/use-async'
import type { DocDetail, StepRun } from '../lib/types'
import { STEP_LABEL, STEP_ORDER } from '../lib/labels'
import { Card, CardBody, CardHead, Empty, ErrorBox, Loading, NoDoc, RunFlags, StepStatusPill, Table, Tag } from '../components/ui'

function compactParams(p?: Record<string, unknown>): string {
  if (!p) return '—'
  const keep = ['max_section_chars', 'mode', 'pypdf_cross_check', 'embedding_model', 'ruleset', 'splitter']
  const parts = keep.filter((k) => k in p).map((k) => `${k}=${String(p[k])}`)
  return parts.length ? parts.join(' ') : `${Object.keys(p).length} 项`
}

/**
 * 处理记录（US-08）—— 每次执行的完整记录：状态 / 警告·错误 / 耗时 / 引擎 / 参数。
 *
 * 2026-10-09 从「处理详情」弹框**拆分回工作台页签**（`tab=runlog`）：弹框只留摘要在列表侧就地看，
 * 完整历史放在工作台（"对一份文档深入检查"的家）。列序按**人话优先**：
 * 警告/错误（`RunFlags`）提到前排；`run_id` 这类只给悬停，不再占据主列——
 * 此前满屏 run_id / 参数哈希正是"内容看不懂"的来源。
 */
export function RecordsPage({ docId }: { docId?: string } = {}) {
  const { doc: ctxDoc, nonce } = useApp()
  // 弹框里显示的是列表那一行选中的文档，可能与工作台的当前文档不同
  const doc = docId ?? ctxDoc
  const { data, error, loading } = useAsync<DocDetail | null>(
    () => (doc ? api.docDetail(doc) : Promise.resolve(null)),
    [doc, nonce],
  )

  if (!doc) return <NoDoc />
  if (loading && !data) return <Loading />
  if (error) return <ErrorBox error={error} />
  if (!data) return null

  const m = data.manifest.steps || {}
  const rows: (StepRun & { step: string; isCurrent: boolean })[] = []
  STEP_ORDER.forEach((s) => {
    const entry = m[s] || {}
    ;(entry.runs || []).forEach((r) => {
      rows.push({ step: s, ...r, isCurrent: r.run_id === entry.current_run })
    })
  })
  rows.sort((a, b) => String(b.finished_at || '').localeCompare(String(a.finished_at || '')))

  return (
    <Card>
      <CardHead title={`${data.doc_id} · 处理记录`} meta={`共 ${rows.length} 次执行`} />
      <CardBody flush>
        {/* 步骤列 200（含「当前」徽标，实测需 192）；引擎列 120（self-chunker 需 111）；
            完成时间列 170（ISO 19 字符需 161） */}
        {rows.length ? (
          <Table cols={[200, 90, 0, 80, 120, 170, 190]}>
            <thead>
              <tr>
                <th>步骤</th>
                <th>状态</th>
                <th>警告 / 错误</th>
                <th className="num">耗时</th>
                <th>引擎</th>
                <th>完成时间</th>
                <th>参数</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.step}-${r.run_id}`}>
                  <td title={r.run_id}>
                    {STEP_LABEL[r.step]}
                    {r.isCurrent ? <Tag>当前</Tag> : null}
                  </td>
                  <td>
                    <StepStatusPill status={r.status || 'pending'} />
                  </td>
                  <td className="wrap">
                    <RunFlags run={r} />
                  </td>
                  <td className="num">{r.duration_ms != null ? `${r.duration_ms} ms` : '—'}</td>
                  <td className="mono hint">{r.engine || '—'}</td>
                  <td className="mono">{(r.finished_at || '').replace('T', ' ').slice(0, 19) || '—'}</td>
                  <td
                    className="mono wrap"
                    title={JSON.stringify({ params: r.params || {}, stats: r.stats || {} }, null, 2)}
                  >
                    {compactParams(r.params)}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Empty title="还没有执行记录">到「处理详情」跑一次七步即可生成。</Empty>
        )}
      </CardBody>
      <CardBody>
        <div className="hint">
          对比两次切块的块数差异：悬停「参数」列，看该次 run 的 <code>stats.chunks</code>；
          或用 CLI <code>kb-pipeline show --doc &lt;doc_id&gt;</code>。
        </div>
      </CardBody>
    </Card>
  )
}
