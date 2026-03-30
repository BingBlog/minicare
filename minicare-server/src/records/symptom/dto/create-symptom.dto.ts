import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DDL: symptom_record
 *   record_time  DATETIME
 *   symptoms     JSON  -- [{"type":1,"severity":2}]
 *   photo_ids    JSON  -- 照片 fileID 列表
 * 注：DDL 中不存在独立的 severity / photo_urls 字段
 */

/** 单条症状对象 */
export class SymptomItemDto {
  @ApiProperty({ description: '症状类型编号（1=rash 2=vomit 3=fever 4=diarrhea 5=constipation 6=other）' })
  @IsNumber()
  type: number;

  @ApiPropertyOptional({ description: '严重程度（1=mild 2=moderate 3=severe）' })
  @IsOptional()
  @IsNumber()
  severity?: number;
}

export class CreateSymptomDto {
  @ApiProperty() @IsUUID() baby_id: string;

  @ApiProperty({ description: '记录时间（ISO 8601）' })
  @IsDateString()
  record_time: string;

  @ApiProperty({
    description: '症状列表，如 [{"type":1,"severity":2}]',
    type: [SymptomItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SymptomItemDto)
  symptoms: SymptomItemDto[];

  @ApiPropertyOptional({ description: '照片 fileID 列表', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photo_ids?: string[];

  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}
