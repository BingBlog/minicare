/**
 * AudioUnlockBanner — 音频解锁提示
 *
 * 页面加载时以全屏遮罩 + 居中卡片形式显示，
 * 引导用户点击以激活提醒声音（满足浏览器自动播放策略）。
 * 用户点击后解锁音频并自动消失。
 */

interface Props {
  onUnlock: () => void
}

export default function AudioUnlockBanner({ onUnlock }: Props) {
  return (
    <div className="audio-unlock-overlay" onClick={onUnlock}>
      <div className="audio-unlock-card">
        <div className="audio-unlock-icon-ring">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
        </div>
        <h2 className="audio-unlock-title">点击激活提醒声音</h2>
        <p className="audio-unlock-desc">浏览器需要您的操作才能播放提醒铃声</p>
      </div>
    </div>
  )
}
