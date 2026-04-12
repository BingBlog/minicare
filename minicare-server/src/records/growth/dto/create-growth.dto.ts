import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';

/**
 * DDL: growth_record
 *   record_date  DATE
 *   weight_g     INT    （克）
 *   height_mm    INT    （毫米）
 *   head_mm      INT    （毫米）
 * 每日唯一索引 uk_growth_baby_date (baby_id, record_date)
 */
export class CreateGrowthDto {
  @ApiProperty() @IsUUID() baby_id: string;

  @ApiProperty({ description: '测量日期（YYYY-MM-DD）' })
  @IsDateString()
  record_date: string;

  @ApiPropertyOptional({ description: '测量时间（HH:mm），不传时记为 NULL' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'record_time 格式须为 HH:mm' })
  record_time?: string;

  @ApiPropertyOptional({ description: '体重（克），如 8200' })
  @IsOptional()
  @IsNumber()
  @Min(500)
  @Max(30000)
  weight_g?: number;

  @ApiPropertyOptional({ description: '身高（毫米），如 680 = 68.0 cm' })
  @IsOptional()
  @IsNumber()
  @Min(300)
  @Max(1500)
  height_mm?: number;

  @ApiPropertyOptional({ description: '头围（毫米），如 430 = 43.0 cm' })
  @IsOptional()
  @IsNumber()
  @Min(250)
  @Max(600)
  head_mm?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class UpdateGrowthDto {
  @ApiPropertyOptional({ description: '测量日期（YYYY-MM-DD）' })
  @IsOptional()
  @IsDateString()
  record_date?: string;

  @ApiPropertyOptional({ description: '测量时间（HH:mm），不传时记为 NULL' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'record_time 格式须为 HH:mm' })
  record_time?: string;

  @ApiPropertyOptional({ description: '体重（克），如 8200' })
  @IsOptional()
  @IsNumber()
  @Min(500)
  @Max(30000)
  weight_g?: number;

  @ApiPropertyOptional({ description: '身高（毫米），如 680 = 68.0 cm' })
  @IsOptional()
  @IsNumber()
  @Min(300)
  @Max(1500)
  height_mm?: number;

  @ApiPropertyOptional({ description: '头围（毫米），如 430 = 43.0 cm' })
  @IsOptional()
  @IsNumber()
  @Min(250)
  @Max(600)
  head_mm?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}