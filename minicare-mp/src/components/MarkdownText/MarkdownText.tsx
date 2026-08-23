/**
 * MarkdownText — 轻量 markdown 渲染组件（小程序端，零依赖）
 *
 * 支持子集（覆盖敏宝助手回答的主要格式）：
 *   # ~ #### 标题、**加粗**、*斜体*、`行内代码`、
 *   - 无序列表、1. 有序列表、> 引用、--- 分隔线、| 表格 |
 *
 * 样式对齐 minicare 主题（暖色系：主色 #F87098 / 文字 #3D2B2E / 引用与表格 #FFF8F0）。
 */
import { View, Text } from '@tarojs/components'
import { memo, useMemo, type ReactNode } from 'react'
import './MarkdownText.scss'

// ── 类型 ──────────────────────────────────────────────────────────

type InlineNode =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'italic'; text: string }
  | { type: 'code'; text: string }

type Block =
  | { type: 'heading'; level: number; inline: InlineNode[] }
  | { type: 'paragraph'; inline: InlineNode[] }
  | { type: 'list'; ordered: boolean; items: InlineNode[][] }
  | { type: 'quote'; inline: InlineNode[] }
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'hr' }

// ── 行内解析（**bold** / `code` / *italic*）──────────────────────

const INLINE_RE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g

function parseInline(text: string): InlineNode[] {
  const parts = text.split(INLINE_RE)
  const nodes: InlineNode[] = []
  for (const part of parts) {
    if (!part) continue
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      nodes.push({ type: 'bold', text: part.slice(2, -2) })
    } else if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      nodes.push({ type: 'code', text: part.slice(1, -1) })
    } else if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      nodes.push({ type: 'italic', text: part.slice(1, -1) })
    } else {
      nodes.push({ type: 'text', text: part })
    }
  }
  return nodes
}

// ── 块解析 ────────────────────────────────────────────────────────

const HEADING_RE = /^(#{1,6})\s+(.*)$/
const QUOTE_RE = /^>\s?(.*)$/
const UL_RE = /^[-*]\s+(.*)$/
const OL_RE = /^\d+\.\s+(.*)$/
const HR_RE = /^\s*(---|\*\*\*)\s*$/
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/
const TABLE_SEP_RE = /^\s*\|[\s:|-]+\|\s*$/

function parseBlocks(content: string): Block[] {
  const lines = content.split('\n')
  const blocks: Block[] = []
  let i = 0

  const pushParagraph = (textLines: string[]) => {
    if (textLines.length === 0) return
    const joined = textLines.join('\n')
    // 段落内软换行 → 用空格连接（小程序 Text 内换行已由 pre-wrap 处理，这里保留原样）
    blocks.push({ type: 'paragraph', inline: parseInline(joined) })
  }

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) {
      i++
      continue
    }

    // 标题
    const h = trimmed.match(HEADING_RE)
    if (h) {
      blocks.push({ type: 'heading', level: h[1].length, inline: parseInline(h[2]) })
      i++
      continue
    }

    // 分隔线
    if (HR_RE.test(trimmed)) {
      blocks.push({ type: 'hr' })
      i++
      continue
    }

    // 引用（连续行合并）
    if (QUOTE_RE.test(trimmed)) {
      const quoteLines: string[] = []
      while (i < lines.length) {
        const q = lines[i].match(QUOTE_RE)
        if (!q) break
        quoteLines.push(q[1])
        i++
      }
      blocks.push({ type: 'quote', inline: parseInline(quoteLines.join(' ')) })
      continue
    }

    // 表格（表头 + 分隔行 + 数据行）
    if (TABLE_ROW_RE.test(trimmed) && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1])) {
      const header = trimmed.split('|').slice(1, -1).map((c) => c.trim())
      i += 2 // 跳过表头与分隔行
      const rows: string[][] = []
      while (i < lines.length && TABLE_ROW_RE.test(lines[i].trim()) && !TABLE_SEP_RE.test(lines[i].trim())) {
        rows.push(lines[i].split('|').slice(1, -1).map((c) => c.trim()))
        i++
      }
      blocks.push({ type: 'table', header, rows })
      continue
    }

    // 无序列表（连续项合并）
    if (UL_RE.test(trimmed)) {
      const items: InlineNode[][] = []
      while (i < lines.length) {
        const m = lines[i].match(UL_RE)
        if (!m) break
        items.push(parseInline(m[1]))
        i++
      }
      blocks.push({ type: 'list', ordered: false, items })
      continue
    }

    // 有序列表
    if (OL_RE.test(trimmed)) {
      const items: InlineNode[][] = []
      while (i < lines.length) {
        const m = lines[i].match(OL_RE)
        if (!m) break
        items.push(parseInline(m[1]))
        i++
      }
      blocks.push({ type: 'list', ordered: true, items })
      continue
    }

    // 普通段落（连续文本行合并）
    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !HEADING_RE.test(lines[i].trim()) &&
      !HR_RE.test(lines[i].trim()) &&
      !QUOTE_RE.test(lines[i].trim()) &&
      !UL_RE.test(lines[i].trim()) &&
      !OL_RE.test(lines[i].trim()) &&
      !(TABLE_ROW_RE.test(lines[i].trim()) && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1]))
    ) {
      paraLines.push(lines[i])
      i++
    }
    pushParagraph(paraLines)
  }

  return blocks
}

