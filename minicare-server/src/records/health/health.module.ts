import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { AuthModule } from '../../auth/auth.module';
import { FamilyModule } from '../../family/family.module';
import { TimelineModule } from '../timeline/timeline.module';

@Module({
  imports: [AuthModule, FamilyModule, TimelineModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
