import { useEffect, useMemo, useState } from 'react'

/**
 * HTML 来源的源文档预览 —— 把「另存为」的下载页按**静态网页**渲染，而不是显示源码。
 *
 * ## 安全边界（改之前先读，两条防线缺一不可）
 * 源 HTML 是完整网页另存，带站点脚本（AAP 那份里有 72 个 `<script>`）。绝不能给它
 * 读写本平台接口的机会（localhost:8787 与其同源），所以：
 * · iframe 用**空白 sandbox**（不给 allow-scripts / allow-same-origin）：脚本不执行、断同源；
 * · 文档头注入 CSP：**脚本 / 表单 / 嵌套页 / 外链样式与字体一律不加载**；显式放行的只有——
 *   内联 `<style>` 与 `style` 属性（老页面版式靠它）、**图片**（见下）、以及按 origin 白名单的 `base`。
 *
 * ## 图片与回源（2026-10-09 按用户要求放开）
 * 图片从"全禁"改为**允许展示**（`img-src data: http: https:`）。相对路径图片在本地必 404
 * （下载页没有伴随的 `_files/` 目录），因此再从页面元数据里提取**原文 URL**
 * （canonical → og:url → `meta[name=Url]`，当前四份现实素材全覆盖）注入 `<base href>`——
 * 相对资源与相对链接都改回**原站**解析（正文头图能显示、点链接能到原文），CSP 的
 * `base-uri` 相应放行该 origin。提取不到线索时退回"无 href 的 base"（仅 target），
 * 相对资源维持 localhost 404 —— 这是保底，不是错误。
 * ⚠️ 放开的是图片与链接；**脚本、外链 CSS/字体仍全禁**（页面因缺站点样式呈"裸 HTML"观感，是预期取舍）。
 *
 * 弹窗是唯一开放的交互：`allow-popups allow-popups-to-escape-sandbox` + `<base target="_blank">`，
 * 让渲染页里的链接点击能在新标签打开（不开这套的话点击会被 sandbox 静默吞掉，像 bug）。
 * 无脚本时不存在"自动弹窗"。
 *
 * ## 为什么自己 fetch 再 srcDoc，而不是让 iframe 直连 /source
 * 后端把 HTML 以 `text/plain` 下发（有意为之，见 routers.py `source_file()`：不让任何
 * 消费方"顺路执行"这份网页的脚本）。srcDoc 让"渲染"能力只存在于这层沙箱里 ——
 * 不改 API 的文本语义，也不给「新标签打开」（无沙箱的普通标签）留任何执行面。
 */

type View = 'render' | 'code'

/**
 * 找页面里的**原文 URL**（回流基点）：canonical → og:url → `meta[name=Url]`
 * （各自处理属性顺序两种写法）。返回规范化 href；找不到或不是 http(s) 返回空串。
 */
function sourceUrlOf(html: string): string {
  const grab = (re: RegExp) => {
    const m = re.exec(html)
    return m ? m[1] : ''
  }
  const raw =
    grab(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) ||
    grab(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']canonical["']/i) ||
    grab(/<meta[^>]+property=["']og:url["'][^>]*content=["']([^"']+)["']/i) ||
    grab(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:url["']/i) ||
    grab(/<meta[^>]+name=["']url["'][^>]*content=["']([^"']+)["']/i) ||
    grab(/<meta[^>]+content=["']([^"']+)["'][^>]*name=["']url["']/i)
  if (!raw) return ''
  try {
    const u = new URL(raw)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : ''
  } catch {
    return ''
  }
}

/**
 * 注入到源文档头部的 CSP。`origin` 是 base href 的 origin（用于放行 base-uri），
 * 空串表示没有回源基点（此时用 'self' 兜底即可）。
 */
function buildCsp(origin: string): string {
  return [
    "default-src 'none'",
    // 图片放行（含外链与经 base 回源的相对图）；data: 覆盖内嵌 base64 图
    'img-src data: http: https:',
    "style-src 'unsafe-inline'",
    'font-src data:',
    "form-action 'none'",
    origin ? `base-uri ${origin}` : "base-uri 'self'",
  ].join('; ')
}

/** 给源 HTML 注入安全 meta（CSP + base）与一条清噪样式；没有 `<head>` 就前置 */
function harden(html: string): string {
  const base = sourceUrlOf(html)
  const origin = base ? new URL(base).origin : ''
  const inject =
    `<meta http-equiv="Content-Security-Policy" content="${buildCsp(origin)}" />` +
    // base：相对资源/链接回源到原站（提取不到原文 URL 时仅保留 target 行为）
    `<base ${base ? `href="${base.replace(/"/g, '&quot;')}" ` : ''}target="_blank" />` +
    // 禁脚本会让页面里 <noscript> 的兜底内容显形（如 SharePoint 的"请启用脚本"警告）——
    // 在这层渲染里它永远是误导（我们本就不启用脚本），直接隐藏
    '<style>noscript{display:none!important}</style>'
  const m = /<head[^>]*>/i.exec(html)
  if (m && m.index != null) {
    const at = m.index + m[0].length
    return html.slice(0, at) + inject + html.slice(at)
  }
  return inject + html
}

export function HtmlSourceView({ url }: { url: string }) {
  const [view, setView] = useState<View>('render')
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    setHtml(null)
    setError(null)
    const ac = new AbortController()
    fetch(url, { signal: ac.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.text()
      })
      .then((t) => setHtml(t))
      .catch((e: unknown) => {
        if ((e as { name?: string } | null)?.name === 'AbortError') return
        setError(e instanceof Error ? e.message : String(e))
      })
    return () => ac.abort()
  }, [url, tick])

  const srcDoc = useMemo(() => (html == null ? '' : harden(html)), [html])

  return (
    <>
      <div className="cmp-toolbar">
        <span className="cmp-tabs">
          <button
            type="button"
            className={`cmp-tab ${view === 'render' ? 'active' : ''}`}
            onClick={() => setView('render')}
          >
            渲染预览
          </button>
          <button
            type="button"
            className={`cmp-tab ${view === 'code' ? 'active' : ''}`}
            onClick={() => setView('code')}
          >
            源码
          </button>
        </span>
        <span className="hint" style={{ marginLeft: 'auto' }}>
          脚本已禁用 · 图片按原文地址加载
        </span>
        <a className="btn" href={url} target="_blank" rel="noreferrer">
          新标签打开
        </a>
      </div>

      {error ? (
        <div className="cmp-frame cmp-frame-state">
          源 HTML 载入失败：{error}
          <button type="button" className="btn" onClick={() => setTick((t) => t + 1)}>
            重试
          </button>
        </div>
      ) : html == null ? (
        <div className="cmp-frame cmp-frame-state">
          <span className="spin" /> 载入源 HTML…
        </div>
      ) : view === 'render' ? (
        <iframe
          title="源文档（HTML 静态渲染）"
          className="cmp-frame"
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          srcDoc={srcDoc}
        />
      ) : (
        <pre className="cmp-frame cmp-frame-text">{html}</pre>
      )}
    </>
  )
}
