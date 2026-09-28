import { Module } from '@nestjs/common';
import { MedicalController } from './medical.controller';
import { MedicalService } from './medical.service';
import { VaccineBookService } from './vaccine-book.service';
import { AuthModule } from '../../auth/auth.module';
import { FamilyModule } from '../../family/family.module';
import { TimelineModule } from '../timeline/timeline.module';
import { GrowthModule } from '../growth/growth.module';

@Module({
  imports: [AuthModule, FamilyModule, TimelineModule, GrowthModule],
  controllers: [MedicalController],
  providers: [MedicalService, VaccineBookService],
})
export class MedicalModule {}
