import { Module } from '@nestjs/common';
import { FeedingController } from './feeding.controller';
import { FeedingService } from './feeding.service';
import { AuthModule } from '../../auth/auth.module';
import { FamilyModule } from '../../family/family.module';

@Module({
  imports: [AuthModule, FamilyModule],
  controllers: [FeedingController],
  providers: [FeedingService],
})
export class FeedingModule {}
