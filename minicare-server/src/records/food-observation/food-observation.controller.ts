import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../../auth/jwt.guard';
import { FamilyMemberGuard } from '../../family/family-member.guard';
import { RoleGuard } from '../../family/role.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FamilyRole, MinRole } from '../../common/decorators/min-role.decorator';
import { FoodObservationService } from './food-observation.service';
import {
  CreateFoodObservationDto,
  CreateFoodObservationReactionDto,
  ListFoodObservationDto,
  UnlinkObservationHealthDto,
  UpdateFoodObservationStatusDto,
  UpsertFoodObservationLogDto,
} from './dto/food-observation.dto';

@ApiTags('records/food-observations')
@Controller('family/:familyId/records/food-observations')
@UseGuards(JwtGuard, FamilyMemberGuard, RoleGuard)
@ApiBearerAuth()
export class FoodObservationController {
  constructor(private readonly observationService: FoodObservationService) {}

  @Post()
  @MinRole(FamilyRole.MEMBER)
  @ApiOperation({ summary: '创建或复用排敏任务' })
  createOrReuse(@Body() dto: CreateFoodObservationDto) {
    return this.observationService.createOrReuse(dto);
  }

  @Get()
  @ApiOperation({ summary: '查询排敏任务列表' })
  list(@Query() query: ListFoodObservationDto) {
    return this.observationService.list(query.baby_id, query.status);
  }

  @Get(':id')
  @ApiOperation({ summary: '查询排敏任务详情（含打卡日志）' })
  findOne(@Param('id') id: string) {
    return this.observationService.findOne(id);
  }

  @Delete(':id')
  @MinRole(FamilyRole.MEMBER)
  @ApiOperation({ summary: '删除排敏任务（仅无关联健康记录时允许）' })
  remove(@Param('id') id: string) {
    return this.observationService.removeObservation(id);
  }

  @Patch(':id/status')
  @MinRole(FamilyRole.MEMBER)
  @ApiOperation({ summary: '更新排敏任务状态' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateFoodObservationStatusDto) {
    return this.observationService.updateStatus(id, dto);
  }

  @Put(':id/logs/:dayIndex')
  @MinRole(FamilyRole.MEMBER)
  @ApiOperation({ summary: '写入/更新排敏某天打卡日志' })
  upsertLog(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Param('dayIndex') dayIndex: string,
    @Body() dto: UpsertFoodObservationLogDto,
  ) {
    return this.observationService.upsertLog(userId, id, Number(dayIndex), dto);
  }

  @Delete(':id/logs/:dayIndex')
  @MinRole(FamilyRole.MEMBER)
  @ApiOperation({ summary: '删除指定天打卡日志（仅未关联健康记录）' })
  removeLog(@Param('id') id: string, @Param('dayIndex') dayIndex: string) {
    return this.observationService.removeLog(id, Number(dayIndex));
  }

  @Post(':id/logs/:dayIndex/unlink-health')
  @MinRole(FamilyRole.MEMBER)
  @ApiOperation({ summary: '撤销打卡日志与健康记录关联并更新任务状态' })
  unlinkHealth(
    @Param('id') id: string,
    @Param('dayIndex') dayIndex: string,
    @Body() dto: UnlinkObservationHealthDto,
  ) {
    return this.observationService.unlinkLogHealth(id, Number(dayIndex), dto);
  }

  @Post(':id/continue')
  @MinRole(FamilyRole.MEMBER)
  @ApiOperation({ summary: '快速完成当日无反应打卡' })
  continueToday(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.observationService.continueToday(userId, id);
  }

  @Post(':id/reactions')
  @MinRole(FamilyRole.MEMBER)
  @ApiOperation({ summary: '记录过敏反应并关联健康记录' })
  createReaction(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() dto: CreateFoodObservationReactionDto,
  ) {
    return this.observationService.createReaction(userId, id, dto);
  }

  @Get(':id/health-records')
  @ApiOperation({ summary: '查询任务关联的健康记录' })
  getLinkedHealthRecords(@Param('id') id: string) {
    return this.observationService.getLinkedHealthRecords(id);
  }
}
