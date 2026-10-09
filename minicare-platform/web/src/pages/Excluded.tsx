import { api } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useAsync } from '../lib/use-async'
import type { ExcludedGet, ExcludedRow } from '../lib/types'
import { DOC_STATUS, RULE_LABEL } from '../lib/labels'
import { Card, CardBody, CardHead, Empty, ErrorBox, Loading, NoDoc, Pill, Table } from '../components/ui'

/** 页面：已屏蔽内容（US-07）—— 噪声块屏蔽与逐块恢复（人工优先于规则） */
export function ExcludedPage() {
  const { doc, go, toast, nonce } = useApp()
  const { data, error, loading } = useAsync<ExcludedGet | null>(
    () => (doc ? api.excluded(doc) : Promise.resolve(null)),
    [doc, nonce],
  )

  if (!doc) return <NoDoc />
  if (loading && !data) return <Loading />
  if (error) return <ErrorBox error={error} />
  if (!data) return null

  if (!data.ready) {
    return (
      <Card>
        <Empty title="还没有切块产物">
          先到「处理详情」跑一次六步，才能看到噪声块判定结果。
          <div style={{ marginTop: 12 }}>
            <button type="button" className="btn" onClick={() => go('detail')}>
              去处理详情
            </button>
          </div>
        </Empty>
      </Card>
    )
  }

  // 用 const 箭头函数（而非 hoisted function 声明）：保证 TS 能保留 `doc` 的非空收窄
  const toggle = async (kbId: string, action: 'restore' | 'exclude') => {
    try {
      const r = action === 'restore' ? await api.restoreExcluded(doc, kbId) : await api.excludeChunk(doc, kbId)
      toast(`${action === 'restore' ? '已恢复检索：' : '已屏蔽：'}${kbId.slice(-24)} · 已重跑下游 · 状态 ${DOC_STATUS[r.status] || r.status}`)
      go('excluded', { refresh: true })
    } catch (e) {
      toast(`失败：${(e as Error).message}`, 8000)
    }
  }

  const summaryTags = Object.entries(data.summary || {})

  return (
    <Card>
      <CardHead
        title={`${data.doc_id} · 已屏蔽内容`}
        meta={
          <span>
            {summaryTags.length
              ? summaryTags.map(([k, v]) => (
                  <Pill key={k} kind="warn">
                    {RULE_LABEL[k] || k} ×{v}
                  </Pill>
                ))
              : <span className="hint">没有块被规则屏蔽</span>}
          </span>
        }
      />
      {/* （2026-10-09 晚「去说明化」，用户点名）原「默认屏蔽 + 可恢复 + 人工优先于规则」机制说明整段移除；
          仅保留动态数据行（存在人工恢复时显示） */}
      {data.overrides?.restore?.length ? (
        <CardBody>
          <div className="hint">人工已恢复 {data.overrides.restore.length} 块。</div>
        </CardBody>
      ) : null}

      <CardBody flush>
        {/* 块 ID 列 306：容下「doc_id-块号」全 ID（实测需 298；230 时尾部块号被截） */}
        {data.excluded.length ? (
          <Table cols={[306, 0, 70, 110, 230, 82, 100]}>
            <thead>
              <tr>
                <th>块 ID</th>
                <th>标题</th>
                <th className="num">页码</th>
                <th>命中规则</th>
                <th>判定依据</th>
                <th className="num">字数</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.excluded.map((c: ExcludedRow) => (
                <tr key={c.kb_id}>
                  <td className="mono" title={c.kb_id}>
                    {c.kb_id}
                  </td>
                  <td title={c.header_path}>{c.title || '—'}</td>
                  <td className="num">{c.page_idx != null ? `p.${c.page_idx}` : '—'}</td>
                  <td>
                    <Pill kind="warn">{RULE_LABEL[c.rule || ''] || c.rule || '—'}</Pill>
                  </td>
                  <td className="hint wrap">{c.reason || ''}</td>
                  <td className="num">{c.chars}</td>
                  <td>
                    <button type="button" className="btn" onClick={() => toggle(c.kb_id, 'restore')}>
                      恢复检索
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Empty title="没有块被屏蔽">
            四类规则（参考文献 / 空表 / 页眉页脚残留 / 纯图无题注）都未命中这份文档。
          </Empty>
        )}
      </CardBody>

      {data.restored.length ? (
        <>
          <div className="card-h" style={{ borderTop: '1px solid var(--line)' }}>
            <h2>人工恢复的块</h2>
            <span className="meta">{data.restored.length} 块 · 规则不会再屏蔽它们</span>
          </div>
          <CardBody flush>
            {/* 块 ID 列 306：同上（人工恢复表同构） */}
            <Table cols={[306, 0, 70, 230, 82, 100]}>
              <thead>
                <tr>
                  <th>块 ID</th>
                  <th>标题</th>
                  <th className="num">页码</th>
                  <th>原命中规则</th>
                  <th className="num">字数</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.restored.map((c) => (
                  <tr key={c.kb_id}>
                    <td className="mono" title={c.kb_id}>
                      {c.kb_id}
                    </td>
                    <td>{c.title || '—'}</td>
                    <td className="num">{c.page_idx != null ? `p.${c.page_idx}` : '—'}</td>
                    <td className="hint wrap">{c.reason || ''}</td>
                    <td className="num">{c.chars}</td>
                    <td>
                      <button type="button" className="btn" onClick={() => toggle(c.kb_id, 'exclude')}>
                        重新屏蔽
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardBody>
        </>
      ) : null}
    </Card>
  )
}
