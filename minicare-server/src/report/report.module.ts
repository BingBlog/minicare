import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FamilyModule } from '../family/family.module';
import { BabyModule } from '../baby/baby.module';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';

@Module({
  imports: [AuthModule, FamilyModule, BabyModule],
  controllers: [ReportController],
  providers: [ReportService],
})
export class ReportModule {}
