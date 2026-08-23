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
  Param,
  Post,
  Put,
  Query,
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
import {
  AgentService,
  ChatDto,
  SaveDiaryDto,
  UpdateDiaryDto,
} from './agent.service';

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

/** 保存日记请求体（每天一篇 upsert） */
class SaveDiaryBodyDto implements SaveDiaryDto {
  @IsString()
  @Matches(UUID_RE, { message: 'family_id 必须是 UUID' })
  family_id!: string;

  @IsString()
  @Matches(UUID_RE, { message: 'baby_id 必须是 UUID' })
  baby_id!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'diary_date 格式必须为 YYYY-MM-DD' })
  diary_date!: string;

  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photo_ids?: string[];
}

/** 编辑日记请求体 */
class UpdateDiaryBodyDto implements UpdateDiaryDto {
  @IsString()
  @Matches(UUID_RE, { message: 'family_id 必须是 UUID' })
  family_id!: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photo_ids?: string[];
}

/** 追加照片请求体 */
class AppendPhotosBodyDto {
  @IsString()
  @Matches(UUID_RE, { message: 'family_id 必须是 UUID' })
  family_id!: string;

  @IsArray()
  @IsString({ each: true })
  photo_ids!: string[];
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

  // ── 日记 REST（M5 §4，每天一篇）──────────────────────────────────────

  /** POST /api/agent/diary/save — 保存/覆盖当天日记（upsert by baby_id+diary_date） */
  @Post('diary/save')
  @UseGuards(FamilyMemberGuard)
  @ApiOperation({ summary: '保存宝宝日记（每天一篇，重复保存覆盖）' })
  async saveDiary(
    @Req() req: any,
    @Body() dto: SaveDiaryBodyDto,
    @CurrentUser() userId: string,
  ) {
    await this.assertBabyOwned(dto.baby_id, req.familyContext.familyId);
    return this.agentService.saveDiary(dto, userId);
  }

  /** GET /api/agent/diary/detail?family_id=&baby_id=&date=YYYY-MM-DD */
  @Get('diary/detail')
  @UseGuards(FamilyMemberGuard)
  @ApiOperation({ summary: '查询某天日记' })
  async getDiaryDetail(
    @Req() req: any,
    @Query('baby_id') babyId: string,
    @Query('date') date: string,
  ) {
    if (!babyId || !UUID_RE.test(babyId)) throw new BadRequestException('baby_id 必须是 UUID');
    await this.assertBabyOwned(babyId, req.familyContext.familyId);
    return this.agentService.getDiaryDetail(babyId, date);
  }

  /** GET /api/agent/diary/list?family_id=&baby_id=&month=YYYY-MM */
  @Get('diary/list')
  @UseGuards(FamilyMemberGuard)
  @ApiOperation({ summary: '按月查询日记列表（倒序，含摘要与首图）' })
  async listDiary(
    @Req() req: any,
    @Query('baby_id') babyId: string,
    @Query('month') month: string,
  ) {
    if (!babyId || !UUID_RE.test(babyId)) throw new BadRequestException('baby_id 必须是 UUID');
    await this.assertBabyOwned(babyId, req.familyContext.familyId);
    return this.agentService.listDiary(babyId, month);
  }

  /** PUT /api/agent/diary/:id — 编辑日记正文/图片 */
  @Put('diary/:id')
  @UseGuards(FamilyMemberGuard)
  @ApiOperation({ summary: '编辑日记' })
  async updateDiary(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateDiaryBodyDto,
    @CurrentUser() userId: string,
  ) {
    return this.agentService.updateDiary(id, dto.family_id, dto, userId);
  }

  /** POST /api/agent/diary/:id/photos — 追加照片（去重） */
  @Post('diary/:id/photos')
  @UseGuards(FamilyMemberGuard)
  @ApiOperation({ summary: '追加日记照片（去重）' })
  async appendPhotos(
    @Param('id') id: string,
    @Body() dto: AppendPhotosBodyDto,
    @CurrentUser() userId: string,
  ) {
    return this.agentService.appendDiaryPhotos(id, dto.family_id, dto.photo_ids, userId);
  }

  /** baby 归属校验（FamilyMemberGuard 已注入 familyContext.familyId） */
  private async assertBabyOwned(babyId: string, familyId: string) {
    try {
      await this.agentService.verifyBaby(babyId, familyId);
    } catch {
      throw new ForbiddenException('宝宝不属于该家庭');
    }
  }
}
