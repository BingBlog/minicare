import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DDL: medical_record
 *   visit_date   DATE
 *   medications  JSON  -- [{"name":"xx","dose":"xx"}]
 *   photo_ids    JSON  -- 照片 fileID 列表
 * 注：DDL 中不存在 photo_urls 字段
 */

/** 单条用药记录 */
export class MedicationItemDto {
  @ApiProperty({ description: '药品名称' }) @IsString() name: string;
  @ApiPropertyOptional({ description: '剂量描述，如 5ml 每次' }) @IsOptional() @IsString() dose?: string;
}

export class CreateMedicalDto {
  @ApiProperty() @IsUUID() baby_id: string;

  @ApiProperty({ description: '就诊日期（YYYY-MM-DD）' })
  @IsDateString()
  visit_date: string;

  @ApiPropertyOptional({ description: '医院名称' }) @IsOptional() @IsString() hospital?: string;
  @ApiPropertyOptional({ description: '诊断结论' }) @IsOptional() @IsString() diagnosis?: string;

  @ApiPropertyOptional({
    description: '用药列表，如 [{"name":"布洛芬","dose":"5ml"}]',
    type: [MedicationItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MedicationItemDto)
  medications?: MedicationItemDto[];

  @ApiPropertyOptional({ description: '照片 fileID 列表', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photo_ids?: string[];

  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}
