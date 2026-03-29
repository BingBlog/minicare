import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FamilyService } from './family.service';
import { JwtGuard } from '../auth/jwt.guard';
import { FamilyMemberGuard } from './family-member.guard';
import { RoleGuard } from './role.guard';
import { CreateFamilyDto } from './dto/create-family.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MinRole, FamilyRole } from '../common/decorators/min-role.decorator';

@ApiTags('family')
@Controller('family')
@UseGuards(JwtGuard)
@ApiBearerAuth()
export class FamilyController {
  constructor(private readonly familyService: FamilyService) {}

  @Post()
  @ApiOperation({ summary: '创建家庭' })
  create(@CurrentUser() userId: string, @Body() dto: CreateFamilyDto) {
    return this.familyService.createFamily(userId, dto);
  }

  @Get('mine')
  @ApiOperation({ summary: '获取我的家庭列表' })
  getMyFamilies(@CurrentUser() userId: string) {
    return this.familyService.getMyFamilies(userId);
  }

  @Get(':familyId/members')
  @UseGuards(FamilyMemberGuard, RoleGuard)
  @ApiOperation({ summary: '获取家庭成员列表' })
  getMembers(@Param('familyId') familyId: string) {
    return this.familyService.getMembers(familyId);
  }

  @Post(':familyId/invite')
  @UseGuards(FamilyMemberGuard, RoleGuard)
  @MinRole(FamilyRole.EDITOR)
  @ApiOperation({ summary: '生成邀请码' })
  createInviteCode(@Param('familyId') familyId: string) {
    return this.familyService.createInviteCode(familyId);
  }

  @Post('join')
  @ApiOperation({ summary: '通过邀请码加入家庭' })
  join(@CurrentUser() userId: string, @Body() body: { code: string }) {
    return this.familyService.joinByCode(userId, body.code);
  }
}
