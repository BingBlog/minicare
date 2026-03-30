import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FeedingService } from './feeding.service';
import { JwtGuard } from '../../auth/jwt.guard';
import { FamilyMemberGuard } from '../../family/family-member.guard';
import { RoleGuard } from '../../family/role.guard';
import { CreateFeedingDto } from './dto/create-feeding.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MinRole, FamilyRole } from '../../common/decorators/min-role.decorator';

@ApiTags('records/feeding')
@Controller('family/:familyId/records/feeding')
@UseGuards(JwtGuard, FamilyMemberGuard, RoleGuard)
@ApiBearerAuth()
export class FeedingController {
  constructor(private readonly feedingService: FeedingService) {}

  @Post()
  @MinRole(FamilyRole.MEMBER)
  @ApiOperation({ summary: '记录喂养' })
  create(@CurrentUser() userId: string, @Body() dto: CreateFeedingDto) {
    return this.feedingService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: '获取喂养记录列表' })
  findAll(
    @Query('baby_id') babyId: string,
    @Query('limit') limit = 20,
    @Query('offset') offset = 0,
  ) {
    return this.feedingService.findAll(babyId, Number(limit), Number(offset));
  }

  @Delete(':id')
  @MinRole(FamilyRole.MEMBER)
  @ApiOperation({ summary: '删除喂养记录' })
  remove(@Param('id') id: string) {
    return this.feedingService.remove(id);
  }
}
