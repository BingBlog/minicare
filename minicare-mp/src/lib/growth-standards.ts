/**
 * 中国7岁以下儿童生长发育参照标准（2023年版）
 * 来源：国家卫生健康委员会
 *
 * 包含 0-36 个月男童/女童体重、身高、头围的 P3/P15/P50/P85/P97 百分位数据
 * 用于生长曲线图表绘制和当前百分位计算
 */

// ── 数据类型 ────────────────────────────────────────────────────────

export interface GrowthStandardPoint {
  month: number        // 月龄（整数，0 = 出生）
  /** 体重 kg */
  weightP3: number
  weightP15: number
  weightP50: number
  weightP85: number
  weightP97: number
  /** 身高 cm */
  heightP3: number
  heightP15: number
  heightP50: number
  heightP85: number
  heightP97: number
  /** 头围 cm */
  headP3: number
  headP15: number
  headP50: number
  headP85: number
  headP97: number
}

// ── 男童数据（0-36月，按月龄）─────────────────────────────────────────
// 数据来源：国家卫健委《中国7岁以下儿童生长发育参照标准》2023版

export const BOY_GROWTH_STANDARDS: GrowthStandardPoint[] = [
  // month, weightP3, weightP15, weightP50, weightP85, weightP97, heightP3, heightP15, heightP50, heightP85, heightP97, headP3, headP15, headP50, headP85, headP97
  { month: 0,  weightP3: 2.50, weightP15: 2.90, weightP50: 3.30, weightP85: 3.90, weightP97: 4.40, heightP3: 46.1, heightP15: 48.0, heightP50: 50.0, heightP85: 52.0, heightP97: 53.7, headP3: 31.9, headP15: 32.9, headP50: 34.0, headP85: 35.1, headP97: 36.1 },
  { month: 1,  weightP3: 3.40, weightP15: 3.90, weightP50: 4.50, weightP85: 5.20, weightP97: 5.80, heightP3: 50.8, heightP15: 52.7, heightP50: 54.7, heightP85: 56.7, heightP97: 58.6, headP3: 35.0, headP15: 36.2, headP50: 37.3, headP85: 38.4, headP97: 39.5 },
  { month: 2,  weightP3: 4.30, weightP15: 4.90, weightP50: 5.60, weightP85: 6.40, weightP97: 7.10, heightP3: 54.4, heightP15: 56.4, heightP50: 58.4, heightP85: 60.4, heightP97: 62.4, headP3: 37.1, headP15: 38.3, headP50: 39.6, headP85: 40.8, headP97: 41.9 },
  { month: 3,  weightP3: 5.00, weightP15: 5.70, weightP50: 6.40, weightP85: 7.30, weightP97: 8.00, heightP3: 57.3, heightP15: 59.3, heightP50: 61.4, heightP85: 63.5, heightP97: 65.5, headP3: 38.8, headP15: 40.1, headP50: 41.3, headP85: 42.5, headP97: 43.6 },
  { month: 4,  weightP3: 5.60, weightP15: 6.30, weightP50: 7.00, weightP85: 7.90, weightP97: 8.70, heightP3: 59.7, heightP15: 61.8, heightP50: 63.9, heightP85: 66.0, heightP97: 68.0, headP3: 40.1, headP15: 41.4, headP50: 42.7, headP85: 43.9, headP97: 45.0 },
  { month: 5,  weightP3: 6.00, weightP15: 6.80, weightP50: 7.50, weightP85: 8.50, weightP97: 9.30, heightP3: 61.5, heightP15: 63.6, heightP50: 65.8, heightP85: 68.0, heightP97: 70.0, headP3: 41.2, headP15: 42.5, headP50: 43.8, headP85: 45.1, headP97: 46.2 },
  { month: 6,  weightP3: 6.40, weightP15: 7.20, weightP50: 7.90, weightP85: 8.90, weightP97: 9.80, heightP3: 63.3, heightP15: 65.5, heightP50: 67.6, heightP85: 69.8, heightP97: 71.9, headP3: 42.1, headP15: 43.5, headP50: 44.8, headP85: 46.0, headP97: 47.2 },
  { month: 7,  weightP3: 6.70, weightP15: 7.60, weightP50: 8.30, weightP85: 9.40, weightP97: 10.30, heightP3: 65.0, heightP15: 67.2, heightP50: 69.3, heightP85: 71.5, heightP97: 73.6, headP3: 42.9, headP15: 44.3, headP50: 45.6, headP85: 46.9, headP97: 48.1 },
  { month: 8,  weightP3: 7.00, weightP15: 7.90, weightP50: 8.70, weightP85: 9.80, weightP97: 10.70, heightP3: 66.5, heightP15: 68.7, heightP50: 70.9, heightP85: 73.1, heightP97: 75.2, headP3: 43.6, headP15: 45.0, headP50: 46.4, headP85: 47.7, headP97: 48.9 },
  { month: 9,  weightP3: 7.20, weightP15: 8.20, weightP50: 9.00, weightP85: 10.10, weightP97: 11.10, heightP3: 68.3, heightP15: 70.5, heightP50: 72.7, heightP85: 74.9, heightP97: 77.0, headP3: 44.2, headP15: 45.7, headP50: 47.0, headP85: 48.4, headP97: 49.6 },
  { month: 10, weightP3: 7.50, weightP15: 8.50, weightP50: 9.30, weightP85: 10.50, weightP97: 11.50, heightP3: 69.8, heightP15: 72.0, heightP50: 74.2, heightP85: 76.5, heightP97: 78.7, headP3: 44.8, headP15: 46.3, headP50: 47.6, headP85: 49.0, headP97: 50.2 },
  { month: 11, weightP3: 7.70, weightP15: 8.70, weightP50: 9.60, weightP85: 10.80, weightP97: 11.90, heightP3: 71.0, heightP15: 73.3, heightP50: 75.6, heightP85: 77.9, heightP97: 80.1, headP3: 45.3, headP15: 46.8, headP50: 48.2, headP85: 49.5, headP97: 50.8 },
  { month: 12, weightP3: 7.90, weightP15: 9.00, weightP50: 9.90, weightP85: 11.10, weightP97: 12.20, heightP3: 72.1, heightP15: 74.5, heightP50: 76.8, heightP85: 79.1, heightP97: 81.4, headP3: 45.8, headP15: 47.3, headP50: 48.6, headP85: 50.0, headP97: 51.3 },
  // 13-24月（简化关键节点）
  { month: 15, weightP3: 8.40, weightP15: 9.60, weightP50: 10.60, weightP85: 11.90, weightP97: 13.10, heightP3: 75.3, heightP15: 77.8, heightP50: 80.2, heightP85: 82.6, heightP97: 85.0, headP3: 46.6, headP15: 48.2, headP50: 49.6, headP85: 51.0, headP97: 52.3 },
  { month: 18, weightP3: 8.90, weightP15: 10.20, weightP50: 11.20, weightP85: 12.60, weightP97: 13.90, heightP3: 78.0, heightP15: 80.7, heightP50: 83.2, heightP85: 85.7, heightP97: 88.2, headP3: 47.3, headP15: 48.9, headP50: 50.3, headP85: 51.7, headP97: 53.1 },
  { month: 21, weightP3: 9.40, weightP15: 10.80, weightP50: 11.90, weightP85: 13.40, weightP97: 14.80, heightP3: 80.5, heightP15: 83.3, heightP50: 85.9, heightP85: 88.5, heightP97: 91.1, headP3: 47.9, headP15: 49.5, headP50: 51.0, headP85: 52.4, headP97: 53.8 },
  { month: 24, weightP3: 9.90, weightP15: 11.40, weightP50: 12.60, weightP85: 14.20, weightP97: 15.70, heightP3: 82.9, heightP15: 85.8, heightP50: 88.5, heightP85: 91.2, heightP97: 93.9, headP3: 48.4, headP15: 50.0, headP50: 51.5, headP85: 53.0, headP97: 54.4 },
  // 25-36月
  { month: 30, weightP3: 10.80, weightP15: 12.50, weightP50: 13.90, weightP85: 15.70, weightP97: 17.40, heightP3: 87.1, heightP15: 90.2, heightP50: 93.3, heightP85: 96.4, heightP97: 99.5, headP3: 49.1, headP15: 50.8, headP50: 52.3, headP85: 53.8, headP97: 55.3 },
  { month: 36, weightP3: 11.70, weightP15: 13.50, weightP50: 15.10, weightP85: 17.10, weightP97: 19.00, heightP3: 90.9, heightP15: 94.2, heightP50: 97.5, heightP85: 100.8, heightP97: 104.1, headP3: 49.7, headP15: 51.4, headP50: 53.0, headP85: 54.6, headP97: 56.1 },
]

