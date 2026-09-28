import { Module } from '@nestjs/common';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';
import { AuthModule } from '../../auth/auth.module';
import { FamilyModule } from '../../family/family.module';
import { TimelineModule } from '../timeline/timeline.module';

@Module({
  imports: [AuthModule, FamilyModule, TimelineModule],
  controllers: [ActivityController],
  providers: [ActivityService],
})
export class ActivityModule {}
