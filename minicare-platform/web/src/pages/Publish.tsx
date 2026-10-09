import { useState } from 'react'
import { api } from '../lib/api'
import { useApp } from '../lib/app-context'
import { REGION_LABEL } from '../lib/labels'
import { UPLOAD_MODAL_ID } from '../nav'
import { useAsync } from '../lib/use-async'
import type { CheckItem, PlanReason, PublishPlan, PublishState } from '../lib/types'
import { Card, CardBody, CardHead, DocPill, Empty, ErrorBox, Loading, Notice, Pill, Table } from '../components/ui'

type Go = ReturnType<typeof useApp>['go']

/**
 * 页面：发布上线（US-10）
 *
 * 2026-10-09 重构（用户要求）：发布范围**只含「已就绪」的文档** ——
 *   · 上方「可发布文档」= 跑完「索引」步、元数据完整、无未决复核项的文档，即本次发布目标；
 *   · 下方「暂不可发布」逐份说明原因并给出修复入口，**不拦发布**；
 *   · 只要有可发布内容，「生成快照并发布」就能执行（按文档增量，PRD D-17）。
 *
 * 数据源 = `POST /api/publish/plan`（就绪分组与检查）+ `/api/publish/state`（快照）。
 * ⚠️ 不要退回"拿总览全部文档当发布范围"的旧写法 —— 那样任何一份未就绪文档都会把发布拦下。
 */