// ── 女童数据（0-36月，按月龄）─────────────────────────────────────────

export const GIRL_GROWTH_STANDARDS: GrowthStandardPoint[] = [
  // month, weightP3, weightP15, weightP50, weightP85, weightP97, heightP3, heightP15, heightP50, heightP85, heightP97, headP3, headP15, headP50, headP85, headP97
  { month: 0,  weightP3: 2.40, weightP15: 2.80, weightP50: 3.20, weightP85: 3.70, weightP97: 4.20, heightP3: 45.5, heightP15: 47.4, heightP50: 49.5, heightP85: 51.5, heightP97: 53.3, headP3: 31.3, headP15: 32.3, headP50: 33.3, headP85: 34.4, headP97: 35.4 },
  { month: 1,  weightP3: 3.20, weightP15: 3.70, weightP50: 4.20, weightP85: 4.80, weightP97: 5.40, heightP3: 49.8, heightP15: 51.7, heightP50: 53.8, heightP85: 55.8, heightP97: 57.7, headP3: 34.4, headP15: 35.5, headP50: 36.6, headP85: 37.7, headP97: 38.7 },
  { month: 2,  weightP3: 4.00, weightP15: 4.60, weightP50: 5.20, weightP85: 5.90, weightP97: 6.60, heightP3: 53.0, heightP15: 55.0, heightP50: 57.1, heightP85: 59.2, heightP97: 61.2, headP3: 36.3, headP15: 37.5, headP50: 38.7, headP85: 39.9, headP97: 41.0 },
  { month: 3,  weightP3: 4.60, weightP15: 5.30, weightP50: 6.00, weightP85: 6.80, weightP97: 7.50, heightP3: 55.6, heightP15: 57.7, heightP50: 59.9, heightP85: 62.0, heightP97: 64.1, headP3: 37.9, headP15: 39.2, headP50: 40.4, headP85: 41.6, headP97: 42.7 },
  { month: 4,  weightP3: 5.10, weightP15: 5.80, weightP50: 6.60, weightP85: 7.50, weightP97: 8.30, heightP3: 57.7, heightP15: 59.9, heightP50: 62.2, heightP85: 64.4, heightP97: 66.5, headP3: 39.1, headP15: 40.4, headP50: 41.7, headP85: 42.9, headP97: 44.1 },
  { month: 5,  weightP3: 5.50, weightP15: 6.30, weightP50: 7.10, weightP85: 8.00, weightP97: 8.90, heightP3: 59.5, heightP15: 61.8, heightP50: 64.1, heightP85: 66.4, heightP97: 68.6, headP3: 40.1, headP15: 41.5, headP50: 42.8, headP85: 44.0, headP97: 45.2 },
  { month: 6,  weightP3: 5.90, weightP15: 6.70, weightP50: 7.50, weightP85: 8.50, weightP97: 9.40, heightP3: 61.2, heightP15: 63.5, heightP50: 65.8, heightP85: 68.2, heightP97: 70.4, headP3: 40.9, headP15: 42.3, headP50: 43.7, headP85: 45.0, headP97: 46.2 },
  { month: 7,  weightP3: 6.20, weightP15: 7.00, weightP50: 7.90, weightP85: 8.90, weightP97: 9.90, heightP3: 62.7, heightP15: 65.1, heightP50: 67.5, heightP85: 69.8, heightP97: 72.1, headP3: 41.6, headP15: 43.0, headP50: 44.4, headP85: 45.7, headP97: 47.0 },
  { month: 8,  weightP3: 6.50, weightP15: 7.30, weightP50: 8.30, weightP85: 9.30, weightP97: 10.30, heightP3: 64.1, heightP15: 66.5, heightP50: 69.0, heightP85: 71.4, heightP97: 73.7, headP3: 42.2, headP15: 43.6, headP50: 45.1, headP85: 46.4, headP97: 47.7 },
  { month: 9,  weightP3: 6.70, weightP15: 7.60, weightP50: 8.60, weightP85: 9.70, weightP97: 10.80, heightP3: 65.5, heightP15: 68.0, heightP50: 70.5, heightP85: 72.9, heightP97: 75.3, headP3: 42.7, headP15: 44.2, headP50: 45.6, headP85: 47.0, headP97: 48.3 },
  { month: 10, weightP3: 6.90, weightP15: 7.90, weightP50: 8.90, weightP85: 10.10, weightP97: 11.20, heightP3: 66.8, heightP15: 69.4, heightP50: 71.9, heightP85: 74.4, heightP97: 76.8, headP3: 43.2, headP15: 44.7, headP50: 46.1, headP85: 47.5, headP97: 48.8 },
  { month: 11, weightP3: 7.10, weightP15: 8.10, weightP50: 9.20, weightP85: 10.40, weightP97: 11.60, heightP3: 68.0, heightP15: 70.6, heightP50: 73.2, heightP85: 75.8, heightP97: 78.3, headP3: 43.6, headP15: 45.1, headP50: 46.6, headP85: 48.0, headP97: 49.3 },
  { month: 12, weightP3: 7.30, weightP15: 8.40, weightP50: 9.50, weightP85: 10.80, weightP97: 12.00, heightP3: 69.1, heightP15: 71.8, heightP50: 74.5, heightP85: 77.1, heightP97: 79.7, headP3: 44.0, headP15: 45.5, headP50: 47.0, headP85: 48.4, headP97: 49.8 },
  // 13-24月
  { month: 15, weightP3: 7.80, weightP15: 9.00, weightP50: 10.20, weightP85: 11.60, weightP97: 12.90, heightP3: 72.1, heightP15: 75.0, heightP50: 77.8, heightP85: 80.6, heightP97: 83.4, headP3: 44.8, headP15: 46.4, headP50: 47.9, headP85: 49.4, headP97: 50.8 },
  { month: 18, weightP3: 8.30, weightP15: 9.60, weightP50: 10.90, weightP85: 12.40, weightP97: 13.90, heightP3: 74.9, heightP15: 77.9, heightP50: 80.9, heightP85: 83.9, heightP97: 86.8, headP3: 45.5, headP15: 47.1, headP50: 48.7, headP85: 50.2, headP97: 51.7 },
  { month: 21, weightP3: 8.80, weightP15: 10.20, weightP50: 11.60, weightP85: 13.20, weightP97: 14.80, heightP3: 77.5, heightP15: 80.7, heightP50: 83.8, heightP85: 86.9, heightP97: 90.0, headP3: 46.1, headP15: 47.8, headP50: 49.4, headP85: 50.9, headP97: 52.4 },
  { month: 24, weightP3: 9.30, weightP15: 10.80, weightP50: 12.30, weightP85: 14.00, weightP97: 15.70, heightP3: 79.9, heightP15: 83.2, heightP50: 86.4, heightP85: 89.7, heightP97: 92.9, headP3: 46.6, headP15: 48.3, headP50: 49.9, headP85: 51.5, headP97: 53.0 },
  // 25-36月
  { month: 30, weightP3: 10.20, weightP15: 11.90, weightP50: 13.60, weightP85: 15.50, weightP97: 17.40, heightP3: 84.1, heightP15: 87.6, heightP50: 91.1, heightP85: 94.6, heightP97: 98.0, headP3: 47.3, headP15: 49.1, headP50: 50.7, headP85: 52.3, headP97: 53.9 },
  { month: 36, weightP3: 11.10, weightP15: 12.90, weightP50: 14.80, weightP85: 16.90, weightP97: 19.00, heightP3: 88.0, heightP15: 91.6, heightP50: 95.3, heightP85: 99.0, heightP97: 102.6, headP3: 47.9, headP15: 49.7, headP50: 51.4, headP85: 53.0, headP97: 54.6 },
]

