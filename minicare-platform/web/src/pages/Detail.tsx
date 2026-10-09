import { api } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useAsync } from '../lib/use-async'
import type { DocDetail } from '../lib/types'
import { STEP_LABEL, STEP_ORDER } from '../lib/labels'
import {
  Card,
  CardBody,
  CardHead,
  DocPill,
  ErrorBox,
  Loading,
  NoDoc,
  RunFlags,
  StepBar,
  StepStatusPill,
  Table,
  Tag,
} from '../components/ui'

/**
 * 处理详情 —— 七步状态、各步产物与警告/错误（**纯查看面板，无任何操作**）。
 *
 * 2026-10-09 两次调整：
 *   · 先与「处理记录」拆分 —— 完整执行历史移去工作台页签「处理记录」（`tab=runlog`）；
 *   · 再按用户要求**移除全部操作项**（重跑 XX / 作废下游 / 已屏蔽内容跳转 / until 输入）——
 *     本面板只回答"这份文档跑到哪了、有没有异常"。
 *     ⚠️ 界面暂不再提供"选择性重跑 / 作废下游"入口，该能力走 CLI：
 *     `kb-pipeline run --doc X [--until S] [--force]` / `kb-pipeline step` / `kb-pipeline invalidate`。
 */
export interface DocScopedProps {
  /** 指定文档；缺省用全局选中文档（工作台页签场景） */
  docId?: string
}

export function DetailPage({ docId }: DocScopedProps = {}) {
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

  /** 七步状态字典（与列表页同源口径：`lib/steps.ts` 统一消费） */
  const stepMap: Record<string, string> = Object.fromEntries(
    STEP_ORDER.map((s) => [s, (m[s] || {}).status || 'pending']),
  )

  return (
    <>
      <Card>
        <CardHead
          title={data.doc_id}
          meta={
            <>
              <DocPill status={data.status} /> 派生状态
            </>
          }
        />
        <CardBody>
          <StepBar steps={stepMap} />
        </CardBody>
      </Card>

      <Card>
        <CardHead title="各步产物" meta="警告与错误一眼可见 · run_id / 指纹 / 统计收在「技术细节」里" />
        <CardBody flush>
          {/* 步骤列 218：容下「解析高危敏感信息复核 + validate 标签」（实测需 210） */}
          <Table cols={[218, 110, 100, 0]}>
            <thead>
              <tr>
                <th>步骤</th>
                <th>状态</th>
                <th className="num">耗时</th>
                <th>警告 / 错误</th>
              </tr>
            </thead>
            <tbody>
              {STEP_ORDER.map((s) => {
                const e = m[s] || {}
                const cur = (e.runs || []).find((r) => r.run_id === e.current_run)
                return (
                  <tr key={s}>
                    <td>
                      {STEP_LABEL[s]}
                      <Tag>{s}</Tag>
                    </td>
                    <td>
                      <StepStatusPill status={e.status || 'pending'} />
                    </td>
                    <td className="num">{cur?.duration_ms != null ? `${cur.duration_ms} ms` : '—'}</td>
                    <td className="wrap">
                      <RunFlags run={cur} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        </CardBody>
        <details className="fold">
          <summary>技术细节（run_id / 产物指纹 / 统计）—— 排障时才需要看</summary>
          {/* 步骤列 162（10 字需 154）；current_run 列 286：容下最长 run key（35 字符需 277） */}
          <Table cols={[162, 286, 120, 0]}>
            <thead>
              <tr>
                <th>步骤</th>
                <th>current_run</th>
                <th>产物指纹</th>
                <th>统计</th>
              </tr>
            </thead>
            <tbody>
              {STEP_ORDER.map((s) => {
                const e = m[s] || {}
                const cur = (e.runs || []).find((r) => r.run_id === e.current_run)
                const stats = Object.entries(cur?.stats || {})
                  .map(([k, v]) => `${k}=${v}`)
                  .join(' ')
                return (
                  <tr key={s}>
                    <td>{STEP_LABEL[s]}</td>
                    <td className="mono" title={cur?.run_id || ''}>
                      {cur?.run_id || '—'}
                    </td>
                    <td className="mono">{(cur?.artifact_hash || '').slice(0, 12) || '—'}</td>
                    <td className="mono wrap">{stats || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        </details>
        <details className="fold">
          <summary>查看 manifest 原文（执行事实唯一来源）</summary>
          <pre className="box">{JSON.stringify(data.manifest, null, 2)}</pre>
        </details>
      </Card>
    </>
  )
}
