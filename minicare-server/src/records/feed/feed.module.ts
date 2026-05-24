import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { FamilyModule } from '../../family/family.module';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';

@Module({
  imports: [AuthModule, FamilyModule],
  controllers: [FeedController],
  providers: [FeedService],
})
export class FeedModule {}
