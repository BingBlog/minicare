import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

/**
 * DDL: diaper_record.diaper_type VARCHAR(10)
 * wet=嘘嘘  dirty=臭臭  mixed=臭臭+嘘嘘
 */
export enum DiaperType {
  WET   = 'wet',
  DIRTY = 'dirty',
  MIXED = 'mixed',
}

/**
 * 大便性状枚举
 * DDL: diaper_record.poop_type VARCHAR(20)
 */
export enum PoopType {
  NORMAL = 'normal',   // 正常软便
  LOOSE  = 'loose',    // 稀便
  WATERY = 'watery',   // 水样便
  HARD   = 'hard',     // 干硬粒
  BLOODY = 'bloody',   // 血丝便
}

/**
 * 屁屁状态枚举
 * DDL: diaper_record.butt_condition VARCHAR(30)
 */
export enum ButtCondition {
  NORMAL       = 'normal',        // 正常
  SLIGHTLY_RED = 'slightly_red',  // 轻微发红
  RASH         = 'rash',          // 红屁屁（尿布疹）
  SEVERE_RASH  = 'severe_rash',   // 严重红屁屁（破皮渗出）
  FUNGAL       = 'fungal',        // 疑似真菌感染
  OTHER        = 'other',         // 其他异常
}

export class CreateDiaperDto {
  @ApiProperty() @IsUUID() baby_id: string;

  @ApiProperty({ enum: DiaperType, description: 'wet=嘘嘘 dirty=臭臭 mixed=臭臭+嘘嘘' })
  @IsEnum(DiaperType)
  diaper_type: DiaperType;

  @ApiProperty({ description: '记录时间（ISO 8601）' })
  @IsDateString()
  record_time: string;

  /**
   * 大便颜色多选（dirty/mixed 时使用）
   * DDL: stool_colors JSON 数组，如 ["yellow","brown_yellow"]
   */
  @ApiPropertyOptional({ description: '大便颜色多选（如 ["yellow","brown_yellow"]），dirty/mixed 时使用', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  stool_colors?: string[];

  @ApiPropertyOptional({ enum: PoopType, description: '大便性状（dirty/mixed 时使用）' })
  @IsOptional()
  @IsEnum(PoopType)
  poop_type?: PoopType;

  @ApiPropertyOptional({ enum: ButtCondition, description: '屁屁状态' })
  @IsOptional()
  @IsEnum(ButtCondition)
  butt_condition?: ButtCondition;

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
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) stool_colors?: string[];
  @ApiPropertyOptional({ enum: PoopType }) @IsOptional() @IsEnum(PoopType) poop_type?: PoopType;
  @ApiPropertyOptional({ enum: ButtCondition }) @IsOptional() @IsEnum(ButtCondition) butt_condition?: ButtCondition;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(20) diaper_count?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}
