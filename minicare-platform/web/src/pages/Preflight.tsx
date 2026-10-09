import { api } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useAsync } from '../lib/use-async'
import type { PreflightGet } from '../lib/types'
import { TIER_LABEL } from '../lib/labels'
import { Card, CardBody, CardHead, Empty, ErrorBox, Kpis, Loading, Notice, Pill, Table } from '../components/ui'

/** 检查项结果 → 徽标配色 */
function statusPill(s: string) {
  if (s === 'pass') return <Pill kind="ok">通过</Pill>
  if (s === 'warn') return <Pill kind="warn">注意</Pill>
  if (s === 'fail') return <Pill kind="danger">不通过</Pill>
  return <Pill kind="plain">说明</Pill>
}

/**
 * 页签：预检（解析详情 → 预检）
 *
 * 「预检」在界面上一直只是六个步骤里的一个圆点 —— 但它其实是**解析前唯一的人工可核对关口**
 * （源文件在不在、是不是扫描件、要不要 OCR、档位怎么定）。这一页把它的检查项一条条摊开，
 * 并额外呈现**逐页文字层字符数**（产物里只存了扫描页下标与总字符数，逐页明细由后端现场重算）。
 *
 * ⚠️ 最后一项「结论是否接线到解析」是**诚实的缺口披露**：预检的 `need_ocr` 目前只是建议，
 * 解析步骤用的是 `mineru.is_ocr` / `ocr_files` 配置，并没有消费预检结论（技术债 T7 未闭环）。
 * 宁可把这一条显示成"注意"，也不要把有结论当成已生效。
 */
export function PreflightPage() {
  const { doc, nonce } = useApp()
  const { data, error, loading } = useAsync<PreflightGet | null>(
    () => (doc ? api.preflight(doc) : Promise.resolve(null)),
    [doc, nonce],
  )

  if (!doc) return <Empty title="尚未选择文档">请到「文档管理」点选一份文档。</Empty>
  if (loading && !data) return <Loading />
  if (error) return <ErrorBox error={error} />
  if (!data) return null
  if (!data.ready) {
    return (
      <Card>
        <Empty title="还没有预检产物">{data.reason || '请先跑一次「进行预检」。'}</Empty>
      </Card>
    )
  }

  const art = data.artifact ?? {}
  const pages = data.pages ?? []
  const checks = data.checks ?? []
  const th = data.thresholds
  const scanned = art.scanned_pages as number[] | undefined
  const maxChars = pages.reduce((m, p) => Math.max(m, p.chars), 0) || 1

  return (
    <>
      <Kpis
        items={[
          ['页数', (art.page_count as number) || 0, '页'],
          ['扫描页', scanned?.length ?? 0, '页'],
          ['文字层字符', ((art.text_layer_chars as number) || 0).toLocaleString(), '字'],
          ['需 OCR', art.need_ocr ? '是' : '否', ''],
          ['推荐档位', art.recommended_tier ? TIER_LABEL[String(art.recommended_tier)] || String(art.recommended_tier) : '—', ''],
        ]}
      />

      <Card>
        <CardHead
          title="预检检查项"
          meta={
            th
              ? `阈值：单页 < ${th.min_text_chars_per_page} 字判为扫描页 · 扫描页占比 > ${Math.round(
                  th.scan_page_ratio_for_ocr * 100,
                )}% 则需 OCR`
              : null
          }
        />
        <CardBody flush>
          {/* ⚠️ 别用 `0` 当"自适应列"：本项目实测它不保证拿到剩余宽度，会真的变成 0 宽、
              内容整列隐形（这个页签第一版就是这么翻车的）。一律显式给宽度。 */}
          <Table cols={[190, 78, 700]}>
            <thead>
              <tr>
                <th>检查项</th>
                <th>结果</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.id}>
                  <td>{c.label}</td>
                  <td>{statusPill(c.status)}</td>
                  <td className="mono wrap" style={{ color: 'var(--text-2)' }}>
                    {c.detail}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardBody>
      </Card>

      <Card>
        <CardHead
          title="逐页文字层字符数"
          meta={
            pages.length
              ? `${pages.length} 页 · 红色 = 判为扫描页（< ${th?.min_text_chars_per_page ?? 50} 字）`
              : null
          }
        />
        <CardBody>
          {data.pages_error ? (
            <Notice>逐页重算失败：{data.pages_error}</Notice>
          ) : pages.length ? (
            <>
              <div className="pf-bars">
                {pages.map((p) => (
                  <div
                    key={p.i}
                    className={`pf-bar ${p.scanned ? 'scanned' : ''}`}
                    style={{ height: `${Math.max(3, (p.chars / maxChars) * 100)}%` }}
                    title={`第 ${p.i + 1} 页 · ${p.chars} 字${p.scanned ? '（扫描页）' : ''}`}
                  />
                ))}
              </div>
              <div className="legend">
                <span>横轴 = 页码（左起第 1 页）· 纵轴 = 该页文字层字符数（按最大值归一）</span>
                <span style={{ marginLeft: 'auto' }}>
                  中位 {pages.length ? [...pages].map((p) => p.chars).sort((a, b) => a - b)[Math.floor(pages.length / 2)] : 0} 字
                </span>
              </div>
            </>
          ) : (
            <Empty title="非 PDF 来源，无逐页文字层">
              这份文档的源文件是 HTML（或源文件缺失），预检跳过了逐页文字层扫描。
            </Empty>
          )}
        </CardBody>
        <details className="fold">
          <summary>查看预检产物原文（执行事实唯一来源）</summary>
          <pre className="box">{JSON.stringify(art, null, 2)}</pre>
        </details>
      </Card>
    </>
  )
}
