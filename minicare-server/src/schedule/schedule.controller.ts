import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ScheduleService } from './schedule.service';
import { JwtGuard } from '../auth/jwt.guard';
import { FamilyMemberGuard } from '../family/family-member.guard';
import { RoleGuard } from '../family/role.guard';
import { MinRole, FamilyRole } from '../common/decorators/min-role.decorator';
import { SaveScheduleTemplateDto } from './dto/save-schedule-template.dto';

/**
 * 宝宝每日作息计划（PRD-009）
 *
 * 路由挂在 `family/:familyId` 之下 —— 与既有的 `family/:familyId/records/*` 保持一致，
 * 因为 `FamilyMemberGuard` 从 `params.familyId` / `body.family_id` / `query.family_id` 取家庭。
 * 宝宝维度用 `?baby_id=` 传入（多孩子家庭按 baby 隔离）。
 */
@ApiTags('family/schedule')
@Controller('family/:familyId/schedule')
@UseGuards(JwtGuard, FamilyMemberGuard, RoleGuard)
@ApiBearerAuth()
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @Get('template')
  @ApiOperation({ summary: '取作息计划模板；库中无项时返回系统默认模板并带 is_default=true（不写库）' })
  getTemplate(@Param('familyId') familyId: string, @Query('baby_id') babyId: string) {
    return this.scheduleService.getTemplate(familyId, babyId);
  }

  @Put('template')
  @MinRole(FamilyRole.MEMBER)
  @ApiOperation({ summary: '全量保存作息计划模板（差集语义：未提交的已有项软删除）' })
  saveTemplate(
    @Param('familyId') familyId: string,
    @Query('baby_id') babyId: string,
    @Body() dto: SaveScheduleTemplateDto,
  ) {
    return this.scheduleService.saveTemplate(familyId, babyId, dto);
  }

  @Get('today')
  @ApiOperation({
    summary: '今日日程：模板项 × 当日记录实时派生状态与进度（不落库；停用项不返回）',
  })
  getToday(@Param('familyId') familyId: string, @Query('baby_id') babyId: string) {
    return this.scheduleService.getToday(familyId, babyId);
  }
}
