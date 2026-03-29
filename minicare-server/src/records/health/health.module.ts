import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { AuthModule } from '../../auth/auth.module';
import { FamilyModule } from '../../family/family.module';

@Module({
  imports: [AuthModule, FamilyModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
