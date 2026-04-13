import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** 营养素明细条目 DTO */
export class SupplementItemDto {
  @ApiProperty() @IsString() key: string;
  @ApiPropertyOptional() @IsOptional() @IsString() label?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dose?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() unit?: string;
}

/**
 * 喂养类型
 * DDL: feeding_breast_record / feeding_formula_record / feeding_food_record / feeding_supplement_record
 */
export enum FeedType {
  BREAST        = 'breast',
  FORMULA       = 'formula',
  COMPLEMENTARY = 'complementary',
}

/** DDL: feeding_breast_record.breast_side VARCHAR(10) */
export enum BreastSide {
  LEFT  = 'left',
  RIGHT = 'right',
  BOTH  = 'both',
}

export class CreateFeedingDto {
  @ApiProperty() @IsUUID() baby_id: string;

  @ApiProperty({ enum: FeedType, description: 'breast=母乳 formula=配方奶 complementary=辅食/营养素' })
  @IsEnum(FeedType)
  feed_type: FeedType;

  @ApiProperty({ example: '2026-03-29T08:00:00Z', description: '喂养时间（支持补录）' })
  @IsDateString()
  record_time: string;

  /** breast 专用：哺乳侧 */
  @ApiPropertyOptional({ enum: BreastSide, description: 'breast 时必传' })
  @IsOptional()
  @IsEnum(BreastSide)
  breast_side?: BreastSide;

  /** breast / formula 专用：时长（分钟） */
  @ApiPropertyOptional({ description: '哺乳/喂养时长（分钟）' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(120)
  duration_min?: number;

  /** formula 专用：奶量 ml */
  @ApiPropertyOptional({ description: '奶粉量（ml）' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500)
  formula_ml?: number;

  /** complementary 专用：食物名称（多个用逗号/顿号分隔） */
  @ApiPropertyOptional({ description: '辅食名称（complementary 时使用，多个用顿号分隔）' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  complementary_food?: string;

  /** complementary 专用：克数 */
  @ApiPropertyOptional({ description: '辅食克数' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500)
  amount_g?: number;

  /**
   * formula 专用：奶粉类型列表
   * 如 ["aa", "eh_no_lactose"]
   */
  @ApiPropertyOptional({ description: '奶粉类型列表（formula 时使用）' })
  @IsOptional()
  @IsArray()
  milk_types?: string[];

  /**
   * formula 专用：各类奶粉勺数映射
   * 如 { "aa": 3, "eh_no_lactose": 0.33 }
   */
  @ApiPropertyOptional({ description: '奶粉勺数映射（formula 时使用）' })
  @IsOptional()
  @IsObject()
  milk_scoops?: Record<string, number>;

  /**
   * complementary 营养素专用：营养素明细列表
   * 如 [{ key: "vitD", label: "维D", dose: "400", unit: "IU" }]
   */
  @ApiPropertyOptional({ description: '营养素列表（营养素 Tab 时使用）', type: () => [SupplementItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplementItemDto)
  supplement_items?: SupplementItemDto[];

  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

/** 更新喂养记录 DTO */
export class UpdateFeedingDto {
  @ApiPropertyOptional({ enum: FeedType }) @IsOptional() @IsEnum(FeedType) feed_type?: FeedType;
  @ApiPropertyOptional() @IsOptional() @IsDateString() record_time?: string;
  @ApiPropertyOptional({ enum: BreastSide }) @IsOptional() @IsEnum(BreastSide) breast_side?: BreastSide;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(120) duration_min?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(500) formula_ml?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() complementary_food?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(500) amount_g?: number;
  @ApiPropertyOptional() @IsOptional() @IsArray() milk_types?: string[];
  @ApiPropertyOptional() @IsOptional() @IsObject() milk_scoops?: Record<string, number>;
  @ApiPropertyOptional({ type: () => [SupplementItemDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SupplementItemDto) supplement_items?: SupplementItemDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}
