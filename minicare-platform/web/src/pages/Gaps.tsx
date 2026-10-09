import { api } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useAsync } from '../lib/use-async'
import type { GapsGet } from '../lib/types'
import { ATTR_LABEL, GAP_STATE_LABEL } from '../lib/labels'
import { Card, CardBody, CardHead, Empty, ErrorBox, Loading, Pill, Table } from '../components/ui'

/** 页面：知识缺口（US-12）—— 未命中主题聚合；区分覆盖缺口与切片问题 */
export function GapsPage() {
  const { go, toast, nonce } = useApp()
  const { data, error, loading } = useAsync<GapsGet>(() => api.gaps(), [nonce])

  if (loading && !data) return <Loading />
  if (error) return <ErrorBox error={error} />
  if (!data) return null

  const st = data.stats || {}
  const rows = data.items || []

  async function collect() {
    try {
      const r = await api.gapsCollect()
      toast(r.ok ? `已收进 ${r.added.length} 条缺口` : r.message || '无法收集', 7000)
      go('gaps', { refresh: true })
    } catch (e) {
      toast(`失败：${(e as Error).message}`, 8000)
    }
  }

  async function close(gapId: string) {
    try {
      await api.gapClose(gapId)
      toast('已关闭')
      go('gaps', { refresh: true })
    } catch (e) {
      toast(`失败：${(e as Error).message}`, 8000)
    }
  }

  async function defer(gapId: string) {
    const reason = window.prompt('暂不处理的原因（必填）：')
    if (!reason) return
    try {
      const r = await api.gapDefer(gapId, reason)
      toast(r.ok ? '已标记暂不处理' : '失败')
      go('gaps', { refresh: true })
    } catch (e) {
      toast(`失败：${(e as Error).message}`, 8000)
    }
  }

  return (
    <Card>
      <CardHead
        title="知识缺口"
        meta={`开放 ${st.open || 0} · 已关闭 ${st.closed || 0} · 暂不处理 ${st.deferred || 0}`}
      />
      <CardBody>
        <div className="hint">
          归因决定动作：<b>覆盖缺口</b>→补录语料；<b>排序问题</b>→排查排序（内容已在库）；
          <b>切片被屏蔽</b>→去「已屏蔽内容」恢复；<b>gold 失效</b>→重做映射。
          「暂不处理」必须填原因。
        </div>
        <div className="toolbar" style={{ margin: '10px 0 0' }}>
          <button type="button" className="btn btn-primary" onClick={collect}>
            从最近质检收集
          </button>
        </div>
      </CardBody>

      <CardBody flush>
        {rows.length ? (
          <Table cols={[0, 130, 70, 0, 80, 170]}>
            <thead>
              <tr>
                <th>主题</th>
                <th>归因</th>
                <th className="num">出现</th>
                <th>证据</th>
                <th>状态</th>
                <th>动作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.gap_id}>
                  <td className="wrap">{g.theme}</td>
                  <td>
                    <Pill kind={g.attribution === 'coverage_gap' ? 'warn' : 'plain'}>
                      {ATTR_LABEL[g.attribution] || g.attribution}
                    </Pill>
                  </td>
                  <td className="num">{g.occurrences}</td>
                  <td className="hint wrap">{(g.evidence || '').slice(0, 60)}</td>
                  <td>{GAP_STATE_LABEL[g.state] || g.state}</td>
                  <td>
                    <button type="button" className="btn" onClick={() => close(g.gap_id)}>
                      关闭
                    </button>{' '}
                    <button type="button" className="btn" onClick={() => defer(g.gap_id)}>
                      暂不处理
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Empty title="暂无缺口记录">先跑「检索质检」，再点上面的「从最近质检收集」。</Empty>
        )}
      </CardBody>

      {data.online_misses?.length ? (
        <CardBody>
          <h2 style={{ fontSize: 13, margin: '0 0 6px' }}>线上未命中 TOP（近 7 天）</h2>
          {data.online_misses.map((m, i) => (
            <div className="hint" key={i}>
              {m.count} 次 · {m.query}
            </div>
          ))}
        </CardBody>
      ) : null}
    </Card>
  )
}
