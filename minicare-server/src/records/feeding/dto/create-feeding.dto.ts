import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export enum FeedingType {
  BREAST   = 'breast',
  FORMULA  = 'formula',
  SOLID    = 'solid',
  SUPPLEMENT = 'supplement',
}

export class CreateFeedingDto {
  @ApiProperty() @IsUUID() baby_id: string;
  @ApiProperty({ enum: FeedingType }) @IsEnum(FeedingType) type: FeedingType;
  @ApiProperty({ example: '2024-06-01T08:00:00Z' }) @IsDateString() started_at: string;
  @ApiPropertyOptional({ description: '持续时长（分钟）' }) @IsOptional() @IsNumber() @Min(0) duration_min?: number;
  @ApiPropertyOptional({ description: '喂奶量（ml）' }) @IsOptional() @IsNumber() @Min(0) amount_ml?: number;
  @ApiPropertyOptional({ description: '食物名称（辅食）' }) @IsOptional() @IsString() food_name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}
