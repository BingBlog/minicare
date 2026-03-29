import { Module } from '@nestjs/common';
import { DiaperController } from './diaper.controller';
import { DiaperService } from './diaper.service';
import { AuthModule } from '../../auth/auth.module';
import { FamilyModule } from '../../family/family.module';

@Module({
  imports: [AuthModule, FamilyModule],
  controllers: [DiaperController],
  providers: [DiaperService],
})
export class DiaperModule {}
