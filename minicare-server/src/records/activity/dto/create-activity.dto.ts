import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export enum ActivityType {
  TUMMY_TIME = 'tummy_time', BATH = 'bath', OUTDOOR = 'outdoor',
  PLAY = 'play', READING = 'reading', OTHER = 'other',
}

export class CreateActivityDto {
  @ApiProperty() @IsUUID() baby_id: string;
  @ApiProperty({ enum: ActivityType }) @IsEnum(ActivityType) type: ActivityType;
  @ApiProperty() @IsDateString() started_at: string;
  @ApiPropertyOptional({ description: '时长（分钟）' }) @IsOptional() @IsNumber() @Min(0) duration_min?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}
