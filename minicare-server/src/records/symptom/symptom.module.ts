import { Module } from '@nestjs/common';
import { SymptomController } from './symptom.controller';
import { SymptomService } from './symptom.service';
import { AuthModule } from '../../auth/auth.module';
import { FamilyModule } from '../../family/family.module';

@Module({
  imports: [AuthModule, FamilyModule],
  controllers: [SymptomController],
  providers: [SymptomService],
})
export class SymptomModule {}