// ── 工具函数 ────────────────────────────────────────────────────────

/**
 * 根据性别获取对应的标准数据
 */
export function getGrowthStandardsByGender(gender: 'male' | 'female' | string): GrowthStandardPoint[] {
  return gender === 'female' ? GIRL_GROWTH_STANDARDS : BOY_GROWTH_STANDARDS
}

/**
 * 根据月龄获取最接近的标准点（线性插值）
 * @param standards 标准数据数组
 * @param ageMonths 月龄（可以是小数，如 3.5）
 */
export function getStandardAtAge(
  standards: GrowthStandardPoint[],
  ageMonths: number,
): GrowthStandardPoint | null {
  if (standards.length === 0) return null
  
  // 找到最近的两个标准点
  let low = 0
  let high = standards.length - 1
  
  // 边界处理
  if (ageMonths <= standards[0].month) return standards[0]
  if (ageMonths >= standards[high].month) return standards[high]
  
  // 二分查找
  while (low < high - 1) {
    const mid = Math.floor((low + high) / 2)
    if (standards[mid].month <= ageMonths) {
      low = mid
    } else {
      high = mid
    }
  }
  
  // 线性插值
  const p1 = standards[low]
  const p2 = standards[high]
  const t = (ageMonths - p1.month) / (p2.month - p1.month)
  
  return {
    month: ageMonths,
    weightP3: p1.weightP3 + t * (p2.weightP3 - p1.weightP3),
    weightP15: p1.weightP15 + t * (p2.weightP15 - p1.weightP15),
    weightP50: p1.weightP50 + t * (p2.weightP50 - p1.weightP50),
    weightP85: p1.weightP85 + t * (p2.weightP85 - p1.weightP85),
    weightP97: p1.weightP97 + t * (p2.weightP97 - p1.weightP97),
    heightP3: p1.heightP3 + t * (p2.heightP3 - p1.heightP3),
    heightP15: p1.heightP15 + t * (p2.heightP15 - p1.heightP15),
    heightP50: p1.heightP50 + t * (p2.heightP50 - p1.heightP50),
    heightP85: p1.heightP85 + t * (p2.heightP85 - p1.heightP85),
    heightP97: p1.heightP97 + t * (p2.heightP97 - p1.heightP97),
    headP3: p1.headP3 + t * (p2.headP3 - p1.headP3),
    headP15: p1.headP15 + t * (p2.headP15 - p1.headP15),
    headP50: p1.headP50 + t * (p2.headP50 - p1.headP50),
    headP85: p1.headP85 + t * (p2.headP85 - p1.headP85),
    headP97: p1.headP97 + t * (p2.headP97 - p1.headP97),
  }
}

