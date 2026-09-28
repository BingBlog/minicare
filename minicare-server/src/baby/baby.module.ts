import { Module } from '@nestjs/common';
import { BabyController } from './baby.controller';
import { BabyMineController } from './baby-mine.controller';
import { BabyService } from './baby.service';
import { AuthModule } from '../auth/auth.module';
import { FamilyModule } from '../family/family.module';

@Module({
  imports: [AuthModule, FamilyModule],
  controllers: [BabyController, BabyMineController],
  providers: [BabyService],
  exports: [BabyService],
})
export class BabyModule {}
