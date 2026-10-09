/**
 * 页面：测评裁判（TECH-021 §6.4 + TECH-022 B6）
 *
 * 裁判 = 判分执行者（llm：prompt 模板 + 模型 + 温度）；与维度 1:1 绑定。
 * 运行时由平台物化为 `judges.json` 注入 harness（改 prompt 即改判分标准，无需改代码）。
 * 「试跑」：用当前裁判配置对历史回答重新判分（不跑 agent、不写台账）——校准闭环的最小入口。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Card, CardBody, CardHead, ErrorBox, Loading, Pill, Table } from '../components/ui'
import { Modal } from '../components/Modal'
import { JudgeCard } from '../components/eval/JudgeDetails'
import { useApp } from '../lib/app-context'
import {
  agentEvalApi, dimKeyOfJudge, JUDGE_KEY_LABEL,
  type EvalCase, type EvalDimension, type EvalJudge, type EvalRejudgeResult,
} from '../lib/agentEval'

const INPUT: CSSProperties = {
  padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 6,
  fontSize: 13, background: 'var(--surface)', color: 'var(--text)', width: '100%',
  boxSizing: 'border-box',
}

export function AgentEvalJudgesPage() {
  const { toast, go, nonce } = useApp()
  const [items, setItems] = useState<EvalJudge[] | null>(null)
  const [dims, setDims] = useState<EvalDimension[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<EvalJudge | null>(null)
  const [trying, setTrying] = useState<EvalJudge | null>(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      const [j, d] = await Promise.all([agentEvalApi.listJudges(), agentEvalApi.listDimensions()])
      setItems(j.items)
      setDims(d.items)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, nonce])

  if (error) return <ErrorBox error={new Error(error)} />
  if (!items) return <Loading />

  const dimName = (id: string) => dims.find((d) => d.dim_id === id)?.name || id

  return (
    <>
      <Card>
        <CardHead
          title="测评裁判"
          meta={<span className="hint">每个维度绑定一个裁判；「试跑」= 用当前提示词重判历史回答，验证判分行为</span>}
        />
        <CardBody flush>
          <Table cols={[150, 130, 160, 80, 0, 70, 140]}>
            <thead>
              <tr>
                <th>裁判</th>
                <th>绑定维度</th>
                <th>模型</th>
                <th>温度</th>
                <th>判分标准（提示词摘要）</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((j) => (
                <tr key={j.judge_id}>
                  <td>
                    <div className="mono">{j.judge_id}</div>
                    <div className="hint">{j.name}</div>
                  </td>
                  <td>{dimName(j.dim_id)}</td>
                  <td className="mono hint">{j.model || '—'}</td>
                  <td className="num hint">{j.temperature}</td>
                  <td className="wrap hint">{(j.prompt || '').split('\n')[0].slice(0, 60)}…</td>
                  <td>{j.enabled ? <Pill kind="ok">启用</Pill> : <Pill kind="plain">停用</Pill>}</td>
                  <td>
                    <button className="btn" style={{ marginRight: 4 }} onClick={() => setTrying(j)}>试跑</button>
                    <button className="btn" onClick={() => setEditing(j)}>编辑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardBody>
      </Card>

      {editing && (
        <JudgeEditor
          initial={editing}
          dimLabel={dimName(editing.dim_id)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            toast('已保存（下一次运行生效）')
            void load()
          }}
          onError={(m) => toast(m, 6000)}
        />
      )}

      {trying && (
        <TryJudgeModal
          judge={trying}
          onClose={() => setTrying(null)}
          onOpenRun={(runId) => {
            setTrying(null)
            go('agenteval', { doc: runId })
          }}
        />
      )}
    </>
  )
}

/* ── 试跑弹窗（TECH-022 B6）───────────────────────────────────────── */

