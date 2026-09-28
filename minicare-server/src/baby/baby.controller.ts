import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BabyService } from './baby.service';
import { JwtGuard } from '../auth/jwt.guard';
import { FamilyMemberGuard } from '../family/family-member.guard';
import { RoleGuard } from '../family/role.guard';
import { CreateBabyDto } from './dto/create-baby.dto';
import { MinRole, FamilyRole } from '../common/decorators/min-role.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('baby')
@Controller('family/:familyId/baby')
@UseGuards(JwtGuard, FamilyMemberGuard, RoleGuard)
@ApiBearerAuth()
export class BabyController {
  constructor(private readonly babyService: BabyService) {}

  @Post()
  @MinRole(FamilyRole.MEMBER)
  @ApiOperation({ summary: '创建宝宝档案' })
  create(
    @Param('familyId') familyId: string,
    @CurrentUser() userId: string,
    @Body() dto: CreateBabyDto,
  ) {
    return this.babyService.createBaby(familyId, userId, dto);
  }

  @Get()
  @ApiOperation({ summary: '获取家庭宝宝档案（第一个）' })
  getBaby(@Param('familyId') familyId: string) {
    return this.babyService.getBabyByFamily(familyId);
  }

  @Get('list')
  @ApiOperation({ summary: '获取家庭所有宝宝档案' })
  listBabies(@Param('familyId') familyId: string) {
    return this.babyService.listBabies(familyId);
  }

  @Patch(':babyId')
  @MinRole(FamilyRole.MEMBER)
  @ApiOperation({ summary: '更新宝宝档案（部分字段）' })
  update(
    @Param('familyId') familyId: string,
    @Param('babyId') babyId: string,
    @Body() dto: Partial<CreateBabyDto>,
  ) {
    return this.babyService.updateBaby(babyId, familyId, dto);
  }

  /**
   * 删除宝宝档案（级联删除全部记录）
   * 仅 Owner 可操作
   */
  @Delete(':babyId')
  @MinRole(FamilyRole.OWNER)
  @ApiOperation({ summary: '删除宝宝档案（级联删除全部记录，仅创建者可操作）' })
  deleteBaby(
    @Param('familyId') familyId: string,
    @Param('babyId') babyId: string,
    @CurrentUser() userId: string,
  ) {
    return this.babyService.deleteBaby(babyId, familyId, userId);
  }
}
