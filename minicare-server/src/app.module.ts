import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './common/database/database.module';
import { CloudbaseModule } from './common/cloudbase/cloudbase.module';
import { AuthModule } from './auth/auth.module';
import { FamilyModule } from './family/family.module';
import { BabyModule } from './baby/baby.module';
import { RecordsModule } from './records/records.module';
import { StorageModule } from './storage/storage.module';
import { WebsocketModule } from './websocket/websocket.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { BabyFoodsModule } from './baby-foods/baby-foods.module';

@Module({
  imports: [
    // 定时任务全局启用
    ScheduleModule.forRoot(),

    // 公共基础设施模块（全局单例）
    DatabaseModule,
    CloudbaseModule,

    // 业务模块
    AuthModule,
    FamilyModule,
    BabyModule,
    RecordsModule,
    StorageModule,
    WebsocketModule,
    SchedulerModule,
    BabyFoodsModule,
  ],
})
export class AppModule {}
