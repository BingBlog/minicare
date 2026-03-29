import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BabyService } from './baby.service';
import { JwtGuard } from '../auth/jwt.guard';
import { FamilyMemberGuard } from '../family/family-member.guard';
import { RoleGuard } from '../family/role.guard';
import { CreateBabyDto } from './dto/create-baby.dto';
import { MinRole, FamilyRole } from '../common/decorators/min-role.decorator';

@ApiTags('baby')
@Controller('family/:familyId/baby')
@UseGuards(JwtGuard, FamilyMemberGuard, RoleGuard)
@ApiBearerAuth()
export class BabyController {
  constructor(private readonly babyService: BabyService) {}

  @Post()
  @MinRole(FamilyRole.EDITOR)
  @ApiOperation({ summary: '创建宝宝档案（MVP: 每家庭限 1 个）' })
  create(@Param('familyId') familyId: string, @Body() dto: CreateBabyDto) {
    return this.babyService.createBaby(familyId, dto);
  }

  @Get()
  @ApiOperation({ summary: '获取家庭宝宝档案' })
  getBaby(@Param('familyId') familyId: string) {
    return this.babyService.getBabyByFamily(familyId);
  }
}
