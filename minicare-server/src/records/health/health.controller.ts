import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';
import { JwtGuard } from '../../auth/jwt.guard';
import { FamilyMemberGuard } from '../../family/family-member.guard';
import { RoleGuard } from '../../family/role.guard';
import { CreateHealthDto, UpdateHealthDto } from './dto/create-health.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MinRole, FamilyRole } from '../../common/decorators/min-role.decorator';

@ApiTags('records/health')
@Controller('family/:familyId/records/health')
@UseGuards(JwtGuard, FamilyMemberGuard, RoleGuard)
@ApiBearerAuth()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Post() @MinRole(FamilyRole.MEMBER)
  @ApiOperation({ summary: '创建健康记录' })
  create(@CurrentUser() userId: string, @Body() dto: CreateHealthDto) {
    return this.healthService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: '获取健康记录列表（日期分页）' })
  findAll(@Query('baby_id') babyId: string, @Query('before_date') beforeDate?: string) {
    return this.healthService.findAll(babyId, beforeDate);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取单条健康记录' })
  findOne(@Param('id') id: string) {
    return this.healthService.findOne(id);
  }

  @Patch(':id') @MinRole(FamilyRole.MEMBER)
  @ApiOperation({ summary: '更新健康记录' })
  update(@Param('id') id: string, @Body() dto: UpdateHealthDto) {
    return this.healthService.update(id, dto);
  }

  @Delete(':id') @MinRole(FamilyRole.MEMBER)
  @ApiOperation({ summary: '删除健康记录' })
  remove(@Param('id') id: string) { return this.healthService.remove(id); }
}