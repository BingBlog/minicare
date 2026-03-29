import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface JwtPayload {
  sub: string;   // user_id (UUID)
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
