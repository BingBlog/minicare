import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

/**
 * DDL: activity_record.activity_type TINYINT
 *   1=bath 2=outdoor 3=play 4=tummy_time 5=other
 */
export enum ActivityType {
  BATH       = 'bath',
  OUTDOOR    = 'outdoor',
  PLAY       = 'play',
  TUMMY_TIME = 'tummy_time',
  OTHER      = 'other',
}

/**
 * 活动强度枚举
 * DDL: activity_record.intensity VARCHAR(10)
 */
export enum ActivityIntensity {
  EASY   = 'easy',
  MEDIUM = 'medium',
  ACTIVE = 'active',
}

/** activity_type → TINYINT 映射 */
export const ACTIVITY_TYPE_TO_INT: Record<string, number> = {
  bath:       1,
  outdoor:    2,
  play:       3,
  tummy_time: 4,
  other:      5,
};

/** TINYINT → activity_type 映射 */
export const INT_TO_ACTIVITY_TYPE: Record<number, string> = {
  1: 'bath',
  2: 'outdoor',
  3: 'play',
  4: 'tummy_time',
  5: 'other',
};

export class CreateActivityDto {
  @ApiProperty() @IsUUID() baby_id: string;

  @ApiProperty({ enum: ActivityType, description: 'DDL: 1=bath 2=outdoor 3=play 4=tummy_time 5=other' })
  @IsEnum(ActivityType)
  activity_type: ActivityType;

  @ApiProperty({ description: '记录时间（ISO 8601）' })
  @IsDateString()
  record_time: string;

  @ApiPropertyOptional({ description: '时长（分钟）' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  duration_min?: number;

  @ApiPropertyOptional({ enum: ActivityIntensity, description: '活动强度: easy/medium/active' })
  @IsOptional()
  @IsEnum(ActivityIntensity)
  intensity?: ActivityIntensity;

  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

/** 更新活动记录 DTO */
export class UpdateActivityDto {
  @ApiPropertyOptional({ enum: ActivityType }) @IsOptional() @IsEnum(ActivityType) activity_type?: ActivityType;
  @ApiPropertyOptional() @IsOptional() @IsDateString() record_time?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) duration_min?: number;
  @ApiPropertyOptional({ enum: ActivityIntensity }) @IsOptional() @IsEnum(ActivityIntensity) intensity?: ActivityIntensity;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}