import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export enum DiaperType { WET = 'wet', DIRTY = 'dirty', BOTH = 'both', DRY = 'dry' }
export enum StoolColor { YELLOW = 'yellow', GREEN = 'green', BROWN = 'brown', BLACK = 'black', OTHER = 'other' }
export enum StoolConsistency { LIQUID = 'liquid', SOFT = 'soft', FIRM = 'firm' }

export class CreateDiaperDto {
  @ApiProperty() @IsUUID() baby_id: string;
  @ApiProperty({ enum: DiaperType }) @IsEnum(DiaperType) type: DiaperType;
  @ApiProperty() @IsDateString() recorded_at: string;
  @ApiPropertyOptional({ enum: StoolColor }) @IsOptional() @IsEnum(StoolColor) stool_color?: StoolColor;
  @ApiPropertyOptional({ enum: StoolConsistency }) @IsOptional() @IsEnum(StoolConsistency) stool_consistency?: StoolConsistency;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}
