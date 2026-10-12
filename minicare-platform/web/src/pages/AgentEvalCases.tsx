/**
 * 页面：测评用例库（TECH-021 §6.2 + TECH-022 B5）
 *
 * 用例一等管理：列表/筛选、结构化编辑（表单 / JSON 双模，见 components/eval/CaseEditor）、
 * 启停、删除、从 harness 目录导入、导出为 harness 兼容 JSON（供 `--cases-file` 与 git 留档）。
 */
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Card, CardBody, CardHead, Empty, ErrorBox, Loading, Pill, Table } from '../components/ui'
import { useApp } from '../lib/app-context'
import { CaseEditor } from '../components/eval/CaseEditor'
import { judgeSummary } from '../components/eval/expectView'
import { agentEvalApi, EVAL_GROUPS, groupLabel, priorityLabel, tagLabel, type EvalCase } from '../lib/agentEval'

const INPUT: CSSProperties = {
  padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 6,
  fontSize: 13, background: 'var(--surface)', color: 'var(--text)', width: '100%',
  boxSizing: 'border-box',
}

/** EvalCase 出参 → 可提交 payload */
function casePayload(c: Partial<EvalCase>): Record<string, unknown> {
  return {
    grp: c.grp, priority: c.priority, desc: c.desc, message: c.message,
    ctx: c.ctx ?? {}, history: c.history ?? [], expect: c.expect ?? {},
    judge: c.judge ?? null, extra: c.extra ?? null, tags: c.tags ?? [],
    enabled: c.enabled ?? true, sort_order: c.sort_order ?? 0,
  }
}

export function AgentEvalCasesPage() {
  const { toast, nonce } = useApp()
  const [items, setItems] = useState<EvalCase[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [grp, setGrp] = useState('')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<EvalCase | 'new' | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      const p = new URLSearchParams()
      if (grp) p.set('grp', grp)
      if (q) p.set('q', q)
      const qs = p.toString() ? `?${p.toString()}` : ''
      const r = await agentEvalApi.listCases(qs)
      setItems(r.items)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [grp, q])

  useEffect(() => {
    void load()
  }, [load, nonce])

  const toggle = async (c: EvalCase, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await agentEvalApi.updateCase(c.case_id, { ...casePayload(c), enabled: !c.enabled })
      toast(`已${c.enabled ? '停用' : '启用'} ${c.case_id}`)
      void load()
    } catch (err) {
      toast(`操作失败：${(err as Error).message}`, 6000)
    }
  }

  const remove = async (c: EvalCase, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirmDel !== c.case_id) {
      setConfirmDel(c.case_id)
      window.setTimeout(() => setConfirmDel((v) => (v === c.case_id ? null : v)), 4000)
      return
    }
    setConfirmDel(null)
    try {
      await agentEvalApi.deleteCase(c.case_id)
      toast(`已删除 ${c.case_id}`)
      void load()
    } catch (err) {
      toast(`删除失败：${(err as Error).message}`, 6000)
    }
  }

  const doImport = async () => {
    try {
      const r = await agentEvalApi.importCases(false)
      toast(r.skipped ? `用例库非空（${r.existing} 条），未导入（需覆盖请用 --force）` : `已导入 ${r.imported} 条用例`)
      void load()
    } catch (err) {
      toast(`导入失败：${(err as Error).message}`, 6000)
    }
  }

  const doExport = async () => {
    try {
      const data = await agentEvalApi.exportCases()
      const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `eval-cases-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast(`已导出 ${data.count} 条`)
    } catch (err) {
      toast(`导出失败：${(err as Error).message}`, 6000)
    }
  }

  if (error) return <ErrorBox error={new Error(error)} />
  if (!items) return <Loading />

  return (
    <>
      <Card>
        <CardHead
          title="测评用例"
          meta={
            <div className="toolbar" style={{ margin: 0 }}>
              <select value={grp} onChange={(e) => setGrp(e.target.value)} style={{ ...INPUT, width: 120 }}>
                <option value="">全部组</option>
                {EVAL_GROUPS.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
              <input
                placeholder="搜索 id / 描述 / 输入"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                style={{ ...INPUT, width: 180 }}
              />
              <button className="btn" onClick={doImport}>导入 JSON</button>
              <button className="btn" onClick={doExport}>导出 JSON</button>
              <button className="btn btn-primary" onClick={() => setEditing('new')}>＋ 新建用例</button>
            </div>
          }
        />
        <CardBody flush>
          {/* 组列 116：容下「L4 对话与会话」；判分要点 196：完整展示要点徽标组合（实测最宽 ≈171px）；
              标签 126：容下「真实数据」等中文标签；状态列 84：容下「启用」Pill（≈49px）；
              操作列 204：容下三按钮（编辑/停用/确认删？ ≈176px）；描述 180（换行展示）；
              「用户提问」= 弹性列（0 吃余量，长文本换行不截断） */}
          {items.length === 0 ? (
            <Empty title="没有匹配的用例">
              可点「导入 JSON」从 harness 目录导入，或「＋ 新建用例」手工创建。
            </Empty>
          ) : (
            <Table cols={[122, 116, 92, 180, 0, 196, 126, 84, 204]}>
              <thead>
                <tr>
                  <th>用例</th>
                  <th>组</th>
                  <th>优先级</th>
                  <th>描述</th>
                  <th>用户提问</th>
                  <th>判分要点</th>
                  <th>标签</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.case_id}>
                    <td className="mono">
                      {c.case_id}
                      {c.source?.type === 'derive' && (
                        <span
                          className="tag"
                          style={{ marginLeft: 4 }}
                          title={`派生自 ${c.source.from_case}${c.source.from_run ? `（运行 ${c.source.from_run}）` : ''}`}
                        >
                          派生
                        </span>
                      )}
                    </td>
                    <td>{groupLabel(c.grp)}</td>
                    <td className="hint">{priorityLabel(c.priority)}</td>
                    <td className="wrap">{c.desc || '—'}</td>
                    {/* 用户提问：弹性列原文展示，长文本换行，悬停看全文 */}
                    <td className="wrap" title={c.message}>{c.message || '—'}</td>
                    {/* 判分要点：维度徽标组合（如「忠实 · 完整(2 要点) · 风格」），列宽按完整展示取 196px */}
                    <td className="hint wrap">{judgeSummary(c.judge) || '—'}</td>
                    <td>
                      {c.tags.map((t) => (
                        <span key={t} className="tag" style={{ marginRight: 4 }}>{tagLabel(t)}</span>
                      ))}
                    </td>
                    <td>{c.enabled ? <Pill kind="ok">启用</Pill> : <Pill kind="plain">停用</Pill>}</td>
                    <td>
                      <button className="btn" style={{ marginRight: 4 }} onClick={() => setEditing(c)}>编辑</button>
                      <button className="btn" style={{ marginRight: 4 }} onClick={(e) => toggle(c, e)}>
                        {c.enabled ? '停用' : '启用'}
                      </button>
                      <button className={confirmDel === c.case_id ? 'btn btn-danger' : 'btn'} onClick={(e) => remove(c, e)}>
                        {confirmDel === c.case_id ? '确认删？' : '删除'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      {editing !== null && (
        <CaseEditor
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            toast('已保存')
            void load()
          }}
          onError={(m) => toast(m, 6000)}
        />
      )}
    </>
  )
}
