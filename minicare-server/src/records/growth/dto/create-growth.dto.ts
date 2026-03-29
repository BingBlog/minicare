import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateGrowthDto {
  @ApiProperty() @IsUUID() baby_id: string;
  @ApiProperty() @IsDateString() measured_at: string;
  @ApiPropertyOptional({ description: '体重（克）' }) @IsOptional() @IsNumber() @Min(500) @Max(30000) weight_g?: number;
  @ApiPropertyOptional({ description: '身高（厘米）' }) @IsOptional() @IsNumber() @Min(30) @Max(150) height_cm?: number;
  @ApiPropertyOptional({ description: '头围（厘米）' }) @IsOptional() @IsNumber() @Min(25) @Max(60) head_cm?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}
