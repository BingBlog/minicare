/**
 * AudioManager — 提醒音频播放管理
 *
 * 职责：
 * - 加载并缓存音频资源
 * - 循环播放提醒铃声直到手动停止
 * - 支持音量控制（夜间模式降低音量）
 * - 处理浏览器自动播放策略限制
 *
 * 浏览器自动播放策略：
 * 现代浏览器要求用户至少有一次交互（click/touch/keydown）后才允许播放音频。
 * AudioManager 通过 unlock() 方法在用户首次交互时解锁音频上下文，
 * 并在 play() 失败时标记待播放状态，等待解锁后自动重试。
 */

const SOUND_URL = '/sounds/reminder.wav'

/** 音量预设 */
const VOLUME_DAY = 0.7
const VOLUME_NIGHT = 0.3

class AudioManager {
  private audio: HTMLAudioElement | null = null
  private playing = false
  private unlocked = false
  /** play() 被浏览器阻止时，暂存播放请求 */
  private pendingPlay = false
  private pendingNight = false

  /** 预加载音频资源（可在 Dashboard 挂载时调用） */
  preload(): void {
    if (this.audio) return
    this.audio = new Audio(SOUND_URL)
    this.audio.loop = true
    this.audio.preload = 'auto'
  }

  /**
   * 解锁音频上下文 — 必须在用户交互事件回调中调用
   * 通过播放一次静音音频来满足浏览器自动播放策略
   */
  unlock(): void {
    if (this.unlocked) return
    this.preload()
    if (!this.audio) return

    // 静音播放一帧来解锁
    const prevVolume = this.audio.volume
    this.audio.volume = 0
    this.audio.play().then(() => {
      this.audio!.pause()
      this.audio!.currentTime = 0
      this.audio!.volume = prevVolume
      this.unlocked = true

      // 如果有待播放请求，立即执行
      if (this.pendingPlay) {
        this.pendingPlay = false
        this.play(this.pendingNight)
      }
    }).catch(() => {
      this.audio!.volume = prevVolume
    })
  }

  /** 是否已解锁（可用于 UI 提示） */
  isUnlocked(): boolean {
    return this.unlocked
  }

  /** 开始循环播放提醒铃声 */
  play(isNight = false): void {
    if (this.playing) return
    this.preload()
    if (!this.audio) return

    this.audio.volume = isNight ? VOLUME_NIGHT : VOLUME_DAY
    this.audio.currentTime = 0
    this.audio.play().then(() => {
      this.playing = true
      this.unlocked = true
    }).catch(() => {
      // 浏览器阻止自动播放 — 标记待播放，等待用户交互解锁
      this.pendingPlay = true
      this.pendingNight = isNight
    })
  }

  /** 停止播放 */
  stop(): void {
    if (!this.audio) return
    this.audio.pause()
    this.audio.currentTime = 0
    this.playing = false
    this.pendingPlay = false
  }

  /** 当前是否正在播放 */
  isPlaying(): boolean {
    return this.playing
  }

  /** 是否有待播放请求（被浏览器阻止） */
  hasPendingPlay(): boolean {
    return this.pendingPlay
  }

  /** 销毁实例，释放资源 */
  destroy(): void {
    this.stop()
    this.audio = null
  }
}

/** 全局单例 */
export const audioManager = new AudioManager()
export default AudioManager
