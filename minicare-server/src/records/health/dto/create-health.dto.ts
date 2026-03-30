import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

/**
 * DDL: health_record.mood TINYINT  1=happy 2=neutral 3=fussy 4=crying
 * DDL 字段：temperature DECIMAL(4,1)，record_time DATETIME
 */
export enum Mood {
  HAPPY   = 'happy',
  NEUTRAL = 'neutral',
  FUSSY   = 'fussy',
  CRYING  = 'crying',
}

/** mood → TINYINT 映射 */
export const MOOD_TO_INT: Record<string, number> = {
  happy:   1,
  neutral: 2,
  fussy:   3,
  crying:  4,
};

/** TINYINT → mood 映射 */
export const INT_TO_MOOD: Record<number, string> = {
  1: 'happy',
  2: 'neutral',
  3: 'fussy',
  4: 'crying',
};

export class CreateHealthDto {
  @ApiProperty() @IsUUID() baby_id: string;

  @ApiProperty({ description: '记录时间（ISO 8601）' })
  @IsDateString()
  record_time: string;

  @ApiPropertyOptional({ description: '体温（℃），正常范围 35~42' })
  @IsOptional()
  @IsNumber()
  @Min(35)
  @Max(42)
  temperature?: number;

  @ApiPropertyOptional({ enum: Mood, description: 'DDL: 1=happy 2=neutral 3=fussy 4=crying' })
  @IsOptional()
  @IsEnum(Mood)
  mood?: Mood;

  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}
