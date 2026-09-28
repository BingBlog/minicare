/**
 * DeviceGuard — 音箱设备凭证校验（device.guard.ts，TECH-008 §3.3）
 *
 * 与 JwtGuard 对等但面向长期设备凭证：
 * - 从 Authorization: Bearer <token> 提取 64 位 hex 设备 token
 * - sha256(token) 查 speaker_device（只存哈希，不存明文）
 * - 命中且 status='active' 且未软删 → 注入 request.deviceContext { deviceId, familyId }
 *
 * 使用方式：@UseGuards(DeviceGuard)
 */
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Pool } from 'mysql2/promise';
import { Request } from 'express';
import { DATABASE_POOL } from '../common/database/database.module';

export interface DeviceContext {
  deviceId: string;
  familyId: string;
}

@Injectable()
export class DeviceGuard implements CanActivate {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('缺少设备凭证');
    }

    const hash = createHash('sha256').update(token).digest('hex');
    const [rows] = await this.db.execute<any[]>(
      `SELECT id, family_id
       FROM speaker_device
       WHERE token_hash = ? AND status = 'active' AND deleted_at IS NULL`,
      [hash],
    );

    if (!rows.length) {
      throw new UnauthorizedException('设备凭证无效或已解绑');
    }

    (request as any).deviceContext = {
      deviceId: rows[0].id,
      familyId: rows[0].family_id,
    } satisfies DeviceContext;

    return true;
  }

  private extractToken(request: Request): string | undefined {
    const authHeader = request.headers.authorization;
    if (!authHeader) return undefined;
    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
