import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ActivityService } from './activity.service';
import { JwtGuard } from '../../auth/jwt.guard';
import { FamilyMemberGuard } from '../../family/family-member.guard';
import { RoleGuard } from '../../family/role.guard';
import { CreateActivityDto } from './dto/create-activity.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MinRole, FamilyRole } from '../../common/decorators/min-role.decorator';

@ApiTags('records/activity')
@Controller('family/:familyId/records/activity')
@UseGuards(JwtGuard, FamilyMemberGuard, RoleGuard)
@ApiBearerAuth()
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Post() @MinRole(FamilyRole.EDITOR)
  create(@CurrentUser() userId: string, @Body() dto: CreateActivityDto) {
    return this.activityService.create(userId, dto);
  }

  @Get()
  findAll(@Query('baby_id') babyId: string, @Query('limit') limit = 20, @Query('offset') offset = 0) {
    return this.activityService.findAll(babyId, Number(limit), Number(offset));
  }

  @Delete(':id') @MinRole(FamilyRole.EDITOR)
  remove(@Param('id') id: string) { return this.activityService.remove(id); }
}