// ── 渲染 ──────────────────────────────────────────────────────────

function renderInline(nodes: InlineNode[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, idx) => {
    const key = `${keyPrefix}-${idx}`
    if (node.type === 'bold') {
      return (
        <Text key={key} className='md-inline-bold'>
          {node.text}
        </Text>
      )
    }
    if (node.type === 'italic') {
      return (
        <Text key={key} className='md-inline-italic'>
          {node.text}
        </Text>
      )
    }
    if (node.type === 'code') {
      return (
        <Text key={key} className='md-inline-code'>
          {node.text}
        </Text>
      )
    }
    return <Text key={key}>{node.text}</Text>
  })
}

function MarkdownTextInner({ content }: { content: string }) {
  const blocks = useMemo(() => parseBlocks(content), [content])

  return (
    <View className='md'>
      {blocks.map((block, bi) => {
        const key = `b-${bi}`
        switch (block.type) {
          case 'heading':
            return (
              <View key={key} className={`md-heading md-heading--${Math.min(block.level, 4)}`}>
                <Text className='md-heading__text'>{renderInline(block.inline, key)}</Text>
              </View>
            )
          case 'paragraph':
            return (
              <Text key={key} className='md-paragraph'>
                {renderInline(block.inline, key)}
              </Text>
            )
          case 'list':
            return (
              <View key={key} className='md-list'>
                {block.items.map((item, li) => (
                  <View key={`${key}-${li}`} className='md-list__item'>
                    <Text className='md-list__marker'>
                      {block.ordered ? `${li + 1}.` : '•'}
                    </Text>
                    <Text className='md-list__content'>{renderInline(item, `${key}-${li}`)}</Text>
                  </View>
                ))}
              </View>
            )
          case 'quote':
            return (
              <View key={key} className='md-quote'>
                <Text className='md-quote__text'>{renderInline(block.inline, key)}</Text>
              </View>
            )
          case 'table': {
            const colCount = Math.max(block.header.length, ...block.rows.map((r) => r.length))
            return (
              <View key={key} className='md-table'>
                <View className='md-table__row md-table__row--header'>
                  {Array.from({ length: colCount }).map((_, ci) => (
                    <Text key={`h-${ci}`} className='md-table__cell md-table__cell--header'>
                      {renderInline(parseInline(block.header[ci] ?? ''), `h-${ci}`)}
                    </Text>
                  ))}
                </View>
                {block.rows.map((row, ri) => (
                  <View key={`r-${ri}`} className='md-table__row'>
                    {Array.from({ length: colCount }).map((_, ci) => (
                      <Text key={`c-${ci}`} className='md-table__cell'>
                        {renderInline(parseInline(row[ci] ?? ''), `r-${ri}-c-${ci}`)}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            )
          }
          case 'hr':
            return <View key={key} className='md-hr' />
          default:
            return null
        }
      })}
    </View>
  )
}

/** 按内容 memo：流式增量时不重复解析旧文本 */
const MarkdownText = memo(MarkdownTextInner, (prev, next) => prev.content === next.content)

export default MarkdownText
