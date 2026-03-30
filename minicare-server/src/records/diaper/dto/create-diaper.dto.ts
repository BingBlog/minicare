import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * DDL: diaper_record.diaper_type TINYINT  1=wet 2=dirty 3=mixed 4=dry
 * DDL 中只有 color VARCHAR(20)，不存在 stool_color / stool_consistency / stool_count / urine_level 字段
 */
export enum DiaperType {
  WET   = 'wet',
  DIRTY = 'dirty',
  MIXED = 'mixed',
  DRY   = 'dry',
}

/** diaper_type → TINYINT 映射 */
export const DIAPER_TYPE_TO_INT: Record<string, number> = {
  wet:   1,
  dirty: 2,
  mixed: 3,
  dry:   4,
};

/** TINYINT → diaper_type 映射 */
export const INT_TO_DIAPER_TYPE: Record<number, string> = {
  1: 'wet',
  2: 'dirty',
  3: 'mixed',
  4: 'dry',
};

export class CreateDiaperDto {
  @ApiProperty() @IsUUID() baby_id: string;

  @ApiProperty({ enum: DiaperType, description: 'DDL: 1=wet 2=dirty 3=mixed 4=dry' })
  @IsEnum(DiaperType)
  diaper_type: DiaperType;

  @ApiProperty({ description: '记录时间（ISO 8601）' })
  @IsDateString()
  record_time: string;

  @ApiPropertyOptional({ description: '大便颜色（如 yellow/green/brown）' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}
