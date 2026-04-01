import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SymptomService } from './symptom.service';
import { JwtGuard } from '../../auth/jwt.guard';
import { FamilyMemberGuard } from '../../family/family-member.guard';
import { RoleGuard } from '../../family/role.guard';
import { CreateSymptomDto, UpdateSymptomDto } from './dto/create-symptom.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MinRole, FamilyRole } from '../../common/decorators/min-role.decorator';

@ApiTags('records/symptom')
@Controller('family/:familyId/records/symptom')
@UseGuards(JwtGuard, FamilyMemberGuard, RoleGuard)
@ApiBearerAuth()
export class SymptomController {
  constructor(private readonly symptomService: SymptomService) {}

  @Post() @MinRole(FamilyRole.MEMBER)
  create(@CurrentUser() userId: string, @Body() dto: CreateSymptomDto) {
    return this.symptomService.create(userId, dto);
  }

  @Get()
  findAll(@Query('baby_id') babyId: string, @Query('limit') limit = 20, @Query('offset') offset = 0) {
    return this.symptomService.findAll(babyId, Number(limit), Number(offset));
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.symptomService.findOne(id);
  }

  @Patch(':id') @MinRole(FamilyRole.MEMBER)
  update(@Param('id') id: string, @Body() dto: UpdateSymptomDto) {
    return this.symptomService.update(id, dto);
  }

  @Delete(':id') @MinRole(FamilyRole.MEMBER)
  remove(@Param('id') id: string) { return this.symptomService.remove(id); }
}