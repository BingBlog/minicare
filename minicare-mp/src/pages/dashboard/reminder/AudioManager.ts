/**
 * AudioManager — 提醒音频播放管理（MP 端实现）
 *
 * 差异化：
 * - Web 端使用 HTMLAudioElement + 浏览器 autoplay unlock 机制
 * - MP 端使用 Taro.InnerAudioContext，无需 unlock（小程序无 autoplay 限制）
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

class AudioManager {
  private ctx: Taro.InnerAudioContext | null = null
  private playing = false
  private vibrateTimer: ReturnType<typeof setInterval> | null = null

  /** 预加载音频资源 */
  preload(): void {
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
   * 解锁音频 — MP 端无需解锁，保留接口兼容性
   */
  unlock(): void {
    // 小程序无 autoplay 限制，此方法为空实现
  }

  /** 是否已解锁（MP 端始终为 true） */
  isUnlocked(): boolean {
    return true
  }

  /** 开始循环播放提醒铃声 */
  play(isNight = false): void {
    if (this.playing) return
    this.preload()
    if (!this.ctx) return

    this.ctx.volume = isNight ? VOLUME_NIGHT : VOLUME_DAY
    this.ctx.seek(0)
    this.ctx.play()
    this.playing = true

    // 振动提醒（小程序特有能力）
    Taro.vibrateLong({ fail: () => {} })
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
    return false
  }

  /** 销毁实例，释放资源 */
  destroy(): void {
    this.stop()
    if (this.ctx) {
      this.ctx.destroy()
      this.ctx = null
    }
  }
}

/** 全局单例 */
export const audioManager = new AudioManager()
export default AudioManager
