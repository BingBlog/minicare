import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

/**
 * 手机所有权凭证（phoneProof）—— TECH-016 §4.2
 *
 * 服务端在正式模式下**完全不接触短信验证码**（验证码由前端 CloudBase JS SDK 发送与校验），
 * 因此「证明你是这个手机号的主人」统一抽象为此 DTO：
 *
 * - `AUTH_TEST_MODE=true`：只需 `code === '123456'`（与 verify-code 的测试模式一致）
 * - 正式模式（sms）  ：需前端 `verifyOtp` 换来的 CloudBase `accessToken`，
 *                      后端调 `/auth/v1/user/me` 反查手机号，并**断言与请求体 phone 一致**
 *                      （防止用 A 的 token 改 B 的密码）
 *
 * 两种模式都不可能通过时 → 401「验证码错误或已过期」。
 */
export class PhoneProofDto {
  @ApiPropertyOptional({
    example: '123456',
    description: '仅 AUTH_TEST_MODE=true 时使用：固定验证码 123456',
  })
  @IsOptional()
  @IsString()
  @Length(6, 6, { message: '验证码必须为 6 位' })
  code?: string;

  @ApiPropertyOptional({
    description:
      '正式模式（sms）：CloudBase Auth 的 access_token，用于验证手机所有权',
  })
  @IsOptional()
  @IsString()
  accessToken?: string;
}
