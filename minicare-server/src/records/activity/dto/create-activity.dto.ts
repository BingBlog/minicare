import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

/**
 * DDL: activity_record.activity_type VARCHAR(20)
 *   直接存储字符串枚举值，未来新增类型只需扩展此枚举，无需数据迁移。
 */
export enum ActivityType {
  GROSS_MOTOR = 'gross_motor', // 大运动练习
  FINE_MOTOR  = 'fine_motor',  // 精细运动练习
  EDU_PLAY    = 'edu_play',    // 亲子早教互动
  OUTDOOR     = 'outdoor',     // 户外活动
  DAILY_CARE  = 'daily_care',  // 日常护理
  OTHER       = 'other',       // 其他活动
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

export class CreateActivityDto {
  @ApiProperty() @IsUUID() baby_id: string;

  @ApiProperty({ enum: ActivityType, description: 'gross_motor=大运动练习 fine_motor=精细运动练习 edu_play=亲子早教互动 outdoor=户外活动 daily_care=日常护理 other=其他活动' })
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
