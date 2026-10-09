import { Module } from '@nestjs/common';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';
import { AuthModule } from '../auth/auth.module';
import { FamilyModule } from '../family/family.module';

/**
 * 宝宝每日作息计划模块（PRD-009）
 *
 * 依赖 `FamilyService.getTodayRecords` 取当日记录 —— 刻意复用首页时间轴的同一份口径，
 * 避免自建一套记录查询导致"首页说完成、日程 Bar 说未完成"。
 */
@Module({
  imports: [AuthModule, FamilyModule],
  controllers: [ScheduleController],
  providers: [ScheduleService],
})
export class ScheduleModule {}
