/**
 * minicare-agent 薄代理服务（agent.service.ts，M8 tech §2）
 *
 * 职责：SSE 帧级透传 /chat、REST JSON 透传、baby 归属校验、ctx 注入。
 * 不解析不缓存上游业务内容；所有鉴权在 controller 层（JwtGuard + FamilyMemberGuard）。
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool } from 'mysql2/promise';
import { DATABASE_POOL } from '../common/database/database.module';

export interface AgentCtx {
  userId: string;
  familyId: string;
  babyId: string;
}

export interface ChatDto {
  family_id: string;
  baby_id: string;
  conversation_id?: string;
  message: string;
  images?: Array<{ fileId: string; mimeType?: string }>;
  model?: string;
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  private get baseUrl(): string {
    const url = process.env.AGENT_BASE_URL;
    if (!url) {
      throw new Error('AGENT_BASE_URL 未配置（minicare-agent 内部服务地址）');
    }
    return url.replace(/\/$/, '');
  }

  private get internalToken(): string {
    const token = process.env.AGENT_INTERNAL_TOKEN;
    if (!token) {
      throw new Error('AGENT_INTERNAL_TOKEN 未配置');
    }
    return token;
  }

  /** 校验 baby 归属：babyId 必须属于该 family 且未软删 */
  async verifyBaby(babyId: string, familyId: string): Promise<void> {
    const [rows] = await this.db.execute<any[]>(
      'SELECT id FROM baby_profile WHERE id = ? AND family_id = ? AND deleted_at IS NULL',
      [babyId, familyId],
    );
    if (rows.length === 0) {
      throw new Error('baby 不属于该家庭');
    }
  }

  /** 构造内部请求 ctx（base64），含 userId/familyId/babyId */
  buildCtx(userId: string, familyId: string, babyId: string): string {
    const ctx: AgentCtx = { userId, familyId, babyId };
    return Buffer.from(JSON.stringify(ctx)).toString('base64');
  }

  /**
   * POST /chat — SSE 帧级透传（M8 tech §2.2）
   * - 客户端断连 → abort 上游（res.on('close') cancel reader）
   * - 上游 60s 无数据 → AbortSignal.timeout 兜底（防模型悬挂）
   * - conversationId 未传由服务端生成（UUID，Claude CLI 强校验）
   */
  async proxyChat(
    res: import('express').Response,
    dto: ChatDto,
    ctxB64: string,
  ): Promise<void> {
    const upstream = await fetch(`${this.baseUrl}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-token': this.internalToken,
        'x-agent-ctx': ctxB64,
      },
      body: JSON.stringify({
        conversationId: dto.conversation_id ?? randomUUID(),
        message: dto.message,
        ...(dto.images?.length ? { images: dto.images } : {}),
        ...(dto.model ? { model: dto.model } : {}),
      }),
      signal: AbortSignal.timeout(60_000),
    });

    // 非流式响应（4xx/5xx JSON）原样透传
    if (!upstream.ok || !upstream.body) {
      res.status(upstream.status);
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
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
    // 客户端断连 → cancel 上游（停止模型计费）
    res.on('close', () => {
      reader.cancel().catch(() => {});
    });

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
      }
    } catch (e) {
      this.logger.warn(`/chat 上游中断: ${(e as Error).message}`);
      res.write(`event: error\ndata: ${JSON.stringify({ message: 'upstream closed' })}\n\n`);
    } finally {
      res.end();
    }
  }

  /** GET /health — 透传探活 */
  async proxyHealth(): Promise<unknown> {
    const resp = await fetch(`${this.baseUrl}/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!resp.ok) {
      throw new Error(`agent /health 返回 ${resp.status}`);
    }
    return resp.json();
  }
}
