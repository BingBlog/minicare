import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../../auth/jwt.guard';
import { FamilyMemberGuard } from '../../family/family-member.guard';
import { RoleGuard } from '../../family/role.guard';
import { FeedService } from './feed.service';
import { FeedQueryDto } from './dto/feed-query.dto';

@ApiTags('records/feed')
@Controller('family/:familyId/records/feed')
@UseGuards(JwtGuard, FamilyMemberGuard, RoleGuard)
@ApiBearerAuth()
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Get()
  @ApiOperation({ summary: '获取统一记录时间线（keyset 分页）' })
  list(@Query() query: FeedQueryDto) {
    return this.feedService.list(query);
  }
}
