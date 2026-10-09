import type { ReactNode } from 'react'

/**
 * 轻量 Markdown 渲染（TECH-022 B3）：Agent 回答的常见排版（段落 / 无序列表 / 粗体 / 行内代码）。
 *
 * 不引第三方依赖（本机安装依赖成本高且回答结构简单），只处理回答里真实出现的语法；
 * 解析结果构造为 React 节点（不经过 innerHTML，天然转义）。
 */

/** 行内解析：`**粗体**` 与 `` `code` `` */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) out.push(<strong key={`${keyPrefix}-b${i}`}>{tok.slice(2, -2)}</strong>)
    else out.push(<code key={`${keyPrefix}-c${i}`}>{tok.slice(1, -1)}</code>)
    last = m.index + tok.length
    i += 1
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export function RichText({ text }: { text: string }) {
  if (!text) return <span className="hint">（无）</span>
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let list: string[] = []
  let para: string[] = []
  let key = 0

  const flushList = () => {
    if (!list.length) return
    blocks.push(
      <ul key={`ul-${key++}`} className="md-ul">
        {list.map((li, i) => <li key={i}>{inline(li, `li-${key}-${i}`)}</li>)}
      </ul>,
    )
    list = []
  }
  const flushPara = () => {
    if (!para.length) return
    // 软换行拼接：中文字符之间不加空格（LLM 回答常见硬折行，加空格会产生"断 句"的怪异感）
    const merged = para.reduce((acc, cur, i) => {
      if (i === 0) return cur
      const prevCh = acc.slice(-1)
      const nextCh = cur.slice(0, 1)
      const cjk = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/
      return acc + (cjk.test(prevCh) && cjk.test(nextCh) ? '' : ' ') + cur
    }, '')
    blocks.push(<p key={`p-${key++}`} className="md-p">{inline(merged, `p${key}`)}</p>)
    para = []
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      flushList()
      flushPara()
      continue
    }
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/)
    const heading = line.match(/^#{1,4}\s+(.*)$/)
    if (bullet) {
      flushPara()
      list.push(bullet[1])
      continue
    }
    if (heading) {
      flushList()
      flushPara()
      blocks.push(<p key={`h-${key++}`} className="md-h">{inline(heading[1], `h${key}`)}</p>)
      continue
    }
    flushList()
    para.push(line.trim())
  }
  flushList()
  flushPara()

  return <div className="md">{blocks}</div>
}
