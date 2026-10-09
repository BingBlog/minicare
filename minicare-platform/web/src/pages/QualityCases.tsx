import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardBody, CardHead, ErrorBox, Loading, Notice, Pill, Table } from '../components/ui'
import { useApp } from '../lib/app-context'
import {
  caseStatusPill, CASE_STATUS_LABEL, CHUNK_STATE_LABEL, ENTRY_STATUS_LABEL,
  moduleLabel, qualityApi, RISK_LABEL,
  type QualityCaseEntry, type QualityCasesResponse, type QualityImportReport,
} from '../lib/quality'

/**
 * 页面：用例集（PRD-011 US-01 / US-02）—— 50 题三态标注与映射体检 · 导入/更新（两步式）。
 *
 * 数据 = `/api/quality/cases`（逐题含「条目 → 块」两层与块存活状态）。
 * 导入 = dry-run 报告（解析 + 体检 + diff）→ 确认写入（幂等 upsert）。
 */
export function QualityCasesPage() {
  const { toast, nonce, go } = useApp()
  const [data, setData] = useState<QualityCasesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // 导入面板状态（Excel 通道为主，旧路径通道收进折叠区兼容）
  const [panelOpen, setPanelOpen] = useState(false)
  const [excelFile, setExcelFile] = useState<File | null>(null)
  const [testsetPath, setTestsetPath] = useState('')
  const [mappingPath, setMappingPath] = useState('')
  const [report, setReport] = useState<QualityImportReport | null>(null)
  const [reportSrc, setReportSrc] = useState<'excel' | 'path'>('excel')
  const [busy, setBusy] = useState(false)
  const excelInputRef = useRef<HTMLInputElement>(null)

  // 筛选
  const [module, setModule] = useState('all')
  const [risk, setRisk] = useState('all')
  const [status, setStatus] = useState('all')
  const [enabledOnly, setEnabledOnly] = useState('all')
  const [q, setQ] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    qualityApi.cases()
      .then((d) => {
        if (!alive) return
        setData(d)
        setTestsetPath((cur) => cur || d.paths.testset)
        setMappingPath((cur) => cur || d.paths.mapping)
      })
      .catch((e) => alive && setLoadError((e as Error).message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [nonce])

  const reload = async () => {
    try {
      const d = await qualityApi.cases()
      setData(d)
    } catch (e) {
      toast(`刷新失败：${(e as Error).message}`, 6000)
    }
  }

  const shown = useMemo(() => {
    if (!data) return []
    return data.items.filter((it) => {
      if (module !== 'all' && it.module !== module) return false
      if (risk !== 'all' && it.risk !== risk) return false
      if (status !== 'all' && it.status !== status) return false
      if (enabledOnly === 'on' && !it.enabled) return false
      if (enabledOnly === 'off' && it.enabled) return false
      if (q.trim()) {
        const s = q.trim().toLowerCase()
        const blob = `${it.case_id} ${it.question} ${it.risk} ${(it.expect.key_info || '')}`.toLowerCase()
        if (!blob.includes(s)) return false
      }
      return true
    })
  }, [data, module, risk, status, enabledOnly, q])

  /* ── Excel 通道 ── */

  function pickExcel(f: File | null) {
    if (!f) {
      setExcelFile(null)
      setReport(null)
      return
    }
    if (!/\.xlsx$/i.test(f.name)) {
      toast('只接受 .xlsx 文件（用「下载 Excel 模板」或「导出当前用例集」得到的那个文件）', 7000)
      setExcelFile(null)
      return
    }
    if (f.size > 8 * 1048576) {
      toast('文件超过 8MB 上限——用例集文件通常几十 KB，请检查是否选错文件', 7000)
      setExcelFile(null)
      return
    }
    setExcelFile(f)
    setReport(null)
  }

  async function downloadTemplate() {
    try {
      await qualityApi.downloadTemplate()
    } catch (e) {
      toast(`模板下载失败：${(e as Error).message}`, 7000)
    }
  }

  async function exportCases() {
    try {
      await qualityApi.exportCases()
    } catch (e) {
      toast(`导出失败：${(e as Error).message}`, 7000)
    }
  }

  async function runDryExcel() {
    if (!excelFile) return
    setBusy(true)
    try {
      const r = await qualityApi.importExcel(excelFile, true)
      setReport(r)
      setReportSrc('excel')
    } catch (e) {
      toast(`解析失败：${(e as Error).message}`, 8000)
    } finally {
      setBusy(false)
    }
  }

  async function writeExcel() {
    if (!excelFile) return
    setBusy(true)
    try {
      const r = await qualityApi.importExcel(excelFile, false)
      setReport(r)
      if (r.written) {
        toast(`已写入：题目 ${r.testset.parsed} · 展开块 ${r.resolved_chunks}（映射体检可到页面查看）`)
        await reload()
      } else {
        toast('未写入：报告里还有需要修正的问题', 8000)
      }
    } catch (e) {
      toast(`写入失败：${(e as Error).message}`, 8000)
    } finally {
      setBusy(false)
    }
  }

  /* ── 路径通道（旧格式兼容）── */

  async function runDryPath() {
    setBusy(true)
    try {
      const r = await qualityApi.importDataset({
        testset_path: testsetPath, mapping_path: mappingPath, dry_run: true,
      })
      setReport(r)
      setReportSrc('path')
    } catch (e) {
      toast(`解析失败：${(e as Error).message}`, 8000)
    } finally {
      setBusy(false)
    }
  }

  async function writePath() {
    setBusy(true)
    try {
      const r = await qualityApi.importDataset({
        testset_path: testsetPath, mapping_path: mappingPath, dry_run: false,
      })
      setReport(r)
      toast(`已写入：题目 ${r.testset.parsed} · 展开块 ${r.resolved_chunks}（映射体检可到页面查看）`)
      await reload()
    } catch (e) {
      toast(`写入失败：${(e as Error).message}`, 8000)
    } finally {
      setBusy(false)
    }
  }

  /** 报告来自哪条通道，「确认写入」就走哪条 */
  function writeCurrent() {
    void (reportSrc === 'excel' ? writeExcel() : writePath())
  }

  const reportErrors = report?.errors || []

  async function toggleEnabled(caseId: string, next: boolean) {
    try {
      await qualityApi.updateCase(caseId, { enabled: next })
      setData((d) => (d ? { ...d, items: d.items.map((it) => (it.case_id === caseId ? { ...it, enabled: next } : it)) } : d))
      toast(next ? '已启用' : '已停用（不参与运行）')
    } catch (e) {
      toast(`操作失败：${(e as Error).message}`, 6000)
    }
  }

  if (loading && !data) return <Loading />
  if (loadError && !data) return <ErrorBox error={new Error(loadError)} />
  if (!data) return null

  const st = data.stats

  return (
    <>
      <Card>
        <CardHead title="用例集" />
        <CardBody>
          <div className="hint">
            题目按<b>三态标注</b>：<b>gold</b>（必命中）/ <b>acceptable</b>（命中不算错）/ <b>negative</b>（进 top-5 记有害）。
            标注的是 KB 条目，运行前经映射表展开为知识块；块失效/被排除会在这里体检出来。
          </div>
          {st.db_ok === false && <Notice>数据库不可达：{st.db_error}——块存活状态暂不可知（显示为「未知」）</Notice>}
          <div className="toolbar" style={{ margin: '10px 0 0' }}>
            <button type="button" className={`btn ${panelOpen ? '' : 'btn-primary'}`} onClick={() => setPanelOpen((v) => !v)}>
              {panelOpen ? '收起导入面板' : '导入 / 更新测试集'}
            </button>
            <span className="hint">改题目 / 标注 / 映射后重新导入即刷新（幂等，不会重复）</span>
          </div>
          {panelOpen && (
            <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 12, marginTop: 10 }}>
              <div className="toolbar" style={{ margin: '0 0 10px', rowGap: 6, flexWrap: 'wrap' }}>
                <button type="button" className="btn" onClick={() => void downloadTemplate()}>
                  下载 Excel 模板
                </button>
                <button type="button" className="btn" onClick={() => void exportCases()}>
                  导出当前用例集
                </button>
                <span className="hint">推荐先「导出当前用例集」——在导出的文件上维护，再导入即完成更新</span>
              </div>

              <div className="hint" style={{ marginBottom: 6 }}>
                第一步：选择 Excel 文件（含「测试集」「映射表」两个工作表）并解析体检（dry-run，不写入）
              </div>
              <div className="toolbar" style={{ margin: 0, rowGap: 6, flexWrap: 'wrap' }}>
                <input
                  ref={excelInputRef}
                  type="file"
                  accept=".xlsx"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    pickExcel(e.target.files?.[0] ?? null)
                    e.target.value = ''
                  }}
                />
                <button type="button" className="btn" onClick={() => excelInputRef.current?.click()}>
                  选择 Excel 文件…
                </button>
                {excelFile ? (
                  <span className="hint">
                    已选：<b>{excelFile.name}</b>（{(excelFile.size / 1024).toFixed(1)} KB）
                    <button
                      type="button"
                      className="btn btn-mini"
                      style={{ marginLeft: 6 }}
                      onClick={() => pickExcel(null)}
                    >
                      移除
                    </button>
                  </span>
                ) : (
                  <span className="hint">未选择文件（.xlsx，由「下载模板」或「导出当前用例集」得来）</span>
                )}
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void runDryExcel()}
                  disabled={busy || !excelFile}
                >
                  {busy ? '处理中…' : '解析并体检'}
                </button>
              </div>

              <details style={{ marginTop: 10 }}>
                <summary className="hint" style={{ cursor: 'pointer' }}>
                  兼容通道：按文件路径导入旧格式（表格 Markdown / JSON）
                </summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                  <label className="hint">测试集文件
                    <input style={{ width: '100%' }} value={testsetPath} onChange={(e) => setTestsetPath(e.target.value)} />
                  </label>
                  <label className="hint">映射表文件
                    <input style={{ width: '100%' }} value={mappingPath} onChange={(e) => setMappingPath(e.target.value)} />
                  </label>
                </div>
                <div className="toolbar" style={{ margin: '8px 0 0' }}>
                  <button type="button" className="btn" onClick={() => void runDryPath()} disabled={busy}>
                    {busy ? '处理中…' : '解析并体检（旧格式）'}
                  </button>
                </div>
              </details>

              {report && (
                <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.9 }}>
                  <div className="hint">
                    来源：{report.testset.path}｜映射：{report.mapping.path}（{report.mapping.format}）
                  </div>
                  <div>
                    <b>{report.written ? '已写入' : reportErrors.length ? '报告（有问题，未写入）' : '报告（未写入）'}</b>：
                    题目 {report.testset.parsed}（可评 {report.testset.answerable} + 负样本 {report.testset.out_of_scope}）
                    · 映射 {report.mapping.entries} 条目 / {report.mapping.chunks} 块
                    · 展开块 {report.resolved_chunks}
                    {report.tier_overlap > 0 ? `（跨层重叠去重 ${report.tier_overlap}）` : ''}
                  </div>
                  <div>
                    体检：正常 {report.health.ok} · 部分失效 {report.health.warn} · 全部失效 {report.health.blocked}
                    {report.health.blocked_cases.length > 0 ? `（${report.health.blocked_cases.join('、')}）` : ''}
                    ｜差异：新增 {report.diff.new} · 更新 {report.diff.updated} · 未变 {report.diff.unchanged}
                  </div>
                  {report.unmapped_entries.length > 0 && (
                    <div className="hint">未映射条目：{report.unmapped_entries.join('、')}</div>
                  )}
                  {reportErrors.length > 0 && (
                    <Notice>
                      <b>发现 {reportErrors.length} 处需要修正的问题（本次不会写入）：</b>
                      <div style={{ marginTop: 4 }}>
                        {reportErrors.map((msg, i) => (
                          <div key={i}>· {msg}</div>
                        ))}
                      </div>
                    </Notice>
                  )}
                  {report.warnings.map((w, i) => (
                    <Notice key={i}>{w}</Notice>
                  ))}
                  {!report.written && (
                    <div className="toolbar" style={{ margin: '8px 0 0' }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={writeCurrent}
                        disabled={busy || reportErrors.length > 0}
                      >
                        {busy ? '处理中…' : '确认写入'}
                      </button>
                      {reportErrors.length > 0 && <span className="hint">先修正上面列出的问题，再重新「解析并体检」</span>}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardBody>

        <CardBody>
          <div className="toolbar" style={{ margin: 0, flexWrap: 'wrap', rowGap: 6 }}>
            <label className="hint">模块
              <select value={module} onChange={(e) => setModule(e.target.value)}>
                <option value="all">全部</option>
                {Object.keys(st.by_module).sort().map((m) => (
                  <option key={m} value={m}>{moduleLabel(st, m)}（{st.by_module[m]}）</option>
                ))}
              </select>
            </label>
            <label className="hint">风险
              <select value={risk} onChange={(e) => setRisk(e.target.value)}>
                <option value="all">全部</option>
                <option value="emergency">高危</option>
                <option value="caution">注意</option>
                <option value="low">低</option>
              </select>
            </label>
            <label className="hint">映射
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="all">全部</option>
                <option value="ok">正常</option>
                <option value="warn">部分失效</option>
                <option value="blocked">全部失效</option>
              </select>
            </label>
            <label className="hint">状态
              <select value={enabledOnly} onChange={(e) => setEnabledOnly(e.target.value)}>
                <option value="all">全部</option>
                <option value="on">启用</option>
                <option value="off">停用</option>
              </select>
            </label>
            <input style={{ width: 200 }} placeholder="搜索题号 / 问题 / 要点" value={q} onChange={(e) => setQ(e.target.value)} />
            <span className="hint">显示 {shown.length} / {st.total} 题</span>
          </div>
        </CardBody>

        <CardBody flush>
          {/* 列宽注意：「排查」列 96 = td 左右 padding 24 + 按钮 ~62 + 余量（84 时曾差 2px 被 ellipsis 截成「检索测试 …」） */}
          <Table cols={[70, 0, 92, 66, 175, 100, 70, 96, 40]}>
            <thead>
              <tr>
                <th>题号</th>
                <th>问题</th>
                <th>模块</th>
                <th>风险</th>
                <th>标注</th>
                <th>映射</th>
                <th>启用</th>
                <th>排查</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((it) => {
                const g = it.entries.gold?.length || 0
                const a = it.entries.acceptable?.length || 0
                const n = it.entries.negative?.length || 0
                return (
                  <Fragment key={it.case_id}>
                    <tr onClick={() => setExpanded(expanded === it.case_id ? null : it.case_id)} style={{ cursor: 'pointer' }}>
                      <td className="mono">{it.case_id}</td>
                      <td className="wrap">{it.question}</td>
                      <td>{moduleLabel(st, it.module)}</td>
                      <td>
                        {it.case_type === 'out_of_scope'
                          ? <Pill kind="plain">库外</Pill>
                          : <Pill kind={it.risk === 'emergency' ? 'danger' : it.risk === 'caution' ? 'warn' : 'plain'}>{RISK_LABEL[it.risk] || it.risk}</Pill>}
                      </td>
                      <td className="hint">{it.case_type === 'out_of_scope' ? '—' : `必命中${g} · 可接受${a} · 有害${n}`}</td>
                      <td>
                        <Pill kind={caseStatusPill(it.status)}>{CASE_STATUS_LABEL[it.status] || it.status}</Pill>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={it.enabled}
                          onChange={(e) => toggleEnabled(it.case_id, e.target.checked)}
                          title={it.enabled ? '停用后不参与运行' : '启用'}
                        />
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {/* 单题排查直达：带着题面跳到「检索测试」自动跑一次（题面自动填入，无需手抄） */}
                        <button
                          type="button"
                          className="btn btn-mini"
                          title="带上这道题去「检索测试」跑一次（题面自动填入）"
                          onClick={() => go('retrievaltest', { query: { q: it.question, case: it.case_id } })}
                        >
                          检索测试
                        </button>
                      </td>
                      <td className="hint">{expanded === it.case_id ? '▾' : '▸'}</td>
                    </tr>
                    {expanded === it.case_id && (
                      <tr>
                        <td colSpan={9} style={{ background: 'var(--neutral-bg)' }}>
                          <div style={{ padding: '8px 6px', fontSize: 13, lineHeight: 1.9 }}>
                            {(['gold', 'acceptable', 'negative'] as const).map((tier) => {
                              const rows: QualityCaseEntry[] = it.entries[tier] || []
                              if (!rows.length) return null
                              return (
                                <div key={tier}>
                                  <b>{{ gold: 'gold（必命中）', acceptable: 'acceptable（命中不算错）', negative: 'negative（进 top5 记有害）' }[tier]}</b>
                                  {rows.map((e) => (
                                    <div key={e.code} style={{ marginLeft: 12 }}>
                                      <span className="mono">{e.code}</span>
                                      {e.name ? ` ${e.name}` : ''}
                                      {' '}
                                      {e.status !== 'ok' && <Pill kind={e.status === 'unmapped' ? 'warn' : 'danger'}>{ENTRY_STATUS_LABEL[e.status] || e.status}</Pill>}
                                      {e.chunks.length === 0 && <span className="hint">（映射表中没有该条目）</span>}
                                      {e.chunks.map((c) => (
                                        <div key={c.kb_id} style={{ marginLeft: 12 }} className="hint">
                                          → <span className="mono">{c.kb_id}</span> {c.title ? `· ${c.title}` : ''}
                                          {c.state !== 'enabled' && <span style={{ marginLeft: 6 }}>［{CHUNK_STATE_LABEL[c.state] || c.state}］</span>}
                                        </div>
                                      ))}
                                    </div>
                                  ))}
                                </div>
                              )
                            })}
                            {it.expect.key_info ? <div className="hint">关键要点：{it.expect.key_info}</div> : null}
                            {it.source !== 'seed' ? <div className="hint">来源：{it.source}</div> : null}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={9} className="hint">{st.total === 0 ? '还没有用例——点上方「导入 / 更新测试集」' : '没有匹配的题目'}</td>
                </tr>
              )}
            </tbody>
          </Table>
        </CardBody>
      </Card>
    </>
  )
}
