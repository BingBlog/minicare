import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface JwtPayload {
  sub: string;   // user_id (UUID)
  /**
   * token_version（TECH-016）：改密时 user_account.token_version +1，
   * 使该用户已签发的所有 JWT 立即失效。
   *
   * 存量 token 无此字段 → 校验时按 0 处理，而存量行默认值也是 0，**不会被批量踢下线**。
   */
  tv?: number;
  iat?: number;
  exp?: number;
}

/**
 * @CurrentUser() — 从 JWT 中提取当前登录用户 ID
 *
 * 使用示例：
 * @Get('profile')
 * @UseGuards(JwtGuard)
 * getProfile(@CurrentUser() userId: string) { ... }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.sub as string;
  },
);