export function PublishPage() {
  const { go, toast, nonce } = useApp()
  const [force, setForce] = useState(false)

  const { data, error, loading } = useAsync<{ state: PublishState; plan: PublishPlan }>(async () => {
    const [state, plan] = await Promise.all([api.publishState(), api.publishPlan()])
    return { state, plan }
  }, [nonce])

  if (loading && !data) return <Loading />
  if (error) return <ErrorBox error={error} />
  if (!data) return null

  const { state, plan } = data
  const ready = plan.ready || []
  const blocked = plan.blocked || []
  const checks = plan.checks || []
  const docIds = ready.map((r) => r.doc_id)
  const chunkTotal = plan.counts?.ready_chunks ?? ready.reduce((a, r) => a + (r.chunks || 0), 0)
  const blockers = checks.filter((c) => c.status === 'fail')
  /** 未执行 = 数据不足（绝不假装通过）：不拦发布，但同样给出「怎么让它跑起来」的指引 */
  const notRun = checks.filter((c) => c.status === 'not_executed')

  async function doPublish() {
    if (!docIds.length) {
      toast('当前没有可发布的文档 —— 原因见下方「暂不可发布」', 6000)
      return
    }
    try {
      const r = await api.publishRun(docIds, force)
      if (!r.ok) {
        toast(`已拦下：${(r.blockers || []).map((b) => b.label).join('、')}`, 8000)
        return
      }
      toast(`发布计划已生成 · 快照 ${r.snapshot?.name || ''}`)
      go('publish', { refresh: true })
    } catch (e) {
      toast(`失败：${(e as Error).message}`, 8000)
    }
  }

  async function doSnapshot() {
    try {
      const s = await api.publishSnapshot('手动快照')
      toast(`快照 ${s.name}：${s.chunks} 切片`)
      go('publish', { refresh: true })
    } catch (e) {
      toast(`失败：${(e as Error).message}`, 8000)
    }
  }

  async function rollback(name: string) {
    if (!window.confirm(`确认回滚到 ${name}？该操作会覆盖目标库现有切片`)) return
    try {
      const r = await api.publishRollback(name)
      toast(
        r.ok ? `已恢复 ${r.restored_chunks} 切片（${r.match ? '与快照一致' : '⚠ 不一致'}）` : `回滚失败：${r.message}`,
        8000,
      )
      go('publish', { refresh: true })
    } catch (e) {
      toast(`失败：${(e as Error).message}`, 8000)
    }
  }

  return (
    <>
      <Notice>
        <b>发布范围 = 已就绪的文档</b>：跑完「索引」步、必填元数据完整、无未决复核项的文档才会
        进入下方发布列表；其余文档逐份说明原因，<b>不拦发布</b> —— 只要有可发布内容就能执行。
        本环境不真正写库：发布流程会跑完整检查、生成快照并留档，写入动作待迁移 021 落地后由 CLI
        执行。检查项数据不足时记「未执行」，<b>不会假装通过</b>。
      </Notice>

      <Card>
        <CardHead
          title="可发布文档"
          meta={
            <>
              {ready.length} 份 · 共 {chunkTotal} 切片 · 目标 {plan.target?.db_name || 'dev'}
            </>
          }
        />
        <CardBody flush>
          {ready.length ? (
            <Table cols={[0, 90, 90]}>
              <thead>
                <tr>
                  <th>文档</th>
                  <th>地区</th>
                  <th className="num">切片</th>
                </tr>
              </thead>
              <tbody>
                {ready.map((r) => (
                  <tr key={r.doc_id}>
                    <td className="mono">
                      <b
                        className="link"
                        title={`${r.doc_id} —— 打开工作台「入库结果」`}
                        onClick={() => go('source', { doc: r.doc_id, tab: 'indexresult' })}
                      >
                        {r.doc_id}
                      </b>
                    </td>
                    <td>{REGION_LABEL[r.region] || r.region}</td>
                    <td className="num">{r.chunks}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <Empty title="暂无已就绪的文档">
              文档跑完「索引」步（且无失败、无待重跑、元数据完整、无未决复核项）后出现在这里；
              其余文档的原因见下方「暂不可发布」。
            </Empty>
          )}
        </CardBody>
        <CardBody>
          <div className="toolbar" style={{ margin: 0 }}>
            <button type="button" className="btn btn-primary" onClick={doPublish} disabled={!docIds.length}>
              生成快照并发布（{docIds.length} 份）
            </button>
            <button type="button" className="btn" onClick={doSnapshot}>
              只生成快照
            </button>
            <label className="chk">
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />{' '}
              检查未通过也放行（留痕）
            </label>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHead
          title="发布前检查"
          meta={
            <>
              {blockers.length ? (
                <span className="pill danger">{blockers.length} 项未通过</span>
              ) : (
                <span className="pill ok">{notRun.length ? '无未通过项' : '全部通过'}</span>
              )}{' '}
              {notRun.length ? <span className="pill warn">{notRun.length} 项未执行</span> : null}
              {' '}· 发布范围 {docIds.length} 份文档
            </>
          }
        />
        <CardBody flush>
          <table className="tbl">
            <tbody>
              {checks.map((c: CheckItem, i: number) => (
                <tr key={c.key || i}>
                  <td style={{ width: 200 }}>
                    {mark(c.status)} {c.label}
                  </td>
                  <td className="hint wrap">
                    {c.detail}
                    {c.status !== 'pass' ? (
                      <FixBlock guide={fixGuide(c)} go={go} danger={c.status === 'fail'} />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>

      <Card>
        <CardHead title="暂不可发布" meta={`${blocked.length} 份 · 修复后自动进入发布范围`} />
        <CardBody flush>
          {blocked.length ? (
            <table className="tbl">
              <tbody>
                {blocked.map((b) => (
                  <tr key={b.doc_id}>
                    <td className="wrap" style={{ width: 320 }}>
                      <div className="mono" style={{ wordBreak: 'break-all' }}>
                        {b.doc_id}
                      </div>
                      <div style={{ marginTop: 3 }}>
                        <DocPill status={b.status} />
                      </div>
                    </td>
                    <td className="hint wrap">
                      {(b.reasons || []).map((r, i) => (
                        <div
                          key={`${r.code}:${i}`}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}
                        >
                          <span>{r.label}</span>
                          {r.page ? (
                            <button
                              type="button"
                              className="btn"
                              title={`${r.label} —— ${FIX_LABEL[r.page] || '去修复'}`}
                              onClick={jumpFor(go, r, b.doc_id)}
                            >
                              {FIX_LABEL[r.page] || '去修复'}
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty title="全部文档都已就绪" />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHead title="快照" meta={`${(state.snapshots || []).length} 个`} />
        <CardBody flush>
          {/* 创建时间列 216：ISO 串（2026-10-09T18:55:56+08:00，25 字符 mono ≈ 205px）曾因 180 列宽被截 */}
          {(state.snapshots || []).length ? (
            <Table cols={[0, 216, 90, 100]}>
              <thead>
                <tr>
                  <th>快照</th>
                  <th>创建时间</th>
                  <th className="num">切片</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {state.snapshots.map((s) => (
                  <tr key={s.name}>
                    <td className="mono">{s.name}</td>
                    <td className="mono">{s.created_at}</td>
                    <td className="num">{s.chunks}</td>
                    <td>
                      <button type="button" className="btn" onClick={() => rollback(s.name)}>
                        回滚到此
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <Empty title="还没有快照">发布前会自动生成。</Empty>
          )}
        </CardBody>
      </Card>
    </>
  )
}

function mark(status: string) {
  return status === 'pass' ? (
    <Pill kind="ok">✔</Pill>
  ) : status === 'fail' ? (
    <Pill kind="danger">✘</Pill>
  ) : (
    <Pill kind="plain">·</Pill>
  )
}

/* ── 「暂不可发布」原因 → 修复跳转 ─────────────────────────────────────
   跳转一律走 `go()`：
   · `corpus`  —— 去「文档管理」让该文档把流水线跑完 / 重跑到最新（卡片上有对应按钮）；
   · `meta` / `numbers` —— 工作台页签 id，路由会翻译成 `page=source&tab=…`，须带上该文档。 */
const FIX_LABEL: Record<string, string> = {
  corpus: '去「文档管理」',
  meta: '去「元信息解析与确认」',
  numbers: '去「解析高危敏感信息复核」',
}

function jumpFor(go: Go, r: PlanReason, docId: string): () => void {
  if (r.page === 'meta' || r.page === 'numbers') return () => go(r.page!, { doc: docId })
  return () => go('corpus')
}

/* ── 未通过 / 未执行检查项的「操作指引 + 跳转」───────────────────────────
   背景：检查项原来只有一行结论（"缺项文档 1 份"），用户不知道下一步去哪。
   现在每个非 pass 项都给出：① 一句话说明怎么修；② 直跳修复位置的按钮。
   · 逐份跳转的文档清单来自后端结构化字段 `docs`（detail 里只有计数/前 3 份）；
   · 跳转一律走 `go()`（工作台页签 id 会被路由翻译成 `page=source&tab=…`）。 */

interface FixGuide {
  advice: string
  links: { label: string; title: string; page: string; doc?: string; modal?: string }[]
}

function FixBlock({ guide, go, danger }: { guide: FixGuide | null; go: Go; danger: boolean }) {
  if (!guide) return null
  return (
    <div className={`fixg${danger ? ' danger' : ''}`}>
      <div className="adv">
        <b>操作指引</b>
        {guide.advice}
      </div>
      {guide.links.length ? (
        <div className="acts">
          {guide.links.map((l) => (
            <button
              key={`${l.page}:${l.doc ?? l.modal ?? ''}:${l.label}`}
              type="button"
              className="btn"
              title={l.title}
              onClick={() => go(l.page, { doc: l.doc, modal: l.modal })}
            >
              {l.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** 检查项 key → 指引。只在「未通过 / 未执行」时被调用；未知 key 返回 null（只显示原文案）。 */
function fixGuide(c: CheckItem): FixGuide | null {
  const docs = c.docs ?? []
  const more = (c.docs_total ?? docs.length) - docs.length
  const tail = more > 0 ? `（仅列前 ${docs.length} 份，其余 ${more} 份同法处理）` : ''
  const perDoc = (page: string, doing: string) =>
    docs.map((d) => ({ label: d, title: `${doing}：${d}`, page, doc: d }))

  switch (c.key) {
    case 'meta_complete':
      return c.status === 'fail'
        ? {
            advice:
              '到该文档工作台「元信息解析与确认」补齐必填元数据（年份 / 地区 / 证据级别）并保存；' +
              '机器未识别到的项需人工填写。保存会让「切块」及下游过期，重跑一遍即把修正值带进切片。' + tail,
            links: perDoc('meta', '去「元信息解析与确认」补齐'),
          }
        : {
            advice:
              '台账尚无任何登记 —— 先「上传新文档」完成登记；' +
              '若已登记过仍显示此状态，检查 .env 的数据库配置是否生效。',
            links: [
              {
                label: '去「文档管理」上传登记',
                title: '打开上传弹框',
                page: 'corpus',
                modal: UPLOAD_MODAL_ID,
              },
            ],
          }
    case 'no_red_flags':
      return c.status === 'fail'
        ? {
            advice:
              '到该文档工作台「解析高危敏感信息复核」把未决项逐条处理（采纳 / 手动填值 / 判误报 / 标记无法补全），' +
              '处理完回本页刷新复检。' + tail,
            links: perDoc('numbers', '去「解析高危敏感信息复核」处理'),
          }
        : {
            advice: '还没有可校验的复核产物 —— 到「文档管理」把各文档的流水线跑到「解析高危敏感信息复核」步。',
            links: [{ label: '去「文档管理」', title: '查看各文档处理状态', page: 'corpus' }],
          }
    case 'excludes_confirmed':
      return c.status === 'not_executed'
        ? {
            advice:
              '还没有切块产物 —— 先到「文档管理」跑流水线到「切块」步；' +
              '误屏蔽的块可在「已屏蔽内容」里恢复。',
            links: [{ label: '去「文档管理」', title: '查看各文档处理状态', page: 'corpus' }],
          }
        : null
    case 'regression_pass':
      return c.status === 'fail'
        ? {
            advice:
              'Recall 低于门槛 —— 先复跑一轮确认；若属覆盖缺口，去「知识缺口」看未命中主题，' +
              '再补语料或修切片。',
            links: [
              { label: '去「检索质检」复跑', title: '跑一轮质检', page: 'quality' },
              { label: '去「知识缺口」', title: '查看未命中主题', page: 'gaps' },
            ],
          }
        : {
            advice: '还没有质检基线 —— 跑一次生成基线（需数据库可连、测试集与 gold 非空）。',
            links: [{ label: '去「检索质检」跑基线', title: '跑一轮质检', page: 'quality' }],
          }
    default:
      return null
  }
}
