import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
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
  ALLERGY_LEVELS,
  ALLERGY_TYPES,
  AllergyLevel,
  AllergyType,
  BabyGender,
} from './create-baby.dto';

/**
 * 每日补充计划白名单（PRD-018）
 *
 * = 前端补剂表单清单（mp `records/feeding/types.ts::suppItems` 8 项）
 *   ∪ 服务端下发清单（`app-config.data.ts::SUPPLEMENT_ITEMS` 13 项）的并集，共 14 项。
 *
 * ⚠️ 两端清单存在既存差异（前端 `vitD` vs 服务端 `vitD3`），白名单取并集兜住；
 *    两端清单统一为既存技术债，不在 PRD-018 处理。
 */
export const SUPPLEMENT_PLAN_KEYS = [
  // 前端 suppItems（8）
  'vitD', 'vitAD', 'iron', 'calcium', 'dha', 'zinc', 'probiotic', 'vitC',
  // 服务端 SUPPLEMENT_ITEMS 独有（6）
  'vitD3', 'vitB', 'vitA', 'lactase', 'prebiotic', 'folicAcid',
] as const;
export type SupplementPlanKey = (typeof SUPPLEMENT_PLAN_KEYS)[number];

/**
 * 更新宝宝档案（PATCH，全部字段可选）
 *
 * ⚠️ 必须是 class 而非 TS 类型（如 Partial<CreateBabyDto>）——
 * 全局 ValidationPipe（whitelist + forbidNonWhitelisted）只对带校验装饰器的 class 生效；
 * 直接写 TS 类型会导致整个 PATCH 请求体**零校验**（越界数值可写库）。
 */
export class UpdateBabyDto {
  @ApiPropertyOptional({ example: '小宝', description: '宝宝昵称' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  name?: string;

  @ApiPropertyOptional({ example: '2024-06-01', description: '出生日期（YYYY-MM-DD）' })
  @IsOptional()
  @IsDateString()
  birth_date?: string;

  @ApiPropertyOptional({ enum: BabyGender, example: BabyGender.FEMALE })
  @IsOptional()
  @IsEnum(BabyGender)
  gender?: BabyGender;

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

  @ApiPropertyOptional({ example: 3200, description: '出生体重（克）；传 null 清空' })
  @IsOptional()
  @IsNumber()
  @Min(500)
  @Max(7000)
  birth_weight_g?: number | null;

  @ApiPropertyOptional({ example: 50, description: '出生身高（厘米）；传 null 清空' })
  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(80)
  birth_height_cm?: number | null;

  @ApiPropertyOptional({ example: 34, description: '出生头围（厘米）；传 null 清空' })
  @IsOptional()
  @IsNumber()
  @Min(20)
  @Max(50)
  birth_head_cm?: number | null;

  @ApiPropertyOptional({ description: '宝宝头像 fileID（COS 直传后写入，仅 update 使用）' })
  @IsOptional()
  @IsString()
  avatar_url?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['vitD', 'iron'],
    description: '每日补充计划（营养素 key 数组，PRD-018）；空数组 = 未配置',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsIn(SUPPLEMENT_PLAN_KEYS, { each: true })
  supplement_plan?: string[];
}
