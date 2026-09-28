import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GrowthService } from './growth.service';
import { JwtGuard } from '../../auth/jwt.guard';
import { FamilyMemberGuard } from '../../family/family-member.guard';
import { RoleGuard } from '../../family/role.guard';
import { CreateGrowthDto, UpdateGrowthDto } from './dto/create-growth.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MinRole, FamilyRole } from '../../common/decorators/min-role.decorator';

@ApiTags('records/growth')
@Controller('family/:familyId/records/growth')
@UseGuards(JwtGuard, FamilyMemberGuard, RoleGuard)
@ApiBearerAuth()
export class GrowthController {
  constructor(private readonly growthService: GrowthService) {}

  @Post() @MinRole(FamilyRole.MEMBER)
  create(@CurrentUser() userId: string, @Body() dto: CreateGrowthDto) {
    return this.growthService.create(userId, dto);
  }

  @Get()
  findAll(@Query('baby_id') babyId: string, @Query('before_date') beforeDate?: string) {
    return this.growthService.findAll(babyId, beforeDate);
  }

  @Get('latest')
  getLatest(@Query('baby_id') babyId: string) {
    return this.growthService.getLatest(babyId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.growthService.findOne(id);
  }

  @Patch(':id') @MinRole(FamilyRole.MEMBER)
  update(@Param('id') id: string, @Body() dto: UpdateGrowthDto) {
    return this.growthService.update(id, dto);
  }

  @Delete(':id') @MinRole(FamilyRole.MEMBER)
  remove(@Param('id') id: string) { return this.growthService.remove(id); }
}