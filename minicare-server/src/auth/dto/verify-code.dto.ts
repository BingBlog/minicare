import { ApiProperty } from '@nestjs/swagger';
import { IsPhoneNumber, IsNotEmpty, Length } from 'class-validator';

export class VerifyCodeDto {
  @ApiProperty({ example: '+8613800000000', description: '手机号（E.164 格式）' })
  @IsNotEmpty()
  @IsPhoneNumber('CN')
  phone: string;

  @ApiProperty({ example: '123456', description: '6 位短信验证码' })
  @IsNotEmpty()
  @Length(6, 6, { message: '验证码必须为 6 位' })
  code: string;
}
