import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DDL: health_record
 *   temperature DECIMAL(4,1)
 *   allergy_symptoms JSON
 *   allergy_severity VARCHAR(10)
 *   medications JSON
 *   skin_care JSON
 * 注：mood 字段已迁移至 symptom_record（Migration 008）
 */

/** 过敏严重程度 */
export enum AllergySeverity {
  MILD     = 'mild',
  MODERATE = 'moderate',
  SEVERE   = 'severe',
}

/** 用药条目 */
export class MedicationItemDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dose?: string;
}

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

  @ApiPropertyOptional({ description: '过敏症状列表，如 ["荨麻疹","血便"]', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergy_symptoms?: string[];

  @ApiPropertyOptional({ enum: AllergySeverity, description: '过敏严重程度: mild|moderate|severe' })
  @IsOptional()
  @IsEnum(AllergySeverity)
  allergy_severity?: AllergySeverity;

  @ApiPropertyOptional({ description: '用药列表，如 [{"name":"维生素D","dose":"400IU"}]', type: [MedicationItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MedicationItemDto)
  medications?: MedicationItemDto[];

  @ApiPropertyOptional({ description: '护理项目列表，如 ["已做保湿","涂抹面霜"]', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skin_care?: string[];

  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class UpdateHealthDto {
  @ApiPropertyOptional({ description: '记录时间（ISO 8601）' })
  @IsOptional()
  @IsDateString()
  record_time?: string;

  @ApiPropertyOptional({ description: '体温（℃），正常范围 35~42' })
  @IsOptional()
  @IsNumber()
  @Min(35)
  @Max(42)
  temperature?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergy_symptoms?: string[];

  @ApiPropertyOptional({ enum: AllergySeverity })
  @IsOptional()
  @IsEnum(AllergySeverity)
  allergy_severity?: AllergySeverity;

  @ApiPropertyOptional({ type: [MedicationItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MedicationItemDto)
  medications?: MedicationItemDto[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skin_care?: string[];

  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}
