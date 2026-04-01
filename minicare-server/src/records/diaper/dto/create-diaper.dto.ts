import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

/**
 * DDL: diaper_record.diaper_type TINYINT  1=wet 2=dirty 3=mixed 4=dry
 */
export enum DiaperType {
  WET   = 'wet',
  DIRTY = 'dirty',
  MIXED = 'mixed',
  DRY   = 'dry',
}

/**
 * 大便性状枚举
 * DDL: diaper_record.poop_type VARCHAR(30)
 */
export enum PoopType {
  NORMAL_SOFT  = 'normal_soft',   // 正常软便
  LOOSE        = 'loose',         // 稀便
  WATERY       = 'watery',        // 水样便
  HARD         = 'hard',          // 干硬粒
  BLOODY       = 'bloody',        // 血丝便
  NORMAL_FORM  = 'normal_form',   // 正常成形
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

  @ApiPropertyOptional({ description: '大便颜色（如 yellow/green/brown_yellow/green）' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ enum: PoopType, description: '大便性状（dirty/mixed 时使用）' })
  @IsOptional()
  @IsEnum(PoopType)
  poop_type?: PoopType;

  @ApiPropertyOptional({ description: '今日换尿布次数（0~20）' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  diaper_count?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

/** 更新尿布记录 DTO（所有字段可选） */
export class UpdateDiaperDto {
  @ApiPropertyOptional({ enum: DiaperType }) @IsOptional() @IsEnum(DiaperType) diaper_type?: DiaperType;
  @ApiPropertyOptional() @IsOptional() @IsDateString() record_time?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() color?: string;
  @ApiPropertyOptional({ enum: PoopType }) @IsOptional() @IsEnum(PoopType) poop_type?: PoopType;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(20) diaper_count?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}