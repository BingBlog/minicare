import { Module } from '@nestjs/common';
import { MedicalController } from './medical.controller';
import { MedicalService } from './medical.service';
import { AuthModule } from '../../auth/auth.module';
import { FamilyModule } from '../../family/family.module';

@Module({
  imports: [AuthModule, FamilyModule],
  controllers: [MedicalController],
  providers: [MedicalService],
})
export class MedicalModule {}
