import { pageMeta } from '../nav'
import { Card, Empty } from '../components/ui'

/** 页面：未实现占位（导航里标了期次但尚未落地的项会落到这里） */
export function PlaceholderPage({ id }: { id: string }) {
  const m = pageMeta(id)
  return (
    <Card>
      <Empty title={`${m?.label || id} 尚未实现`}>
        <p>
          计划于 <b>第 {m?.phase} 期</b> 落地 · 需求来源 {m?.story || '—'}
        </p>
        <p style={{ maxWidth: '62ch', margin: '10px auto 0', color: 'var(--text-2)' }}>{m?.desc || ''}</p>
        <p style={{ marginTop: 16, color: 'var(--text-3)' }}>
          设计依据见 <code>docs/prd/PRD-008/</code> 与 <code>docs/tech/TECH-015-kb-platform.md</code>
        </p>
      </Empty>
    </Card>
  )
}
