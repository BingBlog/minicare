import { Module } from '@nestjs/common';
import { GrowthController } from './growth.controller';
import { GrowthService } from './growth.service';
import { AuthModule } from '../../auth/auth.module';
import { FamilyModule } from '../../family/family.module';
import { TimelineModule } from '../timeline/timeline.module';

@Module({
  imports: [AuthModule, FamilyModule, TimelineModule],
  controllers: [GrowthController],
  providers: [GrowthService],
  exports: [GrowthService], // 供 records/medical 儿保测量同步（TECH-011）
})
export class GrowthModule {}
