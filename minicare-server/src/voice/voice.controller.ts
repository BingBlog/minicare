import { Controller, Param, Post, UseGuards, UseInterceptors, UploadedFile, HttpException, HttpStatus, Logger } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { ApiBearerAuth, ApiOperation, ApiTags, ApiConsumes } from '@nestjs/swagger'
import { VoiceService } from './voice.service'
import { JwtGuard } from '../auth/jwt.guard'
import { FamilyMemberGuard } from '../family/family-member.guard'
import { RoleGuard } from '../family/role.guard'
import { MinRole, FamilyRole } from '../common/decorators/min-role.decorator'

@ApiTags('voice')
@Controller('family/:familyId/voice')
@UseGuards(JwtGuard, FamilyMemberGuard, RoleGuard)
@ApiBearerAuth()
export class VoiceController {
  private readonly logger = new Logger(VoiceController.name)

  constructor(private readonly voiceService: VoiceService) {}

  @Post('parse')
  @MinRole(FamilyRole.MEMBER)
  @UseInterceptors(FileInterceptor('audio', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '上传语音 -> STT语音转文字 -> NLU语义解析' })
  async parse(
    @Param('familyId') familyId: string,
    @UploadedFile() audio: Express.Multer.File,
  ) {
    if (!audio) {
      throw new HttpException('缺少语音文件', HttpStatus.BAD_REQUEST)
    }

    this.logger.log(`收到语音解析请求，familyId=${familyId}，文件大小=${audio.size}bytes`)

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('PARSE_TIMEOUT')), 20000),
    )

    try {
      return await Promise.race([
        this.voiceService.parse(familyId, audio),
        timeoutPromise,
      ])
    } catch (err) {
      if ((err as Error).message === 'PARSE_TIMEOUT') {
        throw new HttpException('识别超时，请重试', HttpStatus.GATEWAY_TIMEOUT)
      }
      this.logger.error(`语音解析失败: ${(err as Error).message}`)
      throw new HttpException('服务暂时不可用', HttpStatus.SERVICE_UNAVAILABLE)
    }
  }
}
