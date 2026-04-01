/**
 * API 模块统一出口
 *
 * 用法：
 *   import { authApi, familyApi, babyApi, recordsApi } from '@/api'
 *   import type { User, Baby, CreateFeedingDto } from '@/api'
 *
 * 目录结构：
 *   src/api/
 *     types.ts         — 全局 TS 类型
 *     http.ts          — HTTP 基础工具（request / token 管理）
 *     auth.ts          — 认证模块
 *     family.ts        — 家庭模块
 *     baby.ts          — 宝宝档案模块
 *     records/
 *       feeding.ts     — 饮食记录
 *       sleep.ts       — 睡眠记录
 *       diaper.ts      — 尿布记录
 *       activity.ts    — 活动记录
 *       health.ts      — 健康记录
 *       growth.ts      — 生长记录
 *       medical.ts     — 医疗记录
 *       symptom.ts     — 表现记录
 *       index.ts       — records 聚合（含 todayApi）
 */

// ── HTTP 工具 ─────────────────────────────────────────────────────
export { setToken, removeToken } from './http'

// ── 业务 API ─────────────────────────────────────────────────────
export { authApi } from './auth'
export { familyApi } from './family'
export { babyApi } from './baby'

// Records 聚合对象（保持与旧版 recordsApi.xxx 一致的调用方式）
import { feedingApi } from './records/feeding'
import { sleepApi } from './records/sleep'
import { diaperApi } from './records/diaper'
import { activityApi } from './records/activity'
import { healthApi } from './records/health'
import { growthApi } from './records/growth'
import { medicalApi } from './records/medical'
import { symptomApi } from './records/symptom'
import { todayApi } from './records'

export const recordsApi = {
  feeding: feedingApi,
  sleep: sleepApi,
  diaper: diaperApi,
  activity: activityApi,
  health: healthApi,
  growth: growthApi,
  medical: medicalApi,
  symptom: symptomApi,
  today: todayApi.list,
}

// 也单独导出各模块 API，方便按需引入
export {
  feedingApi,
  sleepApi,
  diaperApi,
  activityApi,
  healthApi,
  growthApi,
  medicalApi,
  symptomApi,
  todayApi,
}

// ── TS 类型全量导出 ──────────────────────────────────────────────
export type {
  // 通用
  PaginationParams,
  ListResult,
  // Auth
  User,
  AuthResult,
  // Family
  Family,
  FamilyMember,
  // Baby
  AllergyType,
  AllergyLevel,
  Baby,
  CreateBabyDto,
  UpdateBabyDto,
  // Records base
  RecordBase,
  // Feeding
  FeedType,
  BreastSide,
  CreateFeedingDto,
  FeedingRecord,
  // Sleep
  StartSleepDto,
  EndSleepDto,
  CreateSleepDto,
  SleepRecord,
  // Diaper
  DiaperType,
  CreateDiaperDto,
  DiaperRecord,
  // Activity
  ActivityType,
  CreateActivityDto,
  ActivityRecord,
  // Health
  MoodType,
  CreateHealthDto,
  UpdateHealthDto,
  HealthRecord,
  // Growth
  CreateGrowthDto,
  UpdateGrowthDto,
  GrowthRecord,
  // Medical
  VisitType,
  MedicationItem,
  CreateMedicalDto,
  UpdateMedicalDto,
  MedicalRecord,
  // Symptom
  SymptomItem,
  CreateSymptomDto,
  SymptomRecord,
  // Timeline
  TodayRecord,
  // 通用记录条目（记录列表页使用）
  RecordItem,
} from './types'