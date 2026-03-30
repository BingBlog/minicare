import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

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

/** feed_type → TINYINT 映射 */
export const FEED_TYPE_TO_INT: Record<string, number> = {
  breast:        1,
  formula:       2,
  complementary: 3,
};

/** breast_side → TINYINT 映射 */
export const BREAST_SIDE_TO_INT: Record<string, number> = {
  left:  1,
  right: 2,
  both:  3,
};

/** TINYINT → feed_type 映射 */
export const INT_TO_FEED_TYPE: Record<number, string> = {
  1: 'breast',
  2: 'formula',
  3: 'complementary',
};

/** TINYINT → breast_side 映射 */
export const INT_TO_BREAST_SIDE: Record<number, string> = {
  1: 'left',
  2: 'right',
  3: 'both',
};

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

  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}
