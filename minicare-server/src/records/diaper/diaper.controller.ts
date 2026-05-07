import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DiaperService } from './diaper.service';
import { JwtGuard } from '../../auth/jwt.guard';
import { FamilyMemberGuard } from '../../family/family-member.guard';
import { RoleGuard } from '../../family/role.guard';
import { CreateDiaperDto, UpdateDiaperDto } from './dto/create-diaper.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MinRole, FamilyRole } from '../../common/decorators/min-role.decorator';

@ApiTags('records/diaper')
@Controller('family/:familyId/records/diaper')
@UseGuards(JwtGuard, FamilyMemberGuard, RoleGuard)
@ApiBearerAuth()
export class DiaperController {
  constructor(private readonly diaperService: DiaperService) {}

  @Post() @MinRole(FamilyRole.MEMBER)
  create(@CurrentUser() userId: string, @Body() dto: CreateDiaperDto) {
    return this.diaperService.create(userId, dto);
  }

  @Get()
  findAll(@Query('baby_id') babyId: string, @Query('before_date') beforeDate?: string) {
    return this.diaperService.findAll(babyId, beforeDate);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.diaperService.findOne(id);
  }

  @Patch(':id') @MinRole(FamilyRole.MEMBER)
  update(@Param('id') id: string, @Body() dto: UpdateDiaperDto) {
    return this.diaperService.update(id, dto);
  }

  @Delete(':id') @MinRole(FamilyRole.MEMBER)
  remove(@Param('id') id: string) { return this.diaperService.remove(id); }
}