function TryJudgeModal({
  judge, onClose, onOpenRun,
}: {
  judge: EvalJudge
  onClose: () => void
  onOpenRun: (runId: string) => void
}) {
  const dimKey = dimKeyOfJudge(judge)
  const [cases, setCases] = useState<EvalCase[] | null>(null)
  const [caseId, setCaseId] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<EvalRejudgeResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [startedAt, setStartedAt] = useState(0)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    let live = true
    agentEvalApi.listCases()
      .then((r) => {
        if (!live) return
        // 只有配置了该维度判分的用例才可试跑（与 harness 分发逻辑一致）
        const candidates = r.items.filter((c) => c.judge && Boolean((c.judge as Record<string, unknown>)[dimKey]))
        setCases(candidates)
        if (candidates.length) setCaseId(candidates[0].case_id)
      })
      .catch((e) => live && setErr((e as Error).message))
    return () => { live = false }
  }, [dimKey])

  // 计时器：判分调用可能 10~60s，让用户看到"在跑"
  useEffect(() => {
    if (!busy) return
    const t = window.setInterval(() => setElapsed(Date.now() - startedAt), 500)
    return () => window.clearInterval(t)
  }, [busy, startedAt])

  const run = async () => {
    if (!caseId) return
    setBusy(true)
    setErr(null)
    setResult(null)
    setStartedAt(Date.now())
    setElapsed(0)
    try {
      const r = await agentEvalApi.tryJudge(judge.judge_id, caseId)
      setResult(r)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const currentCase = useMemo(() => cases?.find((c) => c.case_id === caseId), [cases, caseId])

  return (
    <Modal
      title={`裁判试跑 · ${judge.name}`}
      subtitle="用当前裁判配置对历史回答重新判分（不重跑智能体、不写台账）"
      onClose={onClose}
      width={820}
    >
      {!cases ? (
        <div className="hint">加载用例…</div>
      ) : cases.length === 0 ? (
        <div className="hint">
          没有用例配置「{JUDGE_KEY_LABEL[dimKey] || dimKey}」判分——试跑无从判起。可到「测评用例」页给相关用例补上该判分要点。
        </div>
      ) : (
        <>
          <div className="toolbar" style={{ margin: 0, flexWrap: 'wrap', rowGap: 8 }}>
            <span className="hint">用例</span>
            <select
              style={{ ...INPUT, width: 380 }}
              value={caseId}
              onChange={(e) => setCaseId(e.target.value)}
              disabled={busy}
            >
              {cases.map((c) => (
                <option key={c.case_id} value={c.case_id}>
                  {c.case_id} · {c.desc || c.message.slice(0, 24)}
                </option>
              ))}
            </select>
            <button className="btn btn-primary" onClick={run} disabled={busy || !caseId}>
              {busy ? `判分中… ${Math.round(elapsed / 1000)}s` : '开始试跑'}
            </button>
            {busy && <span className="hint">调用裁判模型判分，约 10~60 秒</span>}
          </div>
          {currentCase && (
            <div className="hint" style={{ marginTop: 8 }}>
              问答对：{currentCase.message}
            </div>
          )}

          {err && <div className="ce-err" style={{ marginTop: 10 }}>{err}</div>}

          {result && (
            <div style={{ marginTop: 14 }}>
              <div className="hint" style={{ marginBottom: 6 }}>
                来源回答：运行 <span className="mono">{result.source_run_id}</span>
                <button className="btn btn-mini" style={{ marginLeft: 8 }} onClick={() => onOpenRun(result.source_run_id)}>
                  查看来源运行
                </button>
              </div>
              <div className="try-grid">
                <div>
                  <div className="ce-label hint">历史判分（该轮当时的提示词）</div>
                  {result.prev ? (
                    <JudgeCard k={dimKey} v={result.prev} />
                  ) : (
                    <div className="hint">该轮未对该用例判分（可能 judge 关闭）</div>
                  )}
                </div>
                <div>
                  <div className="ce-label hint">本次判分（当前提示词）</div>
                  {result.judge ? (
                    <JudgeCard k={dimKey} v={result.judge} />
                  ) : (
                    <div className="hint">未产出判分结果</div>
                  )}
                </div>
              </div>
              {result.prev && result.judge
                && (result.prev.pass !== result.judge.pass) && (
                <div className="hint" style={{ marginTop: 8 }}>
                  ⚠ 判分结论发生变化（{result.prev.pass ? '通过 → 未通过' : '未通过 → 通过'}）——提示裁判口径或回答表现有差异
                </div>
              )}
            </div>
          )}

          {!result && !busy && !err && (
            <div className="hint" style={{ marginTop: 10 }}>
              说明：取该用例最近一轮（或指定轮）的**已有回答**交给当前裁判重判；
              改完提示词后不用整轮重跑即可验证判分行为。
            </div>
          )}
        </>
      )}
    </Modal>
  )
}

/* ── 裁判编辑（既有）──────────────────────────────────────────────── */

function JudgeEditor({
  initial, dimLabel, onClose, onSaved, onError,
}: {
  initial: EvalJudge
  dimLabel: string
  onClose: () => void
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const [prompt, setPrompt] = useState(initial.prompt ?? '')
  const [model, setModel] = useState(initial.model ?? 'deepseek-v4-pro')
  const [temperature, setTemperature] = useState(initial.temperature ?? 0)
  const [enabled, setEnabled] = useState(initial.enabled)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!prompt.trim()) return onError('prompt 不能为空')
    setSaving(true)
    try {
      await agentEvalApi.updateJudge(initial.judge_id, { prompt, model, temperature, enabled })
      onSaved()
    } catch (e) {
      onError(`保存失败：${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`编辑裁判 · ${initial.judge_id}`}
      subtitle={`绑定维度：${dimLabel} · 改动在下一次运行生效（也可用「试跑」立即验证）`}
      onClose={onClose}
      width={860}
    >
      <div className="hint" style={{ marginBottom: 4 }}>判分标准（系统提示词）</div>
      <textarea
        style={{ ...INPUT, minHeight: 260, fontFamily: 'var(--font-mono, monospace)', lineHeight: 1.6 }}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0 16px', marginTop: 10 }}>
        <div>
          <div className="hint" style={{ marginBottom: 4 }}>裁判模型</div>
          <input style={INPUT} value={model} onChange={(e) => setModel(e.target.value)} />
        </div>
        <div>
          <div className="hint" style={{ marginBottom: 4 }}>温度</div>
          <input
            style={INPUT}
            type="number"
            min={0}
            max={1}
            step={0.1}
            value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value))}
          />
        </div>
        <div>
          <div className="hint" style={{ marginBottom: 4 }}>状态</div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, lineHeight: '32px' }}>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            启用
          </label>
        </div>
      </div>
      <div className="toolbar" style={{ margin: '14px 0 0' }}>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </button>
        <button className="btn" onClick={onClose}>取消</button>
      </div>
    </Modal>
  )
}
