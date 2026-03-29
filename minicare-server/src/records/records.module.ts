import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FamilyModule } from '../family/family.module';
import { BabyModule } from '../baby/baby.module';
import { FeedingModule } from './feeding/feeding.module';
import { SleepModule } from './sleep/sleep.module';
import { DiaperModule } from './diaper/diaper.module';
import { HealthModule } from './health/health.module';
import { SymptomModule } from './symptom/symptom.module';
import { ActivityModule } from './activity/activity.module';
import { GrowthModule } from './growth/growth.module';
import { MedicalModule } from './medical/medical.module';

/**
 * RecordsModule — 汇总 8 类业务记录子模块
 *
 * 所有记录 API 均要求：
 * 1. JwtGuard  → 验证 JWT
 * 2. FamilyMemberGuard → 验证是家庭成员
 * 3. RoleGuard → 读操作 VIEWER，写操作 EDITOR
 */
@Module({
  imports: [
    AuthModule,
    FamilyModule,
    BabyModule,
    FeedingModule,
    SleepModule,
    DiaperModule,
    HealthModule,
    SymptomModule,
    ActivityModule,
    GrowthModule,
    MedicalModule,
  ],
})
export class RecordsModule {}
