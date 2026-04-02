/**
 * 婴儿辅食 API
 * GET /api/baby-foods
 * 无需登录，公开数据，支持一次性全量加载后本地过滤
 */
import { request } from './http'

export interface BabyFood {
  id: string
  name: string
  category: 'grain' | 'vegetable' | 'fruit' | 'meat_egg' | 'bean'
  stages: number[]
  startMonth: number
  popularity: 1 | 2 | 3
  allergen: boolean
  note?: string
}

export interface FoodCategory {
  key: string
  label: string
  emoji: string
}

interface BabyFoodsResponse {
  items: BabyFood[]
  categories: FoodCategory[]
}

let _cachedFoods: BabyFood[] | null = null
let _cachedCategories: FoodCategory[] | null = null

/** 一次性加载全量辅食数据（自动缓存） */
export async function fetchBabyFoods(): Promise<{
  items: BabyFood[]
  categories: FoodCategory[]
}> {
  if (_cachedFoods && _cachedCategories) {
    return { items: _cachedFoods, categories: _cachedCategories }
  }
  const res = await request<BabyFoodsResponse>('/api/baby-foods', { auth: false })
  _cachedFoods = res.items
  _cachedCategories = res.categories
  return { items: _cachedFoods, categories: _cachedCategories }
}

/** 本地搜索（需先调用 fetchBabyFoods 加载数据） */
export function searchBabyFoods(keyword: string, allFoods: BabyFood[]): BabyFood[] {
  const kw = keyword.trim().toLowerCase()
  if (!kw) return []
  return allFoods.filter((f) => f.name.toLowerCase().includes(kw)).slice(0, 8)
}

/** 按分类获取辅食列表 */
export function getFoodsByCategory(category: string, allFoods: BabyFood[]): BabyFood[] {
  return allFoods.filter((f) => f.category === category)
}
