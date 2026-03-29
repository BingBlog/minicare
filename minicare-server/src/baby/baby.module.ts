import { Module } from '@nestjs/common';
import { BabyController } from './baby.controller';
import { BabyService } from './baby.service';
import { AuthModule } from '../auth/auth.module';
import { FamilyModule } from '../family/family.module';

@Module({
  imports: [AuthModule, FamilyModule],
  controllers: [BabyController],
  providers: [BabyService],
  exports: [BabyService],  // 导出供 records/ 模块验证 baby 归属
})
export class BabyModule {}
