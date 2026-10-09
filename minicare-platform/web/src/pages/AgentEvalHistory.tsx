/**
 * 页面：Agent 测评 · 历史运行（PRD-010 §5.1 + TECH-022 D5）
 *
 * 运行台账列表（时间倒序）；点击任意一行打开该轮详情（`?page=agenteval&doc=<run_id>`）。
 * 每次运行（含失败与中止）都会自动出现在这里 —— 无需任何手工留档动作。
 * 「结论」列由闸门汇总推导（达标 / 未达标 / 未完整覆盖 / 已中止 / 失败），鼠标悬停看明细。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardBody, CardHead, Empty, ErrorBox, Loading, Pill, Table } from '../components/ui'
import { useApp } from '../lib/app-context'
import {
  agentEvalApi, deriveVerdict, fmtDuration, fmtTime, RUN_STATUS_LABEL, statusPillKind,
  VERDICT_PILL_KIND, VERDICT_PILL_TEXT, verdictShort, type EvalRunMeta,
} from '../lib/agentEval'

export function AgentEvalHistoryPage() {
  const { go, nonce } = useApp()
  const [items, setItems] = useState<EvalRunMeta[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      const r = await agentEvalApi.listRuns(100)
      setItems(r.items)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, nonce])

  const verdicts = useMemo(
    () => (items ? items.map((r) => deriveVerdict(r)) : []),
    [items],
  )

  if (error) return <ErrorBox error={new Error(error)} />
  if (!items) return <Loading />

  return (
    <Card>
      <CardHead title="历史运行" meta={`共 ${items.length} 轮（时间倒序，点击行打开详情）`} />
      <CardBody flush>
        {/* 范围列 120：容下「快检（L0 · 无 judge）」（实测需 ≈153px；本表无弹性列，
            富余宽度会均分各列，故设定值不必顶到 153） */}
        {items.length === 0 ? (
          <Empty title="还没有运行记录">
            到「Agent 测评」页发起第一轮运行后，这里会出现历史台账。
          </Empty>
        ) : (
          <Table cols={[110, 120, 120, 84, 80, 92, 92, 80, 70, 60]}>
            <thead>
              <tr>
                <th>时间</th>
                <th>范围</th>
                <th>任务</th>
                <th>裁判判分</th>
                <th>通过率</th>
                <th>P0（关键）</th>
                <th>结论</th>
                <th>状态</th>
                <th className="num">耗时</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((r, i) => {
                const v = verdicts[i]
                return (
                  <tr
                    key={r.run_id}
                    onClick={() => go('agenteval', { doc: r.run_id })}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="mono">{fmtTime(r.created_at)}</td>
                    <td>{r.scope_label}</td>
                    <td className="hint mono">{r.task_id || '—'}</td>
                    <td className="hint">{r.judge ? '开' : '关'}</td>
                    <td>{r.summary ? `${r.summary.passed}/${r.summary.total}` : '—'}</td>
                    <td className="hint">{r.summary?.p0 != null ? `${r.summary.p0Pass}/${r.summary.p0}` : '—'}</td>
                    <td>
                      <span title={verdictShort(v)}>
                        <Pill kind={VERDICT_PILL_KIND[v.kind]}>{VERDICT_PILL_TEXT[v.kind]}</Pill>
                      </span>
                    </td>
                    <td>
                      <Pill kind={statusPillKind(r.status)}>{RUN_STATUS_LABEL[r.status] || r.status}</Pill>
                    </td>
                    <td className="num">{fmtDuration(r.duration_ms)}</td>
                    <td className="hint">打开 ▸</td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </CardBody>
    </Card>
  )
}

