import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ALLERGY_TYPE_OPTIONS,
  ALLERGY_LEVEL_OPTIONS,
} from '../../app-config/app-config.data';

export enum BabyGender {
  MALE    = 'male',
  FEMALE  = 'female',
  UNKNOWN = 'unknown',
}

/** 八大高风险过敏原 + 其他（从权威数据源派生） */
export const ALLERGY_TYPES = ALLERGY_TYPE_OPTIONS.map((o) => o.value) as unknown as readonly [
  'milk', 'egg', 'wheat', 'peanut', 'tree_nut', 'soy', 'fish', 'shellfish', 'other'
];
export type AllergyType = (typeof ALLERGY_TYPE_OPTIONS)[number]['value'];

/** 过敏程度（从权威数据源派生） */
export const ALLERGY_LEVELS = ALLERGY_LEVEL_OPTIONS.map((o) => o.value) as unknown as readonly [
  'mild', 'moderate', 'severe', 'unknown'
];
export type AllergyLevel = (typeof ALLERGY_LEVEL_OPTIONS)[number]['value'];

export class CreateBabyDto {
  @ApiProperty({ example: '小宝', description: '宝宝昵称' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  name: string;

  @ApiProperty({ example: '2024-06-01', description: '出生日期（YYYY-MM-DD）' })
  @IsDateString()
  birth_date: string;

  @ApiProperty({ enum: BabyGender, example: BabyGender.FEMALE })
  @IsEnum(BabyGender)
  gender: BabyGender;

  @ApiPropertyOptional({
    type: [String],
    example: ['milk', 'egg'],
    description: '过敏类型列表（支持多选）',
  })
  @IsOptional()
  @IsArray()
  @IsIn(ALLERGY_TYPES, { each: true })
  allergy_types?: AllergyType[];

  @ApiPropertyOptional({
    enum: ALLERGY_LEVELS,
    example: 'mild',
    description: '过敏程度（轻度/中度/重度/未知）',
  })
  @IsOptional()
  @IsIn(ALLERGY_LEVELS)
  allergy_level?: AllergyLevel;

  @ApiPropertyOptional({ example: 3200, description: '出生体重（克）' })
  @IsOptional()
  @IsNumber()
  @Min(500)
  @Max(7000)
  birth_weight_g?: number;

  @ApiPropertyOptional({ example: 50, description: '出生身高（厘米）' })
  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(80)
  birth_height_cm?: number;

  @ApiPropertyOptional({ description: '宝宝头像 fileID（COS 直传后写入，仅 update 使用）' })
  @IsOptional()
  @IsString()
  avatar_url?: string;
}
