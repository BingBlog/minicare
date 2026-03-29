import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { JwtPayload } from '../common/decorators/current-user.decorator';

/**
 * JwtGuard — 验证 Bearer Token
 *
 * 从 Authorization 头提取 JWT，验证签名和有效期。
 * 通过后将 payload 注入到 request.user。
 *
 * 使用方式：@UseGuards(JwtGuard)
 */
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('缺少访问令牌');
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: process.env.JWT_SECRET,
      });
      (request as any).user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('访问令牌无效或已过期');
    }
  }

  private extractToken(request: Request): string | undefined {
    const authHeader = request.headers.authorization;
    if (!authHeader) return undefined;
    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
