/**
 * 提醒系统测试页面
 *
 * 独立页面，用于验证提醒功能：
 * - 构造模拟喂奶数据，使下次喂奶时间落在"即将触发"窗口内
 * - 实时展示提醒状态
 * - 可手动触发/重置
 *
 * 路由：/dashboard/reminder-test（仅 dev 环境）
 */
import { useState, useMemo } from 'react'
import { useReminder, createFeedingSource, ReminderOverlay } from './index'
import type { ReminderSource } from './useReminder'
import type { TodayRecord } from '@/api'

/** 构造模拟喂奶记录：最近 3 次，间隔 avgGapMin 分钟，最后一次在 lastFeedAgoMin 分钟前 */
function buildMockFeedings(avgGapMin: number, lastFeedAgoMin: number): TodayRecord[] {
  const now = Date.now()
  const lastFeedTime = now - lastFeedAgoMin * 60_000
  const records: TodayRecord[] = []

  for (let i = 2; i >= 0; i--) {
    const time = new Date(lastFeedTime - i * avgGapMin * 60_000).toISOString()
    records.push({
      type: 'feeding',
      id: `mock-feed-${i}`,
      time,
      detail: { feed_type: 'formula', formula_ml: 120 },
    })
  }
  return records
}

export default function ReminderTest() {
  // 参数控制
  const [avgGap, setAvgGap] = useState(120) // 平均间隔（分钟）
  const [lastAgo, setLastAgo] = useState(100) // 上次喂奶距今（分钟）
  const [enabled, setEnabled] = useState(true)

  // 构造模拟数据
  const mockFeedings = useMemo(() => buildMockFeedings(avgGap, lastAgo), [avgGap, lastAgo])

  // 计算预计下次喂奶时间
  const nextFeedTime = useMemo(() => {
    const lastFeed = new Date(mockFeedings[mockFeedings.length - 1].time)
    return new Date(lastFeed.getTime() + avgGap * 60_000)
  }, [mockFeedings, avgGap])

  const diffMin = Math.round((nextFeedTime.getTime() - Date.now()) / 60_000)

  // 提醒系统
  const sources = useMemo<ReminderSource[]>(() => [
    createFeedingSource(() => mockFeedings, () => []),
  ], [mockFeedings])

  const { active, dismiss } = useReminder(sources, { isNight: false, enabled })

  return (
    <div style={{ padding: 40, background: '#0d0f1a', minHeight: '100vh', color: '#e0e4f0', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 24, marginBottom: 24 }}>提醒系统测试</h1>

      {/* 参数面板 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, maxWidth: 600, marginBottom: 32 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span>平均喂奶间隔（分钟）</span>
          <input
            type="range" min={60} max={240} value={avgGap}
            onChange={(e) => setAvgGap(Number(e.target.value))}
          />
          <span style={{ color: '#8a8ea0' }}>{avgGap} 分钟 ({(avgGap / 60).toFixed(1)}h)</span>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span>上次喂奶距今（分钟）</span>
          <input
            type="range" min={0} max={240} value={lastAgo}
            onChange={(e) => setLastAgo(Number(e.target.value))}
          />
          <span style={{ color: '#8a8ea0' }}>{lastAgo} 分钟前</span>
        </label>
      </div>

      {/* 状态展示 */}
      <div style={{ background: '#1a1d2e', borderRadius: 12, padding: 20, maxWidth: 600, marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, color: '#8a8ea0' }}>计算结果</h3>
        <p>预计下次喂奶：<strong>{nextFeedTime.toLocaleTimeString()}</strong></p>
        <p>距现在：<strong style={{ color: diffMin <= 0 ? '#f06878' : diffMin <= 30 ? '#f0a848' : '#4ecdc4' }}>
          {diffMin <= 0 ? `已过 ${Math.abs(diffMin)} 分钟` : `${diffMin} 分钟后`}
        </strong></p>
        <p>提醒窗口（T-30）：{diffMin <= 30 ? '已进入' : `还需 ${diffMin - 30} 分钟`}</p>
        <p>提醒状态：<strong>{active ? '响铃中' : '静默'}</strong></p>
        <p style={{ marginTop: 12 }}>
          <label>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            {' '}启用提醒
          </label>
        </p>
      </div>

      {/* 模拟数据展示 */}
      <div style={{ background: '#1a1d2e', borderRadius: 12, padding: 20, maxWidth: 600, marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, color: '#8a8ea0' }}>模拟喂奶记录</h3>
        {mockFeedings.map((r, i) => (
          <p key={r.id} style={{ margin: '4px 0', fontSize: 13 }}>
            #{i + 1} — {new Date(r.time).toLocaleTimeString()}
            {i === mockFeedings.length - 1 && ' (最近一次)'}
          </p>
        ))}
      </div>

      {/* 快捷按钮 */}
      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={() => setLastAgo(avgGap - 25)}
          style={{ padding: '10px 20px', borderRadius: 8, background: '#f0a848', color: '#000', border: 'none', cursor: 'pointer' }}
        >
          模拟：5分钟后触发
        </button>
        <button
          onClick={() => setLastAgo(avgGap - 30)}
          style={{ padding: '10px 20px', borderRadius: 8, background: '#f06878', color: '#fff', border: 'none', cursor: 'pointer' }}
        >
          模拟：立即触发
        </button>
        <button
          onClick={() => setLastAgo(avgGap + 10)}
          style={{ padding: '10px 20px', borderRadius: 8, background: '#f06878', color: '#fff', border: 'none', cursor: 'pointer' }}
        >
          模拟：已超时
        </button>
        <button
          onClick={() => setLastAgo(30)}
          style={{ padding: '10px 20px', borderRadius: 8, background: '#4ecdc4', color: '#000', border: 'none', cursor: 'pointer' }}
        >
          重置：刚喂完
        </button>
      </div>

      {/* 提醒浮层 */}
      {active && <ReminderOverlay reminder={active} onDismiss={dismiss} />}
    </div>
  )
}
