import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MedicationService } from './medication.service';
import { JwtGuard } from '../../auth/jwt.guard';
import { FamilyMemberGuard } from '../../family/family-member.guard';
import { RoleGuard } from '../../family/role.guard';
import { CreateMedicationRecordDto, UpdateMedicationRecordDto } from './dto/create-medication-record.dto';
import { CreateMedicationBatchDto, UpdateMedicationBatchDto } from './dto/medication-batch.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MinRole, FamilyRole } from '../../common/decorators/min-role.decorator';

/**
 * 服药打卡 CRUD（F14）
 * 软删除：删除仅标记 deleted_at，并同步移除物化时间线行。
 *
 * 多药批次（025）：POST /batch 新建；GET/PUT /:id/batch 以批内任一条为锚点
 * 加载/整批保存；DELETE /:id 删除批内任一条 = 删整批（与合并展示语义对齐）。
 */
@ApiTags('records/medication')
@Controller('family/:familyId/records/medication')
@UseGuards(JwtGuard, FamilyMemberGuard, RoleGuard)
@ApiBearerAuth()
export class MedicationRecordController {
  constructor(private readonly medicationService: MedicationService) {}

  @Post()
  @MinRole(FamilyRole.MEMBER)
  @ApiOperation({ summary: '服药打卡（单次，旧版兼容）' })
  create(@CurrentUser() userId: string, @Body() dto: CreateMedicationRecordDto) {
    return this.medicationService.createRecord(userId, dto);
  }

  @Post('batch')
  @MinRole(FamilyRole.MEMBER)
  @ApiOperation({ summary: '多药服药打卡（一次多种药，返回 batch_id）' })
  createBatch(@CurrentUser() userId: string, @Body() dto: CreateMedicationBatchDto) {
    return this.medicationService.createBatch(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: '按日查询服药记录，date=YYYY-MM-DD 默认今日' })
  list(@Query('baby_id') babyId: string, @Query('date') date?: string) {
    return this.medicationService.listRecords(babyId, date);
  }

  @Get(':id')
  @ApiOperation({ summary: '单条服药记录' })
  findOne(@Param('id') id: string) {
    return this.medicationService.findOneRecord(id);
  }

  @Get(':id/batch')
  @ApiOperation({ summary: '加载该记录所属服药批次全部成员（历史单药返回单条数组）' })
  getBatch(@Param('id') id: string) {
    return this.medicationService.getBatch(id);
  }

  @Patch(':id')
  @MinRole(FamilyRole.MEMBER)
  @ApiOperation({ summary: '编辑服药记录' })
  update(@Param('id') id: string, @Body() dto: UpdateMedicationRecordDto) {
    return this.medicationService.updateRecord(id, dto);
  }

  @Put(':id/batch')
  @MinRole(FamilyRole.MEMBER)
  @ApiOperation({ summary: '整批保存服药记录（保留行更新/新增行插入/缺失行软删）' })
  updateBatch(
    @Param('id') id: string,
    @CurrentUser() userId: string,
    @Body() dto: UpdateMedicationBatchDto,
  ) {
    return this.medicationService.updateBatch(id, userId, dto);
  }

  @Delete(':id')
  @MinRole(FamilyRole.MEMBER)
  @ApiOperation({ summary: '删除服药记录（软删除；多药批次删除整批）' })
  remove(@Param('id') id: string) {
    return this.medicationService.removeRecord(id);
  }
}
