import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';

export const FEED_TYPES = [
  'all',
  'feeding',
  'sleep',
  'diaper',
  'activity',
  'health',
  'growth',
  'medical',
  'symptom',
] as const;

export type FeedFilterType = typeof FEED_TYPES[number];

export class FeedQueryDto {
  @ApiProperty({ description: '宝宝 ID (UUID)' })
  @IsUUID()
  baby_id!: string;

  @ApiPropertyOptional({ description: '分页条数，默认 20，范围 1~50', default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ description: '分页游标（Base64URL）' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: '类型过滤', enum: FEED_TYPES, default: 'all' })
  @IsOptional()
  @IsIn(FEED_TYPES)
  type?: FeedFilterType;

  @ApiPropertyOptional({ description: '按自然日筛选，格式 YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date 格式须为 YYYY-MM-DD' })
  date?: string;
}
