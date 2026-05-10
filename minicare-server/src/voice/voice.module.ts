import { Module } from '@nestjs/common'
import { VoiceController } from './voice.controller'
import { VoiceService } from './voice.service'
import { AuthModule } from '../auth/auth.module'
import { FamilyModule } from '../family/family.module'

@Module({
  imports: [AuthModule, FamilyModule],
  controllers: [VoiceController],
  providers: [VoiceService],
})
export class VoiceModule {}
