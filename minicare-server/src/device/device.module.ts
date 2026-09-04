/**
 * 音箱设备模块（device.module.ts，TECH-008）
 *
 * 管理端（JWT 体系）+ 设备端（DeviceGuard 长期凭证）双入口。
 */
import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { AuthModule } from '../auth/auth.module';
import { FamilyModule } from '../family/family.module';
import { DeviceController } from './device.controller';
import { DeviceGuard } from './device.guard';
import { DeviceService } from './device.service';
import { FamilyDeviceController } from './family-device.controller';

@Module({
  imports: [AuthModule, FamilyModule, AgentModule],
  controllers: [FamilyDeviceController, DeviceController],
  providers: [DeviceService, DeviceGuard],
})
export class DeviceModule {}
