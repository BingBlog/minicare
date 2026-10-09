import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Pool } from 'mysql2/promise';
import { Request } from 'express';
import { JwtPayload } from '../common/decorators/current-user.decorator';
import { DATABASE_POOL } from '../common/database/database.module';

/**
 * JwtGuard — 验证 Bearer Token
 *
 * 1. 从 Authorization 头提取 JWT，验证签名和有效期。
 * 2. 查询 user_account 表确认用户在当前数据库中存在。
 *    （防止跨环境 token 有效但用户不存在的情况）
 * 3. 通过后将 payload 注入到 request.user。
 *
 * 使用方式：@UseGuards(JwtGuard)
 */
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(DATABASE_POOL) private readonly db: Pool,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('缺少访问令牌');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: process.env.JWT_SECRET,
      });
    } catch {
      throw new UnauthorizedException('访问令牌无效或已过期');
    }

    // 校验用户在当前环境数据库中确实存在，并比对 token_version
    // （TECH-016：改密后 token_version +1，使旧 token 全部失效。此处本就查一次库，零额外成本）
    const [rows] = await this.db.execute<any[]>(
      'SELECT id, token_version FROM user_account WHERE id = ?',
      [payload.sub],
    );
    if (!rows || rows.length === 0) {
      throw new UnauthorizedException('用户不存在，请重新登录');
    }
    // 存量 token 无 tv 字段 → 按 0 处理；存量行默认值亦为 0 → 向后兼容
    if ((payload.tv ?? 0) !== Number(rows[0].token_version ?? 0)) {
      throw new UnauthorizedException('登录状态已失效，请重新登录');
    }

    (request as any).user = payload;
    return true;
  }

  private extractToken(request: Request): string | undefined {
    const authHeader = request.headers.authorization;
    if (!authHeader) return undefined;
    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
