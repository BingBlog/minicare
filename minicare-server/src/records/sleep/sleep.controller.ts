import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SleepService } from './sleep.service';
import { JwtGuard } from '../../auth/jwt.guard';
import { FamilyMemberGuard } from '../../family/family-member.guard';
import { RoleGuard } from '../../family/role.guard';
import { StartSleepDto, EndSleepDto, UpdateSleepDto, CreateCompleteSleepDto } from './dto/create-sleep.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MinRole, FamilyRole } from '../../common/decorators/min-role.decorator';

@ApiTags('records/sleep')
@Controller('family/:familyId/records/sleep')
@UseGuards(JwtGuard, FamilyMemberGuard, RoleGuard)
@ApiBearerAuth()
export class SleepController {
  constructor(private readonly sleepService: SleepService) {}

  @Post('start')
  @MinRole(FamilyRole.MEMBER)
  @ApiOperation({ summary: '开始睡眠计时' })
  start(@CurrentUser() userId: string, @Body() dto: StartSleepDto) {
    return this.sleepService.startSleep(userId, dto);
  }

  @Post('complete')
  @MinRole(FamilyRole.MEMBER)
  @ApiOperation({ summary: '补录已完成睡眠（单次写入，可与进行中计时并存）' })
  createComplete(@CurrentUser() userId: string, @Body() dto: CreateCompleteSleepDto) {
    return this.sleepService.createCompleteSleep(userId, dto);
  }

  @Patch(':id/end')
  @MinRole(FamilyRole.MEMBER)
  @ApiOperation({ summary: '结束睡眠计时' })
  end(@Param('id') id: string, @Body() dto: EndSleepDto) {
    return this.sleepService.endSleep(id, dto);
  }

  @Get('ongoing')
  @ApiOperation({ summary: '获取当前进行中的睡眠（计时器用）' })
  getOngoing(@Query('baby_id') babyId: string) {
    return this.sleepService.getOngoing(babyId);
  }

  @Get()
  @ApiOperation({ summary: '获取睡眠记录列表' })
  findAll(
    @Query('baby_id') babyId: string,
    @Query('limit') limit = 20,
    @Query('offset') offset = 0,
  ) {
    return this.sleepService.findAll(babyId, Number(limit), Number(offset));
  }

  @Get(':id')
  @ApiOperation({ summary: '获取单条睡眠记录' })
  findOne(@Param('id') id: string) {
    return this.sleepService.findOne(id);
  }

  @Patch(':id')
  @MinRole(FamilyRole.MEMBER)
  @ApiOperation({ summary: '更新睡眠记录（质量、时段、备注、时间）' })
  update(@Param('id') id: string, @Body() dto: UpdateSleepDto) {
    return this.sleepService.update(id, dto);
  }

  @Delete(':id')
  @MinRole(FamilyRole.MEMBER)
  @ApiOperation({ summary: '删除睡眠记录（ongoing / ended 均可，取消计时时使用）' })
  remove(@Param('id') id: string) {
    return this.sleepService.remove(id);
  }
}