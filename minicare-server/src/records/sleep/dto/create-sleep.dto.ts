import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export enum SleepQuality {
  GOOD   = 'good',
  FAIR   = 'fair',
  POOR   = 'poor',
}

export class StartSleepDto {
  @ApiProperty() @IsUUID() baby_id: string;
  @ApiProperty({ description: '睡眠开始时间' }) @IsDateString() started_at: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class EndSleepDto {
  @ApiProperty({ description: '睡眠结束时间' }) @IsDateString() ended_at: string;
  @ApiPropertyOptional({ enum: SleepQuality }) @IsOptional() @IsEnum(SleepQuality) quality?: SleepQuality;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}
