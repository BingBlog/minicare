/**
 * 音箱设备服务（device.service.ts，TECH-008 §2/§3）
 *
 * 职责：绑定码生成/校验、设备绑定签发 token、设备列表/解绑、活跃时间戳，
 *       以及 xiaozhi LLM Adapter（/api/device/llm，openai 流式 ↔ agent-poc SSE）。
 * token 生成：randomBytes(32).hex（64 位十六进制），DB 仅存 sha256 哈希。
 */
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'mysql2/promise';
import { DATABASE_POOL } from '../common/database/database.module';
import { AgentService } from '../agent/agent.service';
import { DeviceContext } from './device.guard';
import { BindDeviceDto, DeviceLlmDto, LlmMessageDto } from './dto/device.dto';

export interface BindResult {
  device_id: string;
  family_id: string;
  default_baby_id: string | null;
  device_token: string;
}

/** 从 agent-poc SSE data 字段解析 JSON（失败返回 null） */
function safeJson(data: string): Record<string, unknown> | null {
  try {
    return JSON.parse(data) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** 解析单条 SSE 帧（event:xxx\ndata:xxx），无 data 返回 null */
function parseSseFrame(raw: string): { event: string; data: string } | null {
  let event = 'message';
  let data = '';
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data = line.slice(5).trim();
  }
  if (!data) return null;
  return { event, data };
}

/** 从 messages 的 system 消息中提取 conversation_id（xiaozhi Adapter 携带约定） */
function extractConversationId(messages: LlmMessageDto[]): string | undefined {
  const sys = messages.find((m) => m.role === 'system')?.content ?? '';
  const m = sys.match(
    /conversation_id[=:]\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  );
  return m?.[1];
}

@Injectable()
export class DeviceService {
  private readonly logger = new Logger(DeviceService.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly db: Pool,
    private readonly agentService: AgentService,
  ) {}

  // ── 绑定码（管理端，管理员可调用）────────────────────────────

  /**
   * 生成/刷新绑定码：同一家庭同一时刻仅 1 条 pending，旧码自动撤销。
   * 绑定码永久有效（直到绑定成功或被撤销）、一次性使用。
   */
  async generateBindingCode(familyId: string, userId: string): Promise<{ code: string }> {
    await this.db.execute(
      `UPDATE speaker_binding_code SET status = 'revoked'
       WHERE family_id = ? AND status = 'pending'`,
      [familyId],
    );

    const code = await this.genUniqueCode();
    await this.db.execute(
      `INSERT INTO speaker_binding_code (id, family_id, code, created_by)
       VALUES (?, ?, ?, ?)`,
      [randomUUID(), familyId, code, userId],
    );
    return { code };
  }

  /** 生成唯一 6 位数字绑定码（uk_code 冲突则重试，最多 10 次） */
  private async genUniqueCode(): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const [rows] = await this.db.execute<any[]>(
        'SELECT id FROM speaker_binding_code WHERE code = ?',
        [code],
      );
      if (rows.length === 0) return code;
    }
    throw new BadRequestException('绑定码生成失败，请重试');
  }

  // ── 设备绑定（设备端，凭绑定码）──────────────────────────────

  /** 绑定码换取长期 device token；绑定码一次性（used） */
  async bindDevice(dto: BindDeviceDto): Promise<BindResult> {
    const [codes] = await this.db.execute<any[]>(
      `SELECT id, family_id, created_by
       FROM speaker_binding_code
       WHERE code = ? AND status = 'pending'`,
      [dto.code],
    );
    if (codes.length === 0) {
      throw new BadRequestException('绑定码不正确或已失效，请重新获取');
    }
    const codeRow = codes[0];

    // 家庭第一个宝宝作为默认 baby（MVP 单宝宝；二期声纹识别后按人归属）
    const [babies] = await this.db.execute<any[]>(
      `SELECT id FROM baby_profile
       WHERE family_id = ? AND deleted_at IS NULL
       ORDER BY created_at ASC LIMIT 1`,
      [codeRow.family_id],
    );

    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const deviceId = randomUUID();

    await this.db.execute(
      `INSERT INTO speaker_device
         (id, family_id, device_name, device_type, mac_address, token_hash, bound_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        deviceId,
        codeRow.family_id,
        dto.device_name ?? '小宝音箱',
        dto.device_type ?? 'esp32-s3-box-3',
        dto.mac_address ?? null,
        tokenHash,
        codeRow.created_by,
      ],
    );

    await this.db.execute(
      `UPDATE speaker_binding_code
       SET status = 'used', used_at = NOW(), used_device = ?
       WHERE id = ?`,
      [deviceId, codeRow.id],
    );

    return {
      device_id: deviceId,
      family_id: codeRow.family_id,
      default_baby_id: babies[0]?.id ?? null,
      device_token: token,
    };
  }

  // ── 设备管理（管理端）────────────────────────────────────────

  /** 已绑设备列表（软删排除） */
  async listDevices(familyId: string) {
    const [rows] = await this.db.execute<any[]>(
      `SELECT id, device_name, device_type, mac_address, status,
              bound_at, last_seen_at, created_at
       FROM speaker_device
       WHERE family_id = ? AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [familyId],
    );
    return rows;
  }

  /** 解绑：status='revoked' + 软删 → 原 token 立即失效 */
  async unbindDevice(familyId: string, deviceId: string): Promise<void> {
    const [rows] = await this.db.execute<any[]>(
      `SELECT id FROM speaker_device
       WHERE id = ? AND family_id = ? AND deleted_at IS NULL`,
      [deviceId, familyId],
    );
    if (rows.length === 0) {
      throw new NotFoundException('设备不存在');
    }
    await this.db.execute(
      `UPDATE speaker_device SET status = 'revoked', deleted_at = NOW()
       WHERE id = ?`,
      [deviceId],
    );
  }

  // ── 设备活跃状态（设备端内部使用）────────────────────────────

  /** 刷新 last_seen_at + 持久化最近会话线程（跨唤醒延续） */
  async touchDevice(deviceId: string, conversationId?: string): Promise<void> {
    if (conversationId) {
      await this.db.execute(
        `UPDATE speaker_device
         SET last_seen_at = NOW(), last_conversation_id = ?
         WHERE id = ?`,
        [conversationId, deviceId],
      );
    } else {
      await this.db.execute(
        'UPDATE speaker_device SET last_seen_at = NOW() WHERE id = ?',
        [deviceId],
      );
    }
  }

  /** 读取设备最近会话线程（跨唤醒延续用） */
  async getLastConversationId(deviceId: string): Promise<string | null> {
    const [rows] = await this.db.execute<any[]>(
      'SELECT last_conversation_id FROM speaker_device WHERE id = ?',
      [deviceId],
    );
    return rows[0]?.last_conversation_id ?? null;
  }

  // ── LLM Adapter（/api/device/llm，TECH-008 §4.2 方案 A）────────────

  /** 家庭第一个宝宝（MVP 单宝宝默认；二期声纹识别后按人归属） */
  async resolveDefaultBaby(familyId: string): Promise<string | null> {
    const [rows] = await this.db.execute<any[]>(
      `SELECT id FROM baby_profile
       WHERE family_id = ? AND deleted_at IS NULL
       ORDER BY created_at ASC LIMIT 1`,
      [familyId],
    );
    return rows[0]?.id ?? null;
  }

  /**
   * openai 兼容流式 → agent-poc SSE → openai 流式（协议转换）
   *
   * xiaozhi-server 把 LLM 配为 openai 兼容指向本端点，这里：
   * - 取最后一条 user 消息作为对话内容
   * - conversationId 优先取 header `x-conversation-id` → messages system 里携带 → 设备上次会话线程
   * - familyId/babyId 由 DeviceGuard 解析注入，userId 用 deviceId（设备维度会话历史）
   * - agent-poc 的 text 事件 → openai `choices[].delta.content` 流式帧
   * - 结束时持久化 last_conversation_id（跨唤醒延续）
   */
  async proxyLlm(
    res: import('express').Response,
    dto: DeviceLlmDto,
    deviceContext: DeviceContext,
    conversationIdHeader?: string,
  ): Promise<void> {
    const userMsg = [...dto.messages].reverse().find((m) => m.role === 'user');
    if (!userMsg || !userMsg.content.trim()) {
      throw new BadRequestException('messages 必须包含 user 消息');
    }

    const babyId = await this.resolveDefaultBaby(deviceContext.familyId);
    if (!babyId) {
      throw new BadRequestException('家庭还没有宝宝档案，请先在手机端创建');
    }

    const lastCid = await this.getLastConversationId(deviceContext.deviceId);
    const conversationId =
      conversationIdHeader ?? extractConversationId(dto.messages) ?? lastCid ?? undefined;

    const ctxB64 = this.agentService.buildCtx(
      deviceContext.deviceId, // userId：设备维度会话历史
      deviceContext.familyId,
      babyId,
    );

    const upstream = await this.agentService.postChat(
      {
        family_id: deviceContext.familyId,
        baby_id: babyId,
        conversation_id: conversationId,
        message: userMsg.content,
        ...(dto.model ? { model: dto.model } : {}),
      },
      ctxB64,
    );

    if (!upstream.ok || !upstream.body) {
      res.status(upstream.status);
      res.setHeader(
        'Content-Type',
        upstream.headers.get('content-type') || 'application/json',
      );
      res.send(await upstream.text());
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.flushHeaders();

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalCid = conversationId;
    let hadText = false;

    res.on('close', () => {
      reader.cancel().catch(() => {});
    });

    const writeDelta = (delta: string) => {
      hadText = true;
      res.write(
        `data: ${JSON.stringify({
          choices: [{ index: 0, delta: { content: delta } }],
        })}\n\n`,
      );
    };

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sep: number;
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const parsed = parseSseFrame(frame);
          if (!parsed) continue;

          if (parsed.event === 'meta') {
            const meta = safeJson(parsed.data);
            if (meta?.conversationId) finalCid = meta.conversationId as string;
          } else if (parsed.event === 'text') {
            const data = safeJson(parsed.data);
            const delta = data?.delta as string | undefined;
            if (delta) writeDelta(delta);
          } else if (parsed.event === 'error') {
            this.logger.warn(
              `device/llm 上游 error: ${parsed.data.slice(0, 200)}`,
            );
          }
        }
      }
    } catch (e) {
      this.logger.warn(`device/llm 上游中断: ${(e as Error).message}`);
    } finally {
      // 兜底：模型无文本输出时给出可播报提示（避免音箱静默）
      if (!hadText) {
        writeDelta('抱歉，回答生成中断了，请再试一次。');
      }
      res.write('data: [DONE]\n\n');
      // 持久化会话线程 + 活跃时间
      await this.touchDevice(deviceContext.deviceId, finalCid);
      res.end();
    }
  }
}
