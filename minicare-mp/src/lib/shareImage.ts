import Taro from '@tarojs/taro'

export interface ShareStats {
  babyName: string
  babyAge: string
  milkVolume: string
  milkUnit: string
  sleepDuration: string
  sleepUnit: string
  diaperCount: string
  symptomCount: string
  ongoingSleep?: {
    startTime: string
    duration: string
  }
  lastFeeding?: {
    time: string
    elapsed: string
  }
}

export async function generateShareImage(stats: ShareStats): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvasId = 'shareCanvas'
    const ctx = Taro.createCanvasContext(canvasId)
    const width = 500
    const height = 500

    ctx.setFillStyle('#FFF0F4')
    ctx.fillRect(0, 0, width, height)

    const padding = 30
    let currentY = padding

    ctx.beginPath()
    ctx.roundRect(padding, currentY, width - padding * 2, 100, 20)
    ctx.setFillStyle('#FFFFFF')
    ctx.fill()
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(width / 2, currentY + 50, 36, 0, 2 * Math.PI)
    ctx.setFillStyle('#F87098')
    ctx.fill()

    ctx.setFontSize(12)
    ctx.setFillStyle('#FFFFFF')
    ctx.setTextAlign('center')
    ctx.fillText('宝', width / 2, currentY + 54)

    ctx.setFontSize(24)
    ctx.setFillStyle('#3D2B2E')
    ctx.setTextAlign('center')
    ctx.fillText(stats.babyName, width / 2, currentY + 95)

    ctx.setFontSize(14)
    ctx.setFillStyle('#9A7E82')
    ctx.fillText(stats.babyAge, width / 2, currentY + 115)

    currentY += 130

    const statWidth = (width - padding * 2 - 15) / 4
    const statHeight = 80

    const drawStat = (x: number, value: string, unit: string, label: string, hasValue: boolean) => {
      ctx.beginPath()
      ctx.roundRect(x, currentY, statWidth, statHeight, 12)
      ctx.setFillStyle(hasValue ? '#FFFFFF' : '#F5F5F5')
      ctx.fill()
      ctx.stroke()

      ctx.setFontSize(20)
      ctx.setFillStyle(hasValue ? '#F87098' : '#CCCCCC')
      ctx.setTextAlign('center')
      ctx.fillText(value, x + statWidth / 2, currentY + 35)

      if (unit) {
        ctx.setFontSize(10)
        ctx.setFillStyle(hasValue ? '#9A7E82' : '#CCCCCC')
        ctx.fillText(unit, x + statWidth / 2, currentY + 50)
      }

      ctx.setFontSize(11)
      ctx.setFillStyle('#9A7E82')
      ctx.fillText(label, x + statWidth / 2, currentY + 70)
    }

    const hasMilk = stats.milkVolume !== '—'
    const hasSleep = stats.sleepDuration !== '—'
    const hasDiaper = stats.diaperCount !== '—'
    const hasSymptom = stats.symptomCount !== '—'

    drawStat(padding, stats.milkVolume, stats.milkUnit, '今日奶量', hasMilk)
    drawStat(padding + statWidth + 5, stats.sleepDuration, stats.sleepUnit, '今日睡眠', hasSleep)
    drawStat(padding + (statWidth + 5) * 2, stats.diaperCount, '次', '换尿布', hasDiaper)
    drawStat(padding + (statWidth + 5) * 3, stats.symptomCount, '项', '表现', hasSymptom)

    currentY += 100

    if (stats.ongoingSleep) {
      ctx.beginPath()
      ctx.roundRect(padding, currentY, width - padding * 2, 70, 12)
      ctx.setFillStyle('#FFFFFF')
      ctx.fill()
      ctx.stroke()

      ctx.beginPath()
      ctx.arc(padding + 22, currentY + 35, 8, 0, 2 * Math.PI)
      ctx.setFillStyle('#FF6B8A')
      ctx.fill()

      ctx.setFontSize(14)
      ctx.setFillStyle('#3D2B2E')
      ctx.setTextAlign('left')
      ctx.fillText('宝宝正在睡觉', padding + 42, currentY + 30)

      ctx.setFontSize(12)
      ctx.setFillStyle('#9A7E82')
      ctx.fillText(`开始于 ${stats.ongoingSleep.startTime} · 已睡 ${stats.ongoingSleep.duration}`, padding + 42, currentY + 50)

      currentY += 85
    }

    if (stats.lastFeeding) {
      ctx.beginPath()
      ctx.roundRect(padding, currentY, width - padding * 2, 60, 12)
      ctx.setFillStyle('#FFFFFF')
      ctx.fill()
      ctx.stroke()

      ctx.beginPath()
      ctx.arc(padding + 22, currentY + 30, 6, 0, 2 * Math.PI)
      ctx.setFillStyle('#DDB870')
      ctx.fill()

      ctx.setFontSize(13)
      ctx.setFillStyle('#3D2B2E')
      ctx.setTextAlign('left')
      ctx.fillText('距上次喂奶', padding + 38, currentY + 28)

      ctx.setFontSize(11)
      ctx.setFillStyle('#9A7E82')
      ctx.fillText(`上次 ${stats.lastFeeding.time} · 已过去 ${stats.lastFeeding.elapsed}`, padding + 38, currentY + 46)

      currentY += 75
    }

    ctx.setFontSize(16)
    ctx.setFillStyle('#F87098')
    ctx.setTextAlign('center')
    ctx.fillText('敏宝日记', width / 2, currentY + 20)

    ctx.setFontSize(10)
    ctx.setFillStyle('#9A7E82')
    ctx.fillText('记录每一口，呵护每一天', width / 2, currentY + 40)

    ctx.draw(false, () => {
      Taro.canvasToTempFilePath({
        canvasId,
        success: (res) => {
          resolve(res.tempFilePath)
        },
        fail: (err) => {
          reject(err)
        }
      })
    })
  })
}