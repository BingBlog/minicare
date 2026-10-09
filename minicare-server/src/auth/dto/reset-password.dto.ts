import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsPhoneNumber, Matches } from 'class-validator';
import { PhoneProofDto } from './phone-proof.dto';
import { PASSWORD_HINT, PASSWORD_REGEX } from '../password-policy';

/**
 * 忘记密码 · 重置入参（TECH-016 §4.3 接口 4，公开）
 *
 * 未登录态，因此**不能**走「10 分钟内短信验证过」的捷径 —— 必须携带 phoneProof。
 * 重置成功后 `token_version + 1`（踢掉该账号所有旧会话）并直接下发新 token 自动登录：
 * 用户刚刚证明了手机所有权，少一步更顺。
 */
export class ResetPasswordDto extends PhoneProofDto {
  @ApiProperty({ example: '+8613800000000', description: '手机号（E.164 格式）' })
  @IsNotEmpty()
  @IsPhoneNumber('CN')
  phone: string;

  @ApiProperty({ example: 'abc12345', description: PASSWORD_HINT })
  @IsNotEmpty()
  @Matches(PASSWORD_REGEX, { message: PASSWORD_HINT })
  newPassword: string;
}
