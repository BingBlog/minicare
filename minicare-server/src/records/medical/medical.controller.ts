import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MedicalService } from './medical.service';
import { JwtGuard } from '../../auth/jwt.guard';
import { FamilyMemberGuard } from '../../family/family-member.guard';
import { RoleGuard } from '../../family/role.guard';
import { CreateMedicalDto, UpdateMedicalDto } from './dto/create-medical.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MinRole, FamilyRole } from '../../common/decorators/min-role.decorator';

@ApiTags('records/medical')
@Controller('family/:familyId/records/medical')
@UseGuards(JwtGuard, FamilyMemberGuard, RoleGuard)
@ApiBearerAuth()
export class MedicalController {
  constructor(private readonly medicalService: MedicalService) {}

  @Post() @MinRole(FamilyRole.MEMBER)
  create(@CurrentUser() userId: string, @Body() dto: CreateMedicalDto) {
    return this.medicalService.create(userId, dto);
  }

  @Get()
  findAll(@Query('baby_id') babyId: string, @Query('before_date') beforeDate?: string) {
    return this.medicalService.findAll(babyId, beforeDate);
  }

  /** 下次复查提醒（首页展示）：未来最近一条，无则最近过期一条标记 overdue，均无返回 null */
  @Get('next-follow-up')
  getNextFollowUp(@Query('baby_id') babyId: string) {
    return this.medicalService.findNextFollowUp(babyId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.medicalService.findOne(id);
  }

  @Patch(':id') @MinRole(FamilyRole.MEMBER)
  update(@Param('id') id: string, @Body() dto: UpdateMedicalDto) {
    return this.medicalService.update(id, dto);
  }

  @Delete(':id') @MinRole(FamilyRole.MEMBER)
  remove(@Param('id') id: string) { return this.medicalService.remove(id); }
}