import { Module } from '@nestjs/common';
import { DiaperController } from './diaper.controller';
import { DiaperService } from './diaper.service';
import { AuthModule } from '../../auth/auth.module';
import { FamilyModule } from '../../family/family.module';
import { TimelineModule } from '../timeline/timeline.module';

@Module({
  imports: [AuthModule, FamilyModule, TimelineModule],
  controllers: [DiaperController],
  providers: [DiaperService],
})
export class DiaperModule {}
