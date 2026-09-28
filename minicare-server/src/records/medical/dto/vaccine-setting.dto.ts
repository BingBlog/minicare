import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

/** 宝宝级疫苗本偏好 upsert（TECH-011 §3.3 vaccine/settings） */
export class VaccineSettingDto {
  @ApiProperty() @IsUUID() baby_id: string;

  @ApiProperty({ description: '参考库程序键 vkey' }) @IsString() vaccine_key: string;

  @ApiPropertyOptional({ description: '1=参与进度/提醒 0=隐藏不跟踪（缺省 1）' })
  @IsOptional() @IsBoolean()
  track_flag?: boolean;

  @ApiPropertyOptional({ description: '1=已由联合疫苗替代(手动标记)（缺省 0）' })
  @IsOptional() @IsBoolean()
  replaced_flag?: boolean;

  @ApiPropertyOptional({ description: '替代说明（选填）' }) @IsOptional() @IsString() replaced_note?: string;
}