/**
 * 根据实测值计算百分位
 * @param value 实测值
 * @param p3 P3 参考值
 * @param p97 P97 参考值
 * @returns 百分位（3-97 之间），超出范围返回边界值
 */
export function calculatePercentile(value: number, p3: number, p97: number): number {
  // 简化计算：假设正态分布，使用线性映射
  // P3 ≈ μ - 1.88σ, P97 ≈ μ + 1.88σ
  if (value <= p3) return 3
  if (value >= p97) return 97
  const p50 = (p3 + p97) / 2
  const range = p97 - p3
  const offset = value - p50
  const z = (offset / range) * 1.88 * 2
  // z-score to percentile 简化
  const percentile = 50 + z * 25
  return Math.max(3, Math.min(97, Math.round(percentile)))
}

/**
 * 获取百分位对应的颜色编码
 * @param percentile 百分位值
 */
export function getPercentileColor(percentile: number): string {
  if (percentile < 3) return '#F05060'   // 红色（偏低）
  if (percentile < 15) return '#F8A855'  // 橙色（偏中下）
  if (percentile <= 85) return '#4CAF82' // 绿色（正常）
  if (percentile <= 97) return '#F8A855' // 橙色（偏中上）
  return '#F05060'                       // 红色（偏高）
}

/**
 * 获取百分位对应的文本描述
 */
export function getPercentileLabel(percentile: number): string {
  if (percentile < 3) return '低于P3'
  if (percentile < 15) return 'P3-P15'
  if (percentile <= 85) return 'P15-P85'
  if (percentile <= 97) return 'P85-P97'
  return '高于P97'
}
