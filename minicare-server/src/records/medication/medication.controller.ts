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
import { CreateMedicationDto, UpdateMedicationDto } from './dto/create-medication.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MinRole, FamilyRole } from '../../common/decorators/min-role.decorator';

/**
 * 药品清单 CRUD（宝宝级，F14）
 * 仅返回未软删记录；删除为软删除
 */
@ApiTags('records/medication')
@Controller('family/:familyId/medications')
@UseGuards(JwtGuard, FamilyMemberGuard, RoleGuard)
@ApiBearerAuth()
export class MedicationListController {
  constructor(private readonly medicationService: MedicationService) {}

  @Get()
  @ApiOperation({ summary: '获取宝宝药品清单（未删除）' })
  list(
    @Param('familyId') familyId: string,
    @Query('baby_id') babyId: string,
  ) {
    return this.medicationService.listMedications(familyId, babyId);
  }

  @Post()
  @MinRole(FamilyRole.MEMBER)
  @ApiOperation({ summary: '创建药品（同宝宝同名去重）' })
  create(
    @Param('familyId') familyId: string,
    @CurrentUser() userId: string,
    @Body() dto: CreateMedicationDto,
  ) {
    return this.medicationService.createMedication(familyId, dto.baby_id, userId, dto);
  }

  @Patch(':id')
  @MinRole(FamilyRole.MEMBER)
  @ApiOperation({ summary: '更新药品' })
  update(
    @Param('familyId') familyId: string,
    @Query('baby_id') babyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMedicationDto,
  ) {
    return this.medicationService.updateMedication(familyId, babyId, id, dto);
  }

  @Delete(':id')
  @MinRole(FamilyRole.MEMBER)
  @ApiOperation({ summary: '删除药品（软删除，历史打卡保留）' })
  remove(@Param('id') id: string) {
    return this.medicationService.removeMedication(id);
  }
}
