/**
 * @deprecated
 * 此文件已迁移至 src/api/（按业务模块拆分）。
 *
 * 如需引入请改用：
 *   import { authApi, familyApi, babyApi, recordsApi } from '@/api'
 *   import type { User, Baby, ... } from '@/api'
 *
 * 本文件保留为向后兼容层，仅做重新导出，不含任何实现逻辑。
 */
export {
  setToken,
  removeToken,
  authApi,
  familyApi,
  babyApi,
  recordsApi,
} from '@/api'

export type {
  User,
  AuthResult,
  Family,
  FamilyMember,
  AllergyType,
  AllergyLevel,
  Baby,
  CreateBabyDto,
  UpdateBabyDto,
  RecordBase,
  FeedType,
  BreastSide,
  CreateFeedingDto,
  FeedingRecord,
  CreateSleepDto,
  SleepRecord,
  DiaperType,
  CreateDiaperDto,
  DiaperRecord,
  ActivityType,
  CreateActivityDto,
  ActivityRecord,
  CreateHealthDto,
  HealthRecord,
  CreateGrowthDto,
  GrowthRecord,
  VisitType,
  MedicationItem,
  CreateMedicalDto,
  MedicalRecord,
  MoodType,
  SpiritLevel,
  CreateSymptomDto,
  SymptomRecord,
  TodayRecord,
} from '@/api'
