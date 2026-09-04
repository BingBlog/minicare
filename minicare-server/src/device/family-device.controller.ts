/**
 * 音箱设备管理端控制器（family-device.controller.ts，TECH-008 §3.1）
 *
 * 管理端 API（JWT + 家庭成员 + 管理员校验）：
 *   POST   /api/family/:familyId/devices/binding-code   生成/刷新绑定码（管理员）
 *   GET    /api/family/:familyId/devices                已绑设备列表（家庭成员）
 *   DELETE /api/family/:familyId/devices/:deviceId      解绑（管理员）
 */
import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FamilyRole, MinRole } from '../common/decorators/min-role.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import { FamilyMemberGuard } from '../family/family-member.guard';
import { RoleGuard } from '../family/role.guard';
import { DeviceService } from './device.service';

@ApiTags('family-device')
@Controller('family')
@UseGuards(JwtGuard)
@ApiBearerAuth()
export class FamilyDeviceController {
  constructor(private readonly deviceService: DeviceService) {}

  /** POST /api/family/:familyId/devices/binding-code — 生成/刷新绑定码（管理员） */
  @Post(':familyId/devices/binding-code')
  @UseGuards(FamilyMemberGuard, RoleGuard)
  @MinRole(FamilyRole.OWNER)
  @ApiOperation({ summary: '生成/刷新设备绑定码（管理员，旧码自动撤销）' })
  async genBindingCode(
    @Param('familyId') familyId: string,
    @CurrentUser() userId: string,
  ) {
    return this.deviceService.generateBindingCode(familyId, userId);
  }

  /** GET /api/family/:familyId/devices — 已绑设备列表（家庭成员） */
  @Get(':familyId/devices')
  @UseGuards(FamilyMemberGuard)
  @ApiOperation({ summary: '已绑设备列表' })
  async listDevices(@Param('familyId') familyId: string) {
    return this.deviceService.listDevices(familyId);
  }

  /** DELETE /api/family/:familyId/devices/:deviceId — 解绑（管理员，token 立即失效） */
  @Delete(':familyId/devices/:deviceId')
  @UseGuards(FamilyMemberGuard, RoleGuard)
  @MinRole(FamilyRole.OWNER)
  @ApiOperation({ summary: '解绑设备（token 立即失效）' })
  async unbindDevice(
    @Param('familyId') familyId: string,
    @Param('deviceId') deviceId: string,
  ) {
    await this.deviceService.unbindDevice(familyId, deviceId);
    return { ok: true };
  }
}
