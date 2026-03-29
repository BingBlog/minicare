import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DiaperService } from './diaper.service';
import { JwtGuard } from '../../auth/jwt.guard';
import { FamilyMemberGuard } from '../../family/family-member.guard';
import { RoleGuard } from '../../family/role.guard';
import { CreateDiaperDto } from './dto/create-diaper.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MinRole, FamilyRole } from '../../common/decorators/min-role.decorator';

@ApiTags('records/diaper')
@Controller('family/:familyId/records/diaper')
@UseGuards(JwtGuard, FamilyMemberGuard, RoleGuard)
@ApiBearerAuth()
export class DiaperController {
  constructor(private readonly diaperService: DiaperService) {}

  @Post() @MinRole(FamilyRole.EDITOR)
  create(@CurrentUser() userId: string, @Body() dto: CreateDiaperDto) {
    return this.diaperService.create(userId, dto);
  }

  @Get()
  findAll(@Query('baby_id') babyId: string, @Query('limit') limit = 20, @Query('offset') offset = 0) {
    return this.diaperService.findAll(babyId, Number(limit), Number(offset));
  }

  @Delete(':id') @MinRole(FamilyRole.EDITOR)
  remove(@Param('id') id: string) { return this.diaperService.remove(id); }
}
