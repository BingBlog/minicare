import { api } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useAsync } from '../lib/use-async'
import type { ReviewsGet } from '../lib/types'
import { REVIEW_STATE } from '../lib/labels'
import { Card, CardBody, CardHead, Empty, ErrorBox, Loading, NoDoc, Table } from '../components/ui'

/** 页面：解析高危敏感信息复核（US-06，原「内容复核」2026-10-09 改名）—— 数字缺失复核：候选补全值、四态流转、回填后重算向量 */
export function NumbersPage() {
  const { doc, go, toast, nonce } = useApp()
  const { data, error, loading } = useAsync<ReviewsGet | null>(
    () => (doc ? api.reviews(doc) : Promise.resolve(null)),
    [doc, nonce],
  )

  if (!doc) return <NoDoc />
  if (loading && !data) return <Loading />
  if (error) return <ErrorBox error={error} />
  if (!data) return null

  if (!data.ready) {
    return (
      <Card>
        <Empty title="还没有复核产物">
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

  const items = data.items || []

  async function resolve(kbId: string, state: string) {
    if (!doc) return
    let value = ''
    if (state === 'accepted') {
      value = window.prompt('采纳的补全值（直接写要填进正文的内容）：') || ''
      if (!value) return
    } else if (state === 'edited') {
      value = window.prompt('手动填值：') || ''
      if (!value) return
    }
    try {
      await api.resolveReview(doc, kbId, state, value)
      toast(`${kbId.slice(-20)} → ${REVIEW_STATE[state]}`)
      go('numbers', { refresh: true })
    } catch (e) {
      toast(`失败：${(e as Error).message}`, 8000)
    }
  }

  return (
    <Card>
      <CardHead
        title={`${data.doc_id} · 解析高危敏感信息复核`}
        meta={`待处理 ${items.length} 条 · 规则例外 ${(data.rule_exceptions || []).length} 条`}
      />
      {/* （2026-10-09 晚「去说明化」，用户点名）原「四态：采纳 / 手动填值 / 判为误报 / 标记无法补全」机制说明整段移除 */}
      <CardBody flush>
        {items.length ? (
          <Table cols={[230, 0, 70, 170, 0, 300]}>
            <thead>
              <tr>
                <th>kb_id</th>
                <th>标题</th>
                <th className="num">页</th>
                <th>命中规则</th>
                <th>候选补全值</th>
                <th>处置</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.kb_id}>
                  <td className="mono" title={it.kb_id}>
                    {it.kb_id}
                  </td>
                  <td className="wrap">{(it.title || '').slice(0, 40)}</td>
                  <td className="num">{it.page_idx != null ? `p.${it.page_idx}` : '—'}</td>
                  <td className="hint">{(it.patterns || []).join('/') || it.reason || ''}</td>
                  <td className="hint wrap">
                    {(it.candidates || []).length
                      ? (it.candidates || []).map((c, i) => <div key={i}>{c}</div>)
                      : '未定位 ⚠'}
                  </td>
                  <td>
                    {(['accepted', 'edited', 'rejected', 'unresolvable'] as const).map((s) => (
                      <button key={s} type="button" className="btn" onClick={() => resolve(it.kb_id, s)}>
                        {s === 'accepted' ? '采纳' : s === 'edited' ? '填值' : s === 'rejected' ? '误报' : '无法补全'}
                      </button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Empty title="没有待复核项">数字门禁未命中，或已全部处置完毕。</Empty>
        )}
      </CardBody>
    </Card>
  )
}
