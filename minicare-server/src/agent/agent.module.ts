/**
 * minicare-agent 代理模块（agent.module.ts，M8 tech §2）
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

@Module({
  imports: [AuthModule],
  controllers: [AgentController],
  providers: [AgentService],
  exports: [AgentService],  // 供 DeviceModule 复用 postChat/buildCtx/verifyBaby
})
export class AgentModule {}
