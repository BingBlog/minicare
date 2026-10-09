import { useState } from 'react'
import { api } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useAsync } from '../lib/use-async'
import type { MetaExtractGet } from '../lib/types'
import { Card, CardBody, CardHead, Empty, ErrorBox, Kpis, Loading, Notice, Pill, Table } from '../components/ui'

/** 置信度 → 徽标：高可信 / 需人工看一眼 / 低可信 */
function confPill(c: number | undefined) {
  const v = c ?? 0
  if (v >= 0.85) return <Pill kind="ok">{v.toFixed(2)}</Pill>
  if (v >= 0.6) return <Pill kind="warn">{v.toFixed(2)}</Pill>
  return <Pill kind="plain">{v.toFixed(2)}</Pill>
}

function renderValue(v: unknown): { text: string; empty: boolean } {
  if (v === null || v === undefined || v === '') return { text: '未抽到', empty: true }
  if (Array.isArray(v)) {
    if (!v.length) return { text: '未抽到', empty: true }
    return { text: v.join('、'), empty: false }
  }
  return { text: String(v), empty: false }
}

/**
 * 页签「元信息解析与确认」· 下半区（机器解析）—— 由 `Meta.tsx` 组装渲染。
 *
 * 原独立页签「元信息解析」，2026-10-09 与「信息确认」合并：抽取结果的唯一去路本来就是
 * 以**候选值**形式回灌给上方确认表单，拆成两页反而要在两处来回切换。
 *
 * 两条必须如实体现在界面上的事（不改）：
 *   1. 结果来自 **LLM** 还是**规则降级**（无 key / 调用失败时是后者，且不应被误认为 LLM 产出）；
 *   2. 喂给模型的是**有界摘要**（标题树 + 正文前 N 字），长文档尾部可能漏抽 ——
 *      所以要把"喂了多少、是否截断"显示出来。
 *
 * 抽取 / 重新归纳完成后，除本区自刷新（`setLocal`）外还会通过 `onAfterRun` 通知父组件 ——
 * 上方表单的候选值只有在抽取跑过之后才会出现「LLM」来源，两边必须一起更新。
 */
