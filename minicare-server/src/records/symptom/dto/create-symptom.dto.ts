import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export enum SymptomSeverity { MILD = 'mild', MODERATE = 'moderate', SEVERE = 'severe' }

export class CreateSymptomDto {
  @ApiProperty() @IsUUID() baby_id: string;
  @ApiProperty() @IsDateString() recorded_at: string;
  @ApiProperty({ description: '症状标签列表，如 ["rash","vomit"]', type: [String] })
  @IsArray() @IsString({ each: true }) symptoms: string[];
  @ApiPropertyOptional({ enum: SymptomSeverity }) @IsOptional() @IsEnum(SymptomSeverity) severity?: SymptomSeverity;
  @ApiPropertyOptional({ description: '照片 fileID 列表', type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true }) photo_urls?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}
