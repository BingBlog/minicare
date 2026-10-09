/**
 * 运行进度的展示工具。
 *
 * 轮询状态本身（`activeRuns` / `trackRun`）在 `app-context` 里 ——
 * 那是跨页面共享的全局态（用户等运行时会切页，浮标要一直跟着）。
 * 这里只放纯展示函数，供 RunDock 与「文档管理」卡片共同消费。
 */

/** 已耗时 → `12s` / `1m05s`（进度文本专用，与 fmtMs 的毫秒口径不同） */
export function fmtElapsed(ms: number | null | undefined): string {
  if (ms == null || ms < 0) return ''
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m${String(s % 60).padStart(2, '0')}s`
}
