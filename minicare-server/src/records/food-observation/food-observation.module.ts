import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { FamilyModule } from '../../family/family.module';
import { TimelineModule } from '../timeline/timeline.module';
import { FoodObservationController } from './food-observation.controller';
import { FoodObservationService } from './food-observation.service';

@Module({
  imports: [AuthModule, FamilyModule, TimelineModule],
  controllers: [FoodObservationController],
  providers: [FoodObservationService],
  exports: [FoodObservationService],
})
export class FoodObservationModule {}
