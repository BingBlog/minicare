/**
 * 音箱设备端控制器（device.controller.ts，TECH-008 §3.2）
 *
 * 设备端 API（供 xiaozhi-server / 音箱调用）：
 *   POST /api/device/bind      绑定码换取 device token（无鉴权，凭绑定码）
 *   GET  /api/device/health    探活（DeviceGuard）
 *   POST /api/device/llm       openai 兼容流式对话 → minicare-agent（DeviceGuard，TECH-008 §4.2 方案 A）
 */
import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DeviceGuard } from './device.guard';
import { DeviceService } from './device.service';
import { BindDeviceDto, DeviceLlmDto } from './dto/device.dto';

@ApiTags('device')
@Controller('device')
export class DeviceController {
  constructor(private readonly deviceService: DeviceService) {}

  /** POST /api/device/bind — 绑定码换取长期 device token（音箱配网后调用） */
  @Post('bind')
  @ApiOperation({ summary: '绑定码换取设备 token（音箱配网后调用）' })
  async bind(@Body() dto: BindDeviceDto) {
    return this.deviceService.bindDevice(dto);
  }

  /** GET /api/device/health — 设备服务探活 */
  @Get('health')
  @UseGuards(DeviceGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '设备服务探活' })
  async health() {
    return { ok: true, ts: Date.now() };
  }

  /**
   * POST /api/device/llm — xiaozhi-server LLM Adapter（openai 兼容流式）
   * 鉴权：Bearer device token（DeviceGuard 解析 familyId/deviceId）
   * 会话延续：header `x-conversation-id` 或 device 上次会话线程
   */
  @Post('llm')
  @UseGuards(DeviceGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'xiaozhi LLM Adapter：openai 流式对话（转 minicare-agent）' })
  async llm(
    @Req() req: any,
    @Res() res: import('express').Response,
    @Headers('x-conversation-id') conversationIdHeader: string | undefined,
    @Body() dto: DeviceLlmDto,
  ) {
    await this.deviceService.proxyLlm(res, dto, req.deviceContext, conversationIdHeader);
  }
}
