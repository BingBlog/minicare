import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { FamilyService } from './family.service';
import { JwtGuard } from '../auth/jwt.guard';
import { FamilyMemberGuard } from './family-member.guard';
import { RoleGuard } from './role.guard';
import { CreateFamilyDto } from './dto/create-family.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MinRole, FamilyRole } from '../common/decorators/min-role.decorator';

/** 按手机号邀请成员请求体 */
class InviteByPhoneDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  phone!: string;
}

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

  @Get('pending-invites')
  @ApiOperation({ summary: '获取当前用户的待处理邀请列表' })
  getPendingInvites(@CurrentUser() userId: string) {
    return this.familyService.getPendingInvites(userId);
  }

  @Post('pending-invites/:memberId/accept')
  @ApiOperation({ summary: '接受家庭邀请' })
  acceptInvite(
    @Param('memberId') memberId: string,
    @CurrentUser() userId: string,
  ) {
    return this.familyService.acceptInvite(memberId, userId);
  }

  @Post('pending-invites/:memberId/decline')
  @ApiOperation({ summary: '拒绝家庭邀请' })
  declineInvite(
    @Param('memberId') memberId: string,
    @CurrentUser() userId: string,
  ) {
    return this.familyService.declineInvite(memberId, userId);
  }

  @Get(':familyId/members')
  @UseGuards(FamilyMemberGuard, RoleGuard)
  @ApiOperation({ summary: '获取家庭成员列表（含 pending 状态 + 当前用户角色）' })
  async getMembers(
    @Param('familyId') familyId: string,
    @Req() req: any,
  ) {
    const members = await this.familyService.getMembers(familyId);
    return {
      members,
      currentUserRole: req.familyContext?.role ?? 'member',
    };
  }

  /**
   * 按手机号邀请成员（替代邀请码流程）
   * 仅 Owner 可操作
   */
  @Post(':familyId/invite-by-phone')
  @UseGuards(FamilyMemberGuard, RoleGuard)
  @MinRole(FamilyRole.OWNER)
  @ApiOperation({ summary: '按手机号邀请家庭成员（创建 pending 记录）' })
  inviteByPhone(
    @Param('familyId') familyId: string,
    @CurrentUser() userId: string,
    @Body() dto: InviteByPhoneDto,
  ) {
    return this.familyService.inviteByPhone(familyId, userId, dto.phone);
  }

  /**
   * 移除家庭成员（含撤销 pending 邀请）
   * 仅 Owner 可操作
   */
  @Delete(':familyId/members/:memberId')
  @UseGuards(FamilyMemberGuard, RoleGuard)
  @MinRole(FamilyRole.OWNER)
  @ApiOperation({ summary: '移除家庭成员或撤销邀请' })
  removeMember(
    @Param('familyId') familyId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() userId: string,
  ) {
    return this.familyService.removeMember(familyId, memberId, userId);
  }

  @Get(':familyId/records/today')
  @UseGuards(FamilyMemberGuard, RoleGuard)
  @ApiOperation({ summary: '获取指定日期所有记录聚合（时间轴），date 默认今日，格式 YYYY-MM-DD' })
  getTodayRecords(
    @Param('familyId') familyId: string,
    @Query('date') date?: string,
  ) {
    return this.familyService.getTodayRecords(familyId, date);
  }

  /**
   * @deprecated 邀请码流程已废弃，请使用 POST /:familyId/invite-by-phone
   */
  @Post(':familyId/invite')
  @UseGuards(FamilyMemberGuard, RoleGuard)
  @MinRole(FamilyRole.MEMBER)
  @ApiOperation({ summary: '[废弃] 生成邀请码，请改用 invite-by-phone' })
  createInviteCode(@Param('familyId') familyId: string) {
    return this.familyService.createInviteCode(familyId);
  }

  /**
   * @deprecated 邀请码流程已废弃，请使用 invite-by-phone + 登录自动激活
   */
  @Post('join')
  @ApiOperation({ summary: '[废弃] 通过邀请码加入家庭，请改用手机号邀请流程' })
  join(@CurrentUser() userId: string, @Body() body: { code: string }) {
    return this.familyService.joinByCode(userId, body.code);
  }
}