import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GrowthService } from './growth.service';
import { JwtGuard } from '../../auth/jwt.guard';
import { FamilyMemberGuard } from '../../family/family-member.guard';
import { RoleGuard } from '../../family/role.guard';
import { CreateGrowthDto } from './dto/create-growth.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MinRole, FamilyRole } from '../../common/decorators/min-role.decorator';

@ApiTags('records/growth')
@Controller('family/:familyId/records/growth')
@UseGuards(JwtGuard, FamilyMemberGuard, RoleGuard)
@ApiBearerAuth()
export class GrowthController {
  constructor(private readonly growthService: GrowthService) {}

  @Post() @MinRole(FamilyRole.EDITOR)
  create(@CurrentUser() userId: string, @Body() dto: CreateGrowthDto) {
    return this.growthService.create(userId, dto);
  }

  @Get()
  findAll(@Query('baby_id') babyId: string, @Query('limit') limit = 50, @Query('offset') offset = 0) {
    return this.growthService.findAll(babyId, Number(limit), Number(offset));
  }

  @Delete(':id') @MinRole(FamilyRole.EDITOR)
  remove(@Param('id') id: string) { return this.growthService.remove(id); }
}
