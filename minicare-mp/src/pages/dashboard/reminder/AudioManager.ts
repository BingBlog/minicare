/**
 * AudioManager — 提醒音频播放管理（MP/H5 双端实现）
 *
 * 差异化：
 * - MP 端使用 Taro.InnerAudioContext，无需 unlock（小程序无 autoplay 限制）
 * - H5 端使用原生 HTMLAudioElement + 浏览器 autoplay unlock 机制：
 *   play() 被自动播放策略拒绝时记录待播放请求，首个用户手势解锁后重试
 *   （2026-09-03 H5 兼容性测试修复：此前 H5 复用 MP 实现导致 play() rejection 无人捕获）
 *
 * 保持语义一致：
 * - 循环播放提醒铃声直到手动停止
 * - 支持音量控制（夜间模式降低音量）
 * - preload / play / stop / destroy 接口一致
 */
import Taro from '@tarojs/taro'

/** 音频文件路径（通过 copy 配置复制到 dist/assets/sounds/） */
const SOUND_PATH = '/assets/sounds/reminder.wav'

/** 音量预设 */
const VOLUME_DAY = 0.7
const VOLUME_NIGHT = 0.3

const IS_H5 = process.env.TARO_ENV === 'h5'

class AudioManager {
  private ctx: Taro.InnerAudioContext | null = null
  /** H5 专用：原生 Audio 元素（自行持有 play() 的 Promise，可捕获自动播放策略拒绝，避免 unhandledrejection） */
  private h5Audio: HTMLAudioElement | null = null
  private h5Unlocked = false
  private h5PendingPlay = false
  private h5PendingNight = false
  private h5UnlockListenerInstalled = false
  private playing = false
  private vibrateTimer: ReturnType<typeof setInterval> | null = null

  /** 预加载音频资源 */
  preload(): void {
    if (IS_H5) {
      if (this.h5Audio) return
      const audio = new Audio(SOUND_PATH)
      audio.loop = true
      audio.volume = VOLUME_DAY
      audio.addEventListener('error', () => {
        console.error('[AudioManager] play error (h5)')
        // 音频加载/播放失败时用持续振动作为备用提醒
        this.startVibrateLoop()
      })
      this.h5Audio = audio
      this.installH5UnlockListener()
      return
    }
    if (this.ctx) return
    this.ctx = Taro.createInnerAudioContext()
    this.ctx.src = SOUND_PATH
    this.ctx.loop = true
    this.ctx.volume = VOLUME_DAY
    this.ctx.onError((err) => {
      console.error('[AudioManager] play error:', err)
      // 音频播放失败时用持续振动作为备用提醒
      this.startVibrateLoop()
    })
  }

  /**
   * 解锁音频
   * - MP 端无 autoplay 限制，空实现
   * - H5 端在首个用户手势（touchend/click）内静音试播一次以解锁，
   *   解锁成功后自动重试解锁前被拒的待播放请求
   */
  unlock(): void {
    if (!IS_H5) return
    this.tryH5Unlock()
  }

  /** 是否已解锁（MP 端始终为 true） */
  isUnlocked(): boolean {
    return IS_H5 ? this.h5Unlocked : true
  }

  /** 开始循环播放提醒铃声 */
  play(isNight = false): void {
    if (this.playing) return
    this.preload()

    if (IS_H5) {
      const audio = this.h5Audio
      if (!audio) return
      audio.volume = isNight ? VOLUME_NIGHT : VOLUME_DAY
      audio.currentTime = 0
      audio.play().then(
        () => {
          this.playing = true
        },
        () => {
          // 浏览器 autoplay 策略拒绝（用户尚未与页面交互）：
          // 记录待播放请求，首个手势解锁后自动重试；不向全局抛 unhandledrejection
          this.h5PendingPlay = true
          this.h5PendingNight = isNight
        },
      )
      // 振动提醒（小程序特有能力）
      Taro.vibrateLong({ fail: () => {} })
      return
    }

    if (!this.ctx) return

    this.ctx.volume = isNight ? VOLUME_NIGHT : VOLUME_DAY
    this.ctx.seek(0)
    this.ctx.play()
    this.playing = true

    // 振动提醒（小程序特有能力）
    Taro.vibrateLong({ fail: () => {} })
  }

  /** H5：监听首个用户手势，静音试播解锁音频元素 */
  private installH5UnlockListener(): void {
    if (this.h5UnlockListenerInstalled) return
    this.h5UnlockListenerInstalled = true
    const handler = () => this.tryH5Unlock(true)
    document.addEventListener('touchend', handler, { passive: true })
    document.addEventListener('click', handler, { capture: true })
  }

  /** H5：在用户手势上下文内试播一次以解锁；成功后重试待播放请求 */
  private tryH5Unlock(fromGesture = true): void {
    const audio = this.h5Audio
    if (!audio) return
    if (this.h5Unlocked) {
      if (this.h5PendingPlay && fromGesture) this.retryH5PendingPlay()
      return
    }
    audio.muted = true
    audio.play().then(
      () => {
        audio.pause()
        audio.currentTime = 0
        audio.muted = false
        this.h5Unlocked = true
        if (this.h5PendingPlay) this.retryH5PendingPlay()
      },
      () => {
        // 仍未满足解锁条件（非手势触发等），等待下一次手势
        audio.muted = false
      },
    )
  }

  /** H5：解锁后重试被拒的待播放请求 */
  private retryH5PendingPlay(): void {
    const audio = this.h5Audio
    if (!audio) return
    this.h5PendingPlay = false
    audio.volume = this.h5PendingNight ? VOLUME_NIGHT : VOLUME_DAY
    audio.currentTime = 0
    audio.play().then(
      () => {
        this.playing = true
      },
      () => {
        // 仍被拒绝则继续等待
        this.h5PendingPlay = true
      },
    )
  }

  /** 持续振动（音频播放失败时的备用方案） */
  private startVibrateLoop(): void {
    if (this.vibrateTimer) return
    Taro.vibrateLong({ fail: () => {} })
    this.vibrateTimer = setInterval(() => {
      Taro.vibrateLong({ fail: () => {} })
    }, 1500)
  }

  /** 停止振动循环 */
  private stopVibrateLoop(): void {
    if (this.vibrateTimer) {
      clearInterval(this.vibrateTimer)
      this.vibrateTimer = null
    }
  }

  /** 停止播放 */
  stop(): void {
    if (IS_H5) {
      if (!this.h5Audio) return
      this.h5Audio.pause()
      this.h5Audio.currentTime = 0
      this.h5PendingPlay = false
      this.stopVibrateLoop()
      this.playing = false
      return
    }
    if (!this.ctx) return
    this.ctx.pause()
    this.ctx.seek(0)
    this.stopVibrateLoop()
    this.playing = false
  }

  /** 当前是否正在播放 */
  isPlaying(): boolean {
    return this.playing
  }

  /** 是否有待播放请求（MP 端始终为 false） */
  hasPendingPlay(): boolean {
    return IS_H5 ? this.h5PendingPlay : false
  }

  /** 销毁实例，释放资源 */
  destroy(): void {
    this.stop()
    if (IS_H5) {
      if (this.h5Audio) {
        this.h5Audio.src = ''
        this.h5Audio = null
      }
      return
    }
    if (this.ctx) {
      this.ctx.destroy()
      this.ctx = null
    }
  }
}

/** 全局单例 */
export const audioManager = new AudioManager()
export default AudioManager
