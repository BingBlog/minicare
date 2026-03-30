import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';
import { JwtGuard } from '../../auth/jwt.guard';
import { FamilyMemberGuard } from '../../family/family-member.guard';
import { RoleGuard } from '../../family/role.guard';
import { CreateHealthDto } from './dto/create-health.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MinRole, FamilyRole } from '../../common/decorators/min-role.decorator';

@ApiTags('records/health')
@Controller('family/:familyId/records/health')
@UseGuards(JwtGuard, FamilyMemberGuard, RoleGuard)
@ApiBearerAuth()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Post() @MinRole(FamilyRole.MEMBER)
  create(@CurrentUser() userId: string, @Body() dto: CreateHealthDto) {
    return this.healthService.create(userId, dto);
  }

  @Get()
  findAll(@Query('baby_id') babyId: string, @Query('limit') limit = 20, @Query('offset') offset = 0) {
    return this.healthService.findAll(babyId, Number(limit), Number(offset));
  }

  @Delete(':id') @MinRole(FamilyRole.MEMBER)
  remove(@Param('id') id: string) { return this.healthService.remove(id); }
}
