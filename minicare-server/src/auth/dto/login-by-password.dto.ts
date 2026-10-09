import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsPhoneNumber, IsString } from 'class-validator';

/**
 * 密码登录入参（TECH-016 §4.3 接口 1）
 *
 * 注意：此处**不套用 PASSWORD_REGEX**，只做非空校验。
 * 理由：策略校验属于「设置密码」的职责；登录时若因格式不符提前 400，
 * 会绕过「连续失败计数」这条防爆破链路，也会给攻击者额外的格式探测信号。
 */
export class LoginByPasswordDto {
  @ApiProperty({ example: '+8613800000000', description: '手机号（E.164 格式）' })
  @IsNotEmpty()
  @IsPhoneNumber('CN')
  phone: string;

  @ApiProperty({ example: 'abc12345', description: '密码（8-20 位，含字母与数字）' })
  @IsNotEmpty()
  @IsString()
  password: string;
}
