import { Module } from '@nestjs/common';
import { MedicationListController } from './medication.controller';
import { MedicationRecordController } from './medication-record.controller';
import { MedicationService } from './medication.service';
import { AuthModule } from '../../auth/auth.module';
import { FamilyModule } from '../../family/family.module';
import { TimelineModule } from '../timeline/timeline.module';

@Module({
  imports: [AuthModule, FamilyModule, TimelineModule],
  controllers: [MedicationListController, MedicationRecordController],
  providers: [MedicationService],
})
export class MedicationModule {}
