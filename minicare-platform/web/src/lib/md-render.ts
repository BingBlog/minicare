import MarkdownIt from 'markdown-it'

/**
 * Markdown 渲染器（US-14 右侧「Markdown」页签）
 *
 * ## 为什么必须放行 HTML（`html: true`）
 * 实测 MinerU 产出的 md 里，**表格是原始 `<table>` HTML**（不是 markdown 表格语法），
 * 例如 `表1 剂量\n<table><tr><td>…`。不放行 HTML 就渲染不出表格，
 * 与 mineru.net 的 Markdown 页签观感会差一大截。
 *
 * ## 为什么还要自己清洗
 * md 来源是「下载回来的指南 PDF/HTML」经 MinerU 解析的结果，**不是完全可信的输入**：
 * - 4 份 HTML 来源的文档，其 md 里可能残留原页面的标签；
 * - 放行 HTML 后，`<script>` / `onerror=` / `javascript:` 都会被浏览器执行。
 * 本工具虽只监听 127.0.0.1，但没理由给「打开一个文档」这个动作留执行面。
 * 因此渲染后做**白名单式收口**：去脚本/样式、去事件属性、禁 javascript: 协议。
 * （MinerU 的做法不同：它把预览塞进 `sandbox="allow-scripts"` 的 iframe 并把外链改成
 * `target=_blank rel=noopener noreferrer`；我们没有 iframe，所以自己收口 + 同样处理外链。）
 */
const md = new MarkdownIt({
  html: true,
  linkify: false,
  typographer: false,
  breaks: false,
})

const SCRIPT_OR_STYLE = /<(script|style|iframe|object|embed)\b[\s\S]*?<\/\1\s*>/gi
const SELF_CLOSING_DANGEROUS = /<(script|style|iframe|object|embed)\b[^>]*\/?>/gi
const EVENT_ATTR = /\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi
const JS_PROTOCOL = /(href|src|xlink:href)\s*=\s*("|')\s*javascript:[^"']*\2/gi

/** 清洗渲染结果：移除可执行内容，保留结构与样式类 */
export function scrubHtml(html: string): string {
  return html
    .replace(SCRIPT_OR_STYLE, '')
    .replace(SELF_CLOSING_DANGEROUS, '')
    .replace(EVENT_ATTR, '')
    .replace(JS_PROTOCOL, '$1=$2#$2')
}

/** 外链统一新标签打开（与 MinerU 的 `_prepare_preview_links` 同口径），内部锚点不动 */
function externalizeLinks(html: string): string {
  return html.replace(/<a\s+([^>]*?)href="(https?:\/\/[^"]*)"/gi, (_m, attrs: string, href: string) => {
    const rel = /rel=/.test(attrs) ? attrs : `${attrs}rel="noopener noreferrer" `
    return `<a ${rel}href="${href}" target="_blank"`
  })
}

/**
 * 把 markdown 里的**相对图片路径**改写成后端可服务的绝对地址。
 *
 * MinerU 产物里图片是 `![](images/<sha>.jpg)`，在浏览器里会相对当前页面解析 → 404。
 * `imgBase` 由后端下发（`/parsed` 与 `/segments` 的 `img_url_base`）。
 *
 * ⚠️ 这是**渲染前的副本改写**，不要写回数据：切片正文可以被「编辑正文」原样提交回产物，
 * 一旦把绝对 URL 烤进去就再也改不回来（后端也只下发前缀、不改写 content，同一道理）。
 */
export function rewriteImagePaths(md: string, imgBase: string): string {
  if (!md || !imgBase) return md
  return md.replace(/\]\(images\//g, `](${imgBase}/`)
}

/** 渲染一段 markdown 为安全的 HTML 片段 */
export function renderMarkdown(text: string): string {
  if (!text) return ''
  return externalizeLinks(scrubHtml(md.render(text)))
}

/** 渲染 + 图片路径改写（正文里的 `<table>` 内联 HTML 也会被渲染成真表格） */
export function renderRich(text: string, imgBase: string): string {
  return renderMarkdown(rewriteImagePaths(text, imgBase))
}
