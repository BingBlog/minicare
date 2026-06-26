import { Module } from '@nestjs/common';
import { FeedingController } from './feeding.controller';
import { FeedingService } from './feeding.service';
import { AuthModule } from '../../auth/auth.module';
import { FamilyModule } from '../../family/family.module';
import { TimelineModule } from '../timeline/timeline.module';
import { FoodObservationModule } from '../food-observation/food-observation.module';

@Module({
  imports: [AuthModule, FamilyModule, TimelineModule, FoodObservationModule],
  controllers: [FeedingController],
  providers: [FeedingService],
})
export class FeedingModule {}
