import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * DDL: sleep_record.status VARCHAR(10): ongoing=进行中 ended=已结束
 *      sleep_record.quality VARCHAR(10): good/normal/poor
 *      sleep_record.sleep_period VARCHAR(20): night/morning_nap/afternoon_nap/other
 * （Migration 008: status TINYINT 1=ongoing/2=ended → VARCHAR）
 */

export enum SleepQuality {
  GOOD   = 'good',
  NORMAL = 'normal',
  POOR   = 'poor',
}

export enum SleepPeriod {
  NIGHT         = 'night',
  MORNING_NAP   = 'morning_nap',
  AFTERNOON_NAP = 'afternoon_nap',
  OTHER         = 'other',
}

export class StartSleepDto {
  @ApiProperty() @IsUUID() baby_id: string;

  @ApiProperty({ description: '睡眠开始时间（ISO 8601）' })
  @IsDateString()
  start_time: string;

  @ApiPropertyOptional({ enum: SleepQuality, description: '睡眠质量' })
  @IsOptional() @IsEnum(SleepQuality)
  quality?: SleepQuality;

  @ApiPropertyOptional({ enum: SleepPeriod, description: '睡眠时段' })
  @IsOptional() @IsEnum(SleepPeriod)
  sleep_period?: SleepPeriod;

  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class EndSleepDto {
  @ApiProperty({ description: '睡眠结束时间（ISO 8601）' })
  @IsDateString()
  end_time: string;

  @ApiPropertyOptional({ enum: SleepQuality, description: '睡眠质量' })
  @IsOptional() @IsEnum(SleepQuality)
  quality?: SleepQuality;

  @ApiPropertyOptional({ enum: SleepPeriod, description: '睡眠时段' })
  @IsOptional() @IsEnum(SleepPeriod)
  sleep_period?: SleepPeriod;

  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

/**
 * 补录已完成睡眠（单次写入 ended，不占用「进行中」槽位）
 * 用于存在 ongoing 计时时的历史补录，或前端直接提交起止时间
 */
export class CreateCompleteSleepDto {
  @ApiProperty() @IsUUID() baby_id: string;

  @ApiProperty({ description: '入睡时间（ISO 8601）' })
  @IsDateString()
  start_time: string;

  @ApiProperty({ description: '醒来时间（ISO 8601）' })
  @IsDateString()
  end_time: string;

  @ApiPropertyOptional({ enum: SleepQuality, description: '睡眠质量' })
  @IsOptional() @IsEnum(SleepQuality)
  quality?: SleepQuality;

  @ApiPropertyOptional({ enum: SleepPeriod, description: '睡眠时段' })
  @IsOptional() @IsEnum(SleepPeriod)
  sleep_period?: SleepPeriod;

  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

/** 更新睡眠记录 DTO（已结束的记录可修改时间、质量、时段、备注） */
export class UpdateSleepDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() start_time?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() end_time?: string;
  @ApiPropertyOptional({ enum: SleepQuality }) @IsOptional() @IsEnum(SleepQuality) quality?: SleepQuality;
  @ApiPropertyOptional({ enum: SleepPeriod }) @IsOptional() @IsEnum(SleepPeriod) sleep_period?: SleepPeriod;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}