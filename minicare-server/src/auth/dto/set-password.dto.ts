import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { PhoneProofDto } from './phone-proof.dto';
import { PASSWORD_HINT, PASSWORD_REGEX } from '../password-policy';

/**
 * 设置 / 修改密码入参（TECH-016 §4.3 接口 3，需 JwtGuard）
 *
 * 放行矩阵（服务端 §4.3）：
 *
 * | hasPassword | 必需凭证                                                        |
 * |-------------|-----------------------------------------------------------------|
 * | false（设置）| phoneProof 通过 **或** `sms_verified_at` 在 10 分钟内            |
 * | true（修改） | currentPassword 正确 **或** phoneProof 通过 **或** 10min 内短信验证过 |
 *
 * 「10 分钟内短信验证过」这条捷径用于消除「刚用验证码登录完、进设置页还要再收一次短信」。
 * 安全边界：token 泄露场景下，若用户近 10 分钟未做短信验证，攻击者仍需短信 → 被拦住。
 */
export class SetPasswordDto extends PhoneProofDto {
  @ApiProperty({ example: 'abc12345', description: PASSWORD_HINT })
  @IsNotEmpty()
  @Matches(PASSWORD_REGEX, { message: PASSWORD_HINT })
  newPassword: string;

  @ApiPropertyOptional({
    description: '原密码。仅当账号已设置密码时可用，用于免验证码修改',
  })
  @IsOptional()
  @IsString()
  currentPassword?: string;
}
