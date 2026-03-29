import { ApiProperty } from '@nestjs/swagger';
import { IsPhoneNumber, IsNotEmpty } from 'class-validator';

export class SendCodeDto {
  @ApiProperty({ example: '+8613800000000', description: '手机号（E.164 格式）' })
  @IsNotEmpty()
  @IsPhoneNumber('CN')
  phone: string;
}
