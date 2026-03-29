import { Module } from '@nestjs/common';
import { GrowthController } from './growth.controller';
import { GrowthService } from './growth.service';
import { AuthModule } from '../../auth/auth.module';
import { FamilyModule } from '../../family/family.module';

@Module({
  imports: [AuthModule, FamilyModule],
  controllers: [GrowthController],
  providers: [GrowthService],
})
export class GrowthModule {}
