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
import {
  FEED_TYPE_OPTIONS,
  BREAST_SIDE_OPTIONS,
  FEED_TYPE_TO_INT,
  BREAST_SIDE_TO_INT,
  INT_TO_FEED_TYPE,
  INT_TO_BREAST_SIDE,
} from '../../../app-config/app-config.data';

/** 营养素明细条目 DTO */
export class SupplementItemDto {
  @ApiProperty() @IsString() key: string;
  @ApiPropertyOptional() @IsOptional() @IsString() label?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dose?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() unit?: string;
}

/** DDL: feed_type TINYINT 1=breast 2=formula 3=complementary */
export enum FeedType {
  BREAST        = 'breast',
  FORMULA       = 'formula',
  COMPLEMENTARY = 'complementary',
}

/** DDL: breast_side TINYINT 1=left 2=right 3=both */
export enum BreastSide {
  LEFT  = 'left',
  RIGHT = 'right',
  BOTH  = 'both',
}

// 整数映射常量（从权威数据源导入，不在此重复定义）
export { FEED_TYPE_TO_INT, BREAST_SIDE_TO_INT, INT_TO_FEED_TYPE, INT_TO_BREAST_SIDE };

// 确保 enum 与 app-config.data.ts 定义一致（运行时断言）
const _feedTypeValues = FEED_TYPE_OPTIONS.map((o) => o.value);
Object.values(FeedType).forEach((v) => {
  if (!_feedTypeValues.includes(v as never)) {
    throw new Error(`FeedType enum value "${v}" not found in app-config FEED_TYPE_OPTIONS`);
  }
});
const _breastSideValues = BREAST_SIDE_OPTIONS.map((o) => o.value);
Object.values(BreastSide).forEach((v) => {
  if (!_breastSideValues.includes(v as never)) {
    throw new Error(`BreastSide enum value "${v}" not found in app-config BREAST_SIDE_OPTIONS`);
  }
});

export class CreateFeedingDto {
  @ApiProperty() @IsUUID() baby_id: string;

  @ApiProperty({ enum: FeedType, description: 'DDL: 1=breast 2=formula 3=complementary' })
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

  /** breast 专用：时长（分钟） */
  @ApiPropertyOptional({ description: '母乳时长（分钟）' })
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

  /** complementary 专用：食物名称 */
  @ApiPropertyOptional({ description: '辅食名称（complementary 时使用）' })
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
