import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export enum ObservationStatus {
  OBSERVING = 'observing',
  PAUSED = 'paused',
  SAFE = 'safe',
  SUSPECTED = 'suspected',
  ALLERGIC = 'allergic',
}

export class UnlinkObservationHealthDto {
  @ApiProperty({ enum: [ObservationStatus.OBSERVING, ObservationStatus.PAUSED, ObservationStatus.SUSPECTED] })
  @IsEnum(ObservationStatus)
  target_status: ObservationStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reaction_note?: string;
}

export enum ReactionLevel {
  NONE = 'none',
  MILD = 'mild',
  MODERATE = 'moderate',
  SEVERE = 'severe',
}

export enum ObservationLogAction {
  CONTINUE = 'continue',
  PAUSE = 'pause',
  MARK_SUSPECTED = 'mark_suspected',
  MARK_ALLERGIC = 'mark_allergic',
}

export class CreateFoodObservationDto {
  @ApiProperty()
  @IsUUID()
  baby_id: string;

  @ApiProperty()
  @IsString()
  food_name: string;

  @ApiPropertyOptional({ minimum: 3, maximum: 7, default: 3 })
  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(7)
  observation_days?: number;

  @ApiPropertyOptional({ description: '首次引入日期 YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  first_intro_at?: string;
}

export class ListFoodObservationDto {
  @ApiProperty()
  @IsUUID()
  baby_id: string;

  @ApiPropertyOptional({ enum: ObservationStatus })
  @IsOptional()
  @IsEnum(ObservationStatus)
  status?: ObservationStatus;
}

export class UpdateFoodObservationStatusDto {
  @ApiProperty({ enum: ObservationStatus })
  @IsEnum(ObservationStatus)
  status: ObservationStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reaction_note?: string;

  @ApiPropertyOptional({ enum: ReactionLevel })
  @IsOptional()
  @IsEnum(ReactionLevel)
  severity?: ReactionLevel;

  @ApiPropertyOptional({ description: '可复引入日期 YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  retry_after_date?: string;
}

export class UpsertFoodObservationLogDto {
  @ApiPropertyOptional({ description: '打卡日期 YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  record_date?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 500 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500)
  intake_amount_g?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  reaction_flags?: string[];

  @ApiPropertyOptional({ enum: ReactionLevel })
  @IsOptional()
  @IsEnum(ReactionLevel)
  reaction_level?: ReactionLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ enum: ObservationLogAction, default: ObservationLogAction.CONTINUE })
  @IsOptional()
  @IsEnum(ObservationLogAction)
  action?: ObservationLogAction;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  health_record_id?: string;
}

export class CreateFoodObservationReactionDto {
  @ApiProperty({ minimum: 1, maximum: 7 })
  @IsInt()
  @Min(1)
  @Max(7)
  day_index: number;

  @ApiProperty({ description: '记录时间（ISO 8601）' })
  @IsDateString()
  record_time: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergy_symptoms?: string[];

  @ApiPropertyOptional({ enum: ReactionLevel })
  @IsOptional()
  @IsEnum(ReactionLevel)
  allergy_severity?: ReactionLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiProperty({ enum: [ObservationStatus.SUSPECTED, ObservationStatus.ALLERGIC] })
  @IsEnum(ObservationStatus)
  target_status: ObservationStatus;
}
