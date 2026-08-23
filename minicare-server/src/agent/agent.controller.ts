/**
 * minicare-agent 代理控制器（agent.controller.ts，M8 tech §2）
 *
 * 对外 API（小程序唯一入口，复用 www.minicare.top 域名 + JWT，零新增 request 域名）：
 *   POST /api/agent/chat        SSE 对话（JwtGuard + FamilyMemberGuard + baby 归属校验 + ctx 注入）
 *   GET  /api/agent/health      健康透传
 *   （日记 REST P2 追加：/api/agent/diary/*）
 */
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtGuard } from '../auth/jwt.guard';
import { FamilyMemberGuard } from '../family/family-member.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AgentService, ChatDto } from './agent.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class ChatImageDto {
  @IsString()
  @IsNotEmpty()
  fileId!: string;

  @IsOptional()
  @IsString()
  mimeType?: string;
}

/** /api/agent/chat 请求体（family_id 复用 FamilyMemberGuard 读取约定） */
class ChatBodyDto implements ChatDto {
  @IsString()
  @Matches(UUID_RE, { message: 'family_id 必须是 UUID' })
  family_id!: string;

  @IsString()
  @Matches(UUID_RE, { message: 'baby_id 必须是 UUID' })
  baby_id!: string;

  @IsOptional()
  @IsString()
  @Matches(UUID_RE, { message: 'conversation_id 必须是 UUID' })
  conversation_id?: string;

  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatImageDto)
  images?: Array<{ fileId: string; mimeType?: string }>;

  @IsOptional()
  @IsString()
  model?: string;
}

@ApiTags('agent')
@Controller('agent')
@UseGuards(JwtGuard)
@ApiBearerAuth()
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  /**
   * POST /api/agent/chat — 对话（SSE）
   * 鉴权链：JwtGuard → FamilyMemberGuard（family_id 成员校验）→ baby 归属校验
   *  → 注入 x-agent-ctx: base64{ userId, familyId, babyId } 转发内部服务
   */
  @Post('chat')
  @UseGuards(FamilyMemberGuard)
  @ApiOperation({ summary: '养娃智能体对话（SSE 流式）' })
  async chat(
    @Req() req: any,
    @Res() res: import('express').Response,
    @Body() dto: ChatBodyDto,
    @CurrentUser() userId: string,
  ) {
    // baby 归属校验（FamilyMemberGuard 已注入 familyContext.familyId）
    try {
      await this.agentService.verifyBaby(dto.baby_id, req.familyContext.familyId);
    } catch {
      throw new ForbiddenException('宝宝不属于该家庭');
    }

    const ctxB64 = this.agentService.buildCtx(
      userId,
      req.familyContext.familyId,
      dto.baby_id,
    );
    await this.agentService.proxyChat(res, dto, ctxB64);
  }

  /** GET /api/agent/health — 探活透传 */
  @Get('health')
  @ApiOperation({ summary: '智能体服务健康检查（透传）' })
  async health() {
    try {
      return await this.agentService.proxyHealth();
    } catch (e) {
      throw new BadRequestException(`agent 服务不可达: ${(e as Error).message}`);
    }
  }
}
