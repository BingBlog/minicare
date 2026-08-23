/**
 * minicare-agent 薄代理服务（agent.service.ts，M8 tech §2）
 *
 * 职责：SSE 帧级透传 /chat、REST JSON 透传、baby 归属校验、ctx 注入。
 * 不解析不缓存上游业务内容；所有鉴权在 controller 层（JwtGuard + FamilyMemberGuard）。
 */
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
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

export interface SaveDiaryDto {
  family_id: string;
  baby_id: string;
  diary_date: string; // YYYY-MM-DD
  content: string;
  photo_ids?: string[];
}

export interface UpdateDiaryDto {
  family_id: string;
  content?: string;
  photo_ids?: string[];
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

  // ── 日记 REST（M5 §4，直接查 baby_diary 表，JWT 已鉴权）──────────────────

  private static readonly DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  private static readonly MONTH_RE = /^\d{4}-\d{2}$/;

  /** 每天一篇 upsert（UNIQUE(baby_id, diary_date) 冲突即覆盖，前端已确认） */
  async saveDiary(dto: SaveDiaryDto, authorId: string) {
    if (!AgentService.DATE_RE.test(dto.diary_date)) {
      throw new Error('diary_date 格式必须为 YYYY-MM-DD');
    }
    const id = randomUUID();
    const photoIds = dto.photo_ids?.length ? dto.photo_ids.join(',') : null;
    await this.db.execute(
      `INSERT INTO baby_diary (id, baby_id, family_id, diary_date, author_id, content, photo_ids)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         content = VALUES(content), photo_ids = VALUES(photo_ids),
         author_id = VALUES(author_id), updated_at = NOW()`,
      [id, dto.baby_id, dto.family_id, dto.diary_date, authorId, dto.content, photoIds],
    );
    // 返回该日日记 id（upsert 后查回）
    const [rows] = await this.db.execute<any[]>(
      'SELECT id FROM baby_diary WHERE baby_id = ? AND diary_date = ?',
      [dto.baby_id, dto.diary_date],
    );
    return { id: rows[0]?.id ?? id };
  }

  /** 单天日记（无 → null） */
  async getDiaryDetail(babyId: string, date: string) {
    if (!AgentService.DATE_RE.test(date)) {
      throw new Error('date 格式必须为 YYYY-MM-DD');
    }
    const [rows] = await this.db.execute<any[]>(
      `SELECT id, baby_id, family_id, diary_date, author_id, content, photo_ids, created_at, updated_at
       FROM baby_diary WHERE baby_id = ? AND diary_date = ?`,
      [babyId, date],
    );
    const row = rows[0] ?? null;
    if (!row) return null;
    return { ...row, photo_ids: row.photo_ids ? row.photo_ids.split(',') : [] };
  }

  /** 按月列表（倒序，含首句摘要 + 首图） */
  async listDiary(babyId: string, month: string) {
    if (!AgentService.MONTH_RE.test(month)) {
      throw new Error('month 格式必须为 YYYY-MM');
    }
    const [rows] = await this.db.execute<any[]>(
      `SELECT id, baby_id, diary_date, content, photo_ids, created_at, updated_at
       FROM baby_diary WHERE baby_id = ? AND DATE_FORMAT(diary_date, '%Y-%m') = ?
       ORDER BY diary_date DESC`,
      [babyId, month],
    );
    return rows.map((r) => {
      const photos = r.photo_ids ? r.photo_ids.split(',') : [];
      return {
        id: r.id,
        baby_id: r.baby_id,
        diary_date: r.diary_date,
        excerpt: r.content.replace(/\s+/g, ' ').slice(0, 60),
        first_photo: photos[0] ?? null,
        photo_count: photos.length,
        created_at: r.created_at,
        updated_at: r.updated_at,
      };
    });
  }

  /** 编辑日记（content/photo_ids 覆盖，author_id 更新为编辑人）；校验归属家庭 */
  async updateDiary(id: string, familyId: string, dto: UpdateDiaryDto, authorId: string) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT id FROM baby_diary WHERE id = ? AND family_id = ?',
      [id, familyId],
    );
    if (rows.length === 0) throw new NotFoundException('日记不存在');

    const setClauses: string[] = [];
    const values: any[] = [];
    if (dto.content !== undefined) {
      setClauses.push('content = ?');
      values.push(dto.content);
    }
    if (dto.photo_ids !== undefined) {
      setClauses.push('photo_ids = ?');
      values.push(dto.photo_ids.length ? dto.photo_ids.join(',') : null);
    }
    if (setClauses.length > 0) {
      setClauses.push('author_id = ?', 'updated_at = NOW()');
      values.push(authorId, id);
      await this.db.execute(`UPDATE baby_diary SET ${setClauses.join(', ')} WHERE id = ?`, values);
    }
    return { id };
  }

  /** 追加照片（去重）；校验归属家庭 */
  async appendDiaryPhotos(id: string, familyId: string, photoIds: string[], authorId: string) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT photo_ids FROM baby_diary WHERE id = ? AND family_id = ?',
      [id, familyId],
    );
    if (rows.length === 0) throw new NotFoundException('日记不存在');
    const existing = rows[0].photo_ids ? rows[0].photo_ids.split(',') : [];
    const merged = [...new Set([...existing, ...photoIds])];
    await this.db.execute(
      'UPDATE baby_diary SET photo_ids = ?, author_id = ?, updated_at = NOW() WHERE id = ?',
      [merged.length ? merged.join(',') : null, authorId, id],
    );
    return { id, photo_ids: merged };
  }
}
