import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MedicationService } from './medication.service';
import { JwtGuard } from '../../auth/jwt.guard';
import { FamilyMemberGuard } from '../../family/family-member.guard';
import { RoleGuard } from '../../family/role.guard';
import { CreateMedicationRecordDto, UpdateMedicationRecordDto } from './dto/create-medication-record.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MinRole, FamilyRole } from '../../common/decorators/min-role.decorator';

/**
 * 服药打卡 CRUD（F14）
 * 软删除：删除仅标记 deleted_at，并同步移除物化时间线行
 */
@ApiTags('records/medication')
@Controller('family/:familyId/records/medication')
@UseGuards(JwtGuard, FamilyMemberGuard, RoleGuard)
@ApiBearerAuth()
export class MedicationRecordController {
  constructor(private readonly medicationService: MedicationService) {}

  @Post()
  @MinRole(FamilyRole.MEMBER)
  @ApiOperation({ summary: '服药打卡（单次）' })
  create(@CurrentUser() userId: string, @Body() dto: CreateMedicationRecordDto) {
    return this.medicationService.createRecord(userId, dto);
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

  @Patch(':id')
  @MinRole(FamilyRole.MEMBER)
  @ApiOperation({ summary: '编辑服药记录' })
  update(@Param('id') id: string, @Body() dto: UpdateMedicationRecordDto) {
    return this.medicationService.updateRecord(id, dto);
  }

  @Delete(':id')
  @MinRole(FamilyRole.MEMBER)
  @ApiOperation({ summary: '删除服药记录（软删除）' })
  remove(@Param('id') id: string) {
    return this.medicationService.removeRecord(id);
  }
}