export function MetaExtractDoc({ doc, onAfterRun }: { doc: string; onAfterRun?: () => void }) {
  const { toast, nonce } = useApp()
  const { data, error, loading } = useAsync<MetaExtractGet | null>(
    () => api.metaExtract(doc),
    [doc, nonce],
  )
  const [busy, setBusy] = useState<'' | 'induce' | 'extract'>('')
  /** 本地覆盖：跑完不必整页重取 */
  const [local, setLocal] = useState<MetaExtractGet | null>(null)
  const view = local && local.doc_id === doc ? local : data

  if (loading && !view) return <Loading />
  if (error && !view) return <ErrorBox error={error} />
  if (!view) return null

  const { schema, llm, result } = view
  const values = result?.values ?? {}
  const filled = schema.fields.filter((f) => {
    const v = values[f.key]?.value
    return Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && v !== ''
  }).length

  async function induce() {
    setBusy('induce')
    toast(
      <>
        <span className="spin" /> 正在让 LLM 归纳 schema（要看若干份文档样本，约 30-60 秒）…
      </>,
      120000,
    )
    try {
      const r = await api.induceMetadataSchema()
      toast(`Schema 已由 LLM 重新归纳：${r.schema.fields.length} 个字段`)
      setLocal(await api.metaExtract(doc))
      onAfterRun?.()
    } catch (e) {
      toast(`归纳失败：${(e as Error).message}`, 12000)
    } finally {
      setBusy('')
    }
  }

  async function extract(force: boolean) {
    setBusy('extract')
    toast(
      <>
        <span className="spin" /> 正在抽取元信息…
      </>,
      120000,
    )
    try {
      const r = await api.runMetaExtract(doc, force)
      const w = (r.result?.stats?.warnings as string[]) || []
      toast(
        `抽取完成 · 来源 ${r.result.source} · 命中 ${Object.values(r.result.values).filter((v) => {
          const x = v.value
          return Array.isArray(x) ? x.length > 0 : x !== null && x !== ''
        }).length}/${schema.fields.length}${w.length ? ` · ${w.join('；')}` : ''}`,
        w.length ? 12000 : 4200,
      )
      setLocal(await api.metaExtract(doc))
      onAfterRun?.()
    } catch (e) {
      toast(`抽取失败：${(e as Error).message}`, 12000)
    } finally {
      setBusy('')
    }
  }

  return (
    <>
      {!llm.available ? (
        <Notice>
          <b>LLM 不可用：未设置 {llm.env_var}。</b>
          <div style={{ marginTop: 4 }}>
            本次若执行抽取，走的会是<b>规则降级</b>（文件名规则 + 正文抽取 + 词典命中），
            字段值会比 LLM 少很多、置信度也更低。把它写进 <code>minicare-platform/api/.env</code> 后即可启用
            LLM 抽取（模型 <code>{llm.model}</code>）。
          </div>
        </Notice>
      ) : null}

      {result && result.source === 'rule' ? (
        <Notice>
          <b>本份结果是规则降级产出，不是 LLM 抽取。</b>
          界面上把它标出来，是为了避免把规则结果当成模型输出使用。
          配置 {llm.env_var} 后点「重新抽取」即可走 LLM 路径。
        </Notice>
      ) : null}

      <Kpis
        items={[
          ['Schema 字段', schema.fields.length, '个'],
          ['已抽到', filled, `/${schema.fields.length}`],
          ['结果来源', result?.source === 'llm' ? 'LLM' : result ? '规则降级' : '未抽取', ''],
          ['Schema 来源', schema.source === 'llm' ? 'LLM 归纳' : '内置默认', ''],
        ]}
      />

      <Card>
        <CardHead
          title="语料级共享 Schema"
          meta={
            <>
              {schema.source === 'llm' ? <Pill kind="ok">LLM 归纳</Pill> : <Pill kind="plain">内置默认</Pill>}{' '}
              · {schema.fields.length} 字段 · {schema.created_at?.replace('T', ' ').slice(0, 19)}
              {schema.model ? ` · ${schema.model}` : ''}
              {schema.sample_docs?.length ? ` · 样本 ${schema.sample_docs.length} 份` : ''}
            </>
          }
        />
        <CardBody>
          <div className="hint">
            全库共用同一套字段，因此可以<b>跨文档横向比较</b>，也能直接拿去设检索过滤/权重。
            <code>必要</code> 列标红的是台账必填项（年份 / 地区 / 证据级别）。
            {schema.note ? <div style={{ marginTop: 4 }}>归纳说明：{schema.note}</div> : null}
          </div>
          <div className="toolbar" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-primary" disabled={!!busy} onClick={induce}>
              {busy === 'induce' ? '归纳中…' : '让 LLM 重新归纳 Schema'}
            </button>
            {result ? (
              <button type="button" className="btn" disabled={!!busy} onClick={() => extract(true)}>
                {busy === 'extract' ? '抽取中…' : '重新抽取本文档'}
              </button>
            ) : (
              <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => extract(false)}>
                {busy === 'extract' ? '抽取中…' : '抽取本文档元信息'}
              </button>
            )}
            <span className="hint" style={{ marginLeft: 'auto' }}>
              重新归纳会覆盖 <code>data/llm/metadata_schema.json</code>（全库共用，请谨慎）
            </span>
          </div>
        </CardBody>
        <details className="fold">
          <summary>查看字段定义（键名 / 类型 / 给模型的抽取提示）</summary>
          {/* 列宽：key 230（最长 contraindicated_populations 27 字符 mono ≈ 219）、名称 140、
              类型 130 + wrap（长枚举列表按 ' / ' 断行）；总宽 1220 ≤ 内容最小宽 1238 */}
          <Table cols={[230, 140, 130, 80, 640]}>
            <thead>
              <tr>
                <th>key</th>
                <th>名称</th>
                <th>类型</th>
                <th>必填</th>
                <th>说明 / 抽取提示</th>
              </tr>
            </thead>
            <tbody>
              {schema.fields.map((f) => (
                <tr key={f.key}>
                  <td className="mono">{f.key}</td>
                  <td>{f.label}</td>
                  {/* 枚举值以 ' / ' 连接：配合 .wrap 的换行能力，长枚举列表逐值断行而非被截断 */}
                  <td className="mono wrap">
                    {f.type}
                    {f.values?.length ? <span className="hint"> ({f.values.join(' / ')})</span> : null}
                  </td>
                  <td>{f.required ? <Pill kind="danger">必要</Pill> : null}</td>
                  <td className="wrap" style={{ color: 'var(--text-2)' }}>
                    {f.desc}
                    {f.hint ? <div className="hint">{f.hint}</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </details>
      </Card>

      <Card>
        <CardHead
          title="抽取结果"
          meta={
            result ? (
              <>
                {result.source === 'llm' ? <Pill kind="ok">LLM</Pill> : <Pill kind="warn">规则降级</Pill>} ·{' '}
                {result.extracted_at?.replace('T', ' ').slice(0, 19)} · 命中 {filled}/{schema.fields.length}
                {result.brief
                  ? ` · 喂入 ${result.brief.chars.toLocaleString()} 字${result.brief.truncated ? '（已截断）' : ''}`
                  : ''}
              </>
            ) : null
          }
        />
        {result ? (
          <CardBody flush>
            {result.brief?.truncated ? (
              <div style={{ padding: '10px 14px 0' }}>
                <Notice>
                  本次只喂了<b>标题树 + 正文前 {result.brief.chars.toLocaleString()} 字</b>
                  （上限 {result.brief.max_chars.toLocaleString()}），文档更长，<b>尾部内容未参与抽取</b> ——
                  若某字段应是空、你却在正文后段看到了，调大 <code>metadata.llm_brief_chars</code> 后重抽。
                </Notice>
              </div>
            ) : null}
            {/* 字段列 180：label + key 小字（最长 contraindicated_populations ≈ 149px），150 时 key 行被截 */}
            <Table cols={[180, 300, 76, 78, 456]}>
              <thead>
                <tr>
                  <th>字段</th>
                  <th>值</th>
                  <th>置信度</th>
                  <th>来源</th>
                  <th>原文证据</th>
                </tr>
              </thead>
              <tbody>
                {schema.fields.map((f) => {
                  const v = values[f.key]
                  const rv = renderValue(v?.value)
                  return (
                    <tr key={f.key}>
                      <td>
                        {f.label}
                        <div className="hint" style={{ fontSize: 11 }}>
                          {f.key}
                        </div>
                      </td>
                      <td className="wrap" style={rv.empty ? { color: 'var(--text-3)' } : undefined}>
                        {rv.text}
                      </td>
                      <td>{rv.empty ? <span className="hint">—</span> : confPill(v?.confidence)}</td>
                      <td>
                        {v?.source === 'rule' ? <Pill kind="warn">规则</Pill> : <Pill kind="ok">LLM</Pill>}
                      </td>
                      <td className="wrap" style={{ color: 'var(--text-2)' }}>
                        {v?.evidence || <span className="hint">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          </CardBody>
        ) : (
          <CardBody>
            <Empty title="还没有抽取结果">
              点上方「抽取本文档元信息」开始。抽取只读文档内容，<b>不会写台账、不影响切片与检索</b>；
              抽到的值会自动出现在上方「信息确认」的候选里。
            </Empty>
          </CardBody>
        )}
      </Card>
    </>
  )
}
