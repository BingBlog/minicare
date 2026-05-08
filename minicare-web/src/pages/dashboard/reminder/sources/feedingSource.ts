import type { ReminderSource } from '../useReminder'
import type { TodayRecord } from '@/api'

interface ModelData {
  gaps: Record<number, number[]>
  feedCounts: number[]
  updatedAt: string
}

const MODEL_STORAGE_PREFIX = 'feeding_model_v3_'
const MAX_SAMPLES_PER_BUCKET = 10
const MAX_DAYS_COUNTS = 7

export class FeedingModel {
  private gaps = new Map<number, number[]>()
  private feedCounts: number[] = []
  private babyId: string

  constructor(babyId: string) {
    this.babyId = babyId
  }

  load(): void {
    try {
      const raw = localStorage.getItem(MODEL_STORAGE_PREFIX + this.babyId)
      if (raw) {
        const data = JSON.parse(raw) as ModelData
        if (data.gaps) {
          this.gaps = new Map(Object.entries(data.gaps).map(([k, v]) => [Number(k), v]))
        }
        if (data.feedCounts) {
          this.feedCounts = data.feedCounts
        }
      }
    } catch {
      // first use, no cache
    }
  }

  save(): void {
    const data: ModelData = {
      gaps: Object.fromEntries(this.gaps),
      feedCounts: this.feedCounts,
      updatedAt: new Date().toISOString(),
    }
    localStorage.setItem(MODEL_STORAGE_PREFIX + this.babyId, JSON.stringify(data))
  }

  addDay(feeds: Pick<TodayRecord, 'time' | 'detail'>[]): void {
    this.feedCounts.push(feeds.length)
    if (this.feedCounts.length > MAX_DAYS_COUNTS) {
      this.feedCounts = this.feedCounts.slice(-MAX_DAYS_COUNTS)
    }

    for (let i = 1; i < feeds.length; i++) {
      const prevTime = new Date(feeds[i - 1].time)
      const currTime = new Date(feeds[i].time)
      const gap = (currTime.getTime() - prevTime.getTime()) / 60_000
      const bucket = prevTime.getHours()
      const bucketFloor = bucket - (bucket % 2)

      const existing = this.gaps.get(bucketFloor) || []
      if (existing.length >= 2) {
        const sorted = [...existing].sort((a, b) => a - b)
        const median = sorted[Math.floor(sorted.length / 2)]
        if (gap > median * 2.5 || gap < median * 0.2) continue
      }

      if (!this.gaps.has(bucketFloor)) {
        this.gaps.set(bucketFloor, [])
      }
      const arr = this.gaps.get(bucketFloor)!
      arr.push(gap)
      if (arr.length > MAX_SAMPLES_PER_BUCKET) {
        this.gaps.set(bucketFloor, arr.slice(-MAX_SAMPLES_PER_BUCKET))
      }
    }

    this.save()
  }

  getMedianGap(bucketHour: number): number | null {
    const gaps = this.gaps.get(bucketHour)
    if (!gaps || gaps.length < 2) return null
    const sorted = [...gaps].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    const cleaned = sorted.filter(g => g <= median * 2 && g >= median * 0.5)
    if (cleaned.length >= 2) {
      return cleaned[Math.floor(cleaned.length / 2)]
    }
    return median
  }

  typicalFeedCount(): number {
    if (this.feedCounts.length === 0) return 6
    return Math.round(this.feedCounts.reduce((a, b) => a + b, 0) / this.feedCounts.length)
  }

  is7FeedLikely(nToday: number, lastHour: number): boolean {
    if (this.feedCounts.length === 0) return false
    const cnt7 = this.feedCounts.filter(c => c === 7).length
    const cnt6 = this.feedCounts.filter(c => c === 6).length
    const total = cnt6 + cnt7
    if (total === 0) return false
    const ratio7 = cnt7 / total

    if (nToday === 5 && lastHour < 18) {
      return ratio7 >= 0.3
    }
    if (nToday >= 4 && ratio7 >= 0.6 && lastHour < 19) {
      return true
    }
    return false
  }

  isReady(): boolean {
    return this.feedCounts.length >= 2
  }
}

function circularMinDiff(a: number, b: number): number {
  const diff = Math.abs(a - b)
  return Math.min(diff, 1440 - diff)
}

function extractMl(record: TodayRecord): number | null {
  const d = record.detail
  if (!d) return null
  const ml = (d as Record<string, unknown>).formula_ml
  return typeof ml === 'number' ? ml : null
}

