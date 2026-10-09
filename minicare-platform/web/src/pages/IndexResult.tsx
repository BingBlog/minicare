import type { ReactNode } from 'react'
import { api } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useAsync } from '../lib/use-async'
import type { IndexResult } from '../lib/types'
import { INDEX_MODE_LABEL, KEYWORD_SOURCE_LABEL, RETRIEVAL_STATUS_LABEL } from '../lib/labels'
import { Card, CardBody, CardHead, Empty, ErrorBox, KV, Loading, NoDoc, Pill, Table } from '../components/ui'

/** 页面：入库结果（US-09）—— 向量模型版本、关键词来源与抽样、维度一致性 */
export function IndexResultPage() {
  const { doc, go, nonce } = useApp()
  const { data, error, loading } = useAsync<IndexResult | null>(
    () => (doc ? api.indexResult(doc) : Promise.resolve(null)),
    [doc, nonce],
  )

  if (!doc) return <NoDoc />
  if (loading && !data) return <Loading />
  if (error) return <ErrorBox error={error} />
  if (!data) return null

  if (!data.ready) {
    return (
      <Card>
        <Empty title="还没有索引产物">
          先跑一次六步。
          <div style={{ marginTop: 12 }}>
            <button type="button" className="btn" onClick={() => go('detail')}>
              去处理详情
            </button>
          </div>
        </Empty>
      </Card>
    )
  }

  const c = data.counts || {}
  const kv: [string, ReactNode][] = [
    ['模式', data.mode ? INDEX_MODE_LABEL[data.mode] || data.mode : '—'],
    ['纳入检索', c.to_index],
    ['待复核', c.review_excluded],
    ['噪声屏蔽', c.noise_excluded],
    ['向量模型', data.embedding?.model],
    ['向量维度', data.embedding?.dim],
    ['向量可用', String(data.embedding?.available ?? '—')],
    ['关键词来源', data.keyword_source ? KEYWORD_SOURCE_LABEL[data.keyword_source] || data.keyword_source : '—'],
    ['目标库', data.target?.db_name],
  ]

  return (
    <Card>
      <CardHead
        title={`${data.doc_id} · 入库结果`}
        meta={<Pill kind={data.mode === 'dry_run' ? 'warn' : 'ok'}>{data.mode ? INDEX_MODE_LABEL[data.mode] || data.mode : '—'}</Pill>}
      />
      <CardBody>
        <KV rows={kv.map(([k, v]) => [k, v == null ? '—' : String(v)])} />
      </CardBody>
      <CardBody flush>
        {/* kb_id 列 306：容下「doc_id-块号」全 ID（实测需 298；230 时尾部块号被截） */}
        <Table cols={[306, 0, 100, 80, 220]}>
          <thead>
            <tr>
              <th>kb_id</th>
              <th>标题</th>
              <th>检索状态</th>
              <th className="num">字数</th>
              <th>关键词</th>
            </tr>
          </thead>
          <tbody>
            {(data.plan || []).slice(0, 200).map((p) => (
              <tr key={p.kb_id}>
                <td className="mono" title={p.kb_id}>
                  {p.kb_id}
                </td>
                <td>{(p.title || '').slice(0, 36)}</td>
                <td>
                  <Pill
                    kind={
                      p.retrieval_status === 'enabled' ? 'ok' : p.retrieval_status === 'review' ? 'warn' : 'plain'
                    }
                  >
                    {p.retrieval_status ? RETRIEVAL_STATUS_LABEL[p.retrieval_status] || p.retrieval_status : '—'}
                  </Pill>
                </td>
                <td className="num">{p.content_chars}</td>
                <td className="hint wrap">{(p.keywords || '').slice(0, 60)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </CardBody>
      <CardBody>
        <div className="hint">
          共 {(data.plan || []).length} 条计划；仅展示前 200 条。
          {(data.warnings || []).map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      </CardBody>
    </Card>
  )
}
