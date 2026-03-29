import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateMedicalDto {
  @ApiProperty() @IsUUID() baby_id: string;
  @ApiProperty({ description: '就诊/记录时间' }) @IsDateString() recorded_at: string;
  @ApiPropertyOptional({ description: '医院名称' }) @IsOptional() @IsString() hospital?: string;
  @ApiPropertyOptional({ description: '诊断结论' }) @IsOptional() @IsString() diagnosis?: string;
  @ApiPropertyOptional({ description: '用药列表（药名列表）', type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true }) medications?: string[];
  @ApiPropertyOptional({ description: '病历照片 fileID 列表', type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true }) photo_urls?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}
