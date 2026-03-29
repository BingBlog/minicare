import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MedicalService } from './medical.service';
import { JwtGuard } from '../../auth/jwt.guard';
import { FamilyMemberGuard } from '../../family/family-member.guard';
import { RoleGuard } from '../../family/role.guard';
import { CreateMedicalDto } from './dto/create-medical.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MinRole, FamilyRole } from '../../common/decorators/min-role.decorator';

@ApiTags('records/medical')
@Controller('family/:familyId/records/medical')
@UseGuards(JwtGuard, FamilyMemberGuard, RoleGuard)
@ApiBearerAuth()
export class MedicalController {
  constructor(private readonly medicalService: MedicalService) {}

  @Post() @MinRole(FamilyRole.EDITOR)
  create(@CurrentUser() userId: string, @Body() dto: CreateMedicalDto) {
    return this.medicalService.create(userId, dto);
  }

  @Get()
  findAll(@Query('baby_id') babyId: string, @Query('limit') limit = 20, @Query('offset') offset = 0) {
    return this.medicalService.findAll(babyId, Number(limit), Number(offset));
  }

  @Delete(':id') @MinRole(FamilyRole.EDITOR)
  remove(@Param('id') id: string) { return this.medicalService.remove(id); }
}
