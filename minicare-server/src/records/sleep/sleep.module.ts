import { Module } from '@nestjs/common';
import { SleepController } from './sleep.controller';
import { SleepService } from './sleep.service';
import { AuthModule } from '../../auth/auth.module';
import { FamilyModule } from '../../family/family.module';

@Module({
  imports: [AuthModule, FamilyModule],
  controllers: [SleepController],
  providers: [SleepService],
  exports: [SleepService],  // 导出供 scheduler 超时检查使用
})
export class SleepModule {}