export function calcNextFeedTimeV3(
  todayFeedings: TodayRecord[],
  yesterdayFeedings: TodayRecord[] = [],
  model?: FeedingModel | null,
): Date | null {
  const nToday = todayFeedings.length

  if (nToday === 0) return null

  const lastFeed = todayFeedings[nToday - 1]
  const lastTime = new Date(lastFeed.time)
  const lastHour = lastTime.getHours()
  const lastMl = extractMl(lastFeed)
  const bucket = lastHour - (lastHour % 2)

  let modelGap: number | null = null
  if (model?.isReady()) {
    modelGap = model.getMedianGap(bucket)
  }

  let todayGap: number | null = null
  if (nToday >= 2) {
    const prevTime = new Date(todayFeedings[nToday - 2].time)
    todayGap = (lastTime.getTime() - prevTime.getTime()) / 60_000
    if (modelGap != null && todayGap > modelGap * 2.5) {
      todayGap = null
    }
  }

  const nYesterday = yesterdayFeedings.length
  const nextPos = nToday
  let yesterdayGap: number | null = null
  let yesterdayWeight = 0

  if (nextPos < nYesterday) {
    const yPrevTime = new Date(yesterdayFeedings[nextPos - 1].time)
    const yCurrTime = new Date(yesterdayFeedings[nextPos].time)
    const yGap = (yCurrTime.getTime() - yPrevTime.getTime()) / 60_000

    const yMinutes = yPrevTime.getHours() * 60 + yPrevTime.getMinutes()
    const tMinutes = lastHour * 60 + lastTime.getMinutes()
    const timeShift = circularMinDiff(yMinutes, tMinutes)

    if (timeShift <= 60) {
      yesterdayWeight = 0.25
    } else if (timeShift <= 120) {
      yesterdayWeight = 0.12
    } else {
      yesterdayWeight = 0.05
    }

    if (modelGap != null && yGap > modelGap * 2.5) {
      // skip
    } else {
      yesterdayGap = yGap
    }
  }

  const gaps: number[] = []
  const weights: number[] = []

  if (modelGap != null) {
    gaps.push(modelGap)
    weights.push(0.50)
  }

  if (todayGap != null) {
    const remaining = 1.0 - weights.reduce((a, b) => a + b, 0)
    const w = yesterdayGap != null && yesterdayWeight > 0.15 ? Math.min(0.25, remaining - yesterdayWeight) : Math.min(0.30, remaining)
    if (w > 0.05) {
      gaps.push(todayGap)
      weights.push(w)
    }
  }

  if (yesterdayGap != null && yesterdayWeight > 0) {
    const remaining = 1.0 - weights.reduce((a, b) => a + b, 0)
    if (remaining > 0.05) {
      gaps.push(yesterdayGap)
      weights.push(remaining)
    }
  }

  if (gaps.length === 0) {
    if (modelGap != null) {
      gaps.push(modelGap)
      weights.push(1.0)
    } else if (todayGap != null) {
      gaps.push(todayGap)
      weights.push(1.0)
    } else if (nToday === 1 && nYesterday >= 2) {
      const y1 = new Date(yesterdayFeedings[0].time)
      const y2 = new Date(yesterdayFeedings[1].time)
      const fallbackGap = (y2.getTime() - y1.getTime()) / 60_000
      gaps.push(fallbackGap)
      weights.push(1.0)
    } else {
      return null
    }
  }

  const totalW = weights.reduce((a, b) => a + b, 0)
  if (totalW === 0) return null
  const normWeights = weights.map(w => w / totalW)

  let baseGap = 0
  for (let i = 0; i < gaps.length; i++) {
    baseGap += gaps[i] * normWeights[i]
  }

  if (nToday === 5 && model?.isReady()) {
    if (model.is7FeedLikely(nToday, lastHour)) {
      const afternoonGap = model.getMedianGap(16) ?? 185
      baseGap = Math.min(baseGap, afternoonGap * 1.15)
    } else {
      if (lastHour >= 17) {
        baseGap = Math.max(baseGap, 230)
      }
    }
  }

  if (nToday === 6) {
    baseGap = Math.max(baseGap, 250)
  }

  if (lastMl != null) {
    if (lastMl >= 170) baseGap += 5
    else if (lastMl <= 130) baseGap -= 10
  }

  return new Date(lastTime.getTime() + baseGap * 60_000)
}

export function calcNextFeedTime(
  todayFeedings: TodayRecord[],
  yesterdayFeedings: TodayRecord[] = [],
): Date | null {
  return calcNextFeedTimeV3(todayFeedings, yesterdayFeedings)
}

export function createFeedingSource(
  getFeedings: () => TodayRecord[],
  getYesterdayFeedings: () => TodayRecord[],
  getModel?: () => FeedingModel | null,
): ReminderSource {
  return {
    id: 'feeding',
    label: '喂奶提醒',
    leadTime: 30,
    repeatInterval: 10,
    getNextTriggerTime: () => {
      const model = getModel?.() ?? null
      return calcNextFeedTimeV3(getFeedings(), getYesterdayFeedings(), model)
    },
  }
}
