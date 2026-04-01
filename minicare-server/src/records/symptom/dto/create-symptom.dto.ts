import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DDL: symptom_record
 *   record_time  DATETIME
 *   symptoms     JSON  -- [{"type":1,"severity":2}]
 *   photo_ids    JSON  -- 照片 fileID 列表
 *   spirit       VARCHAR(20) -- 精神状态: active/normal/tired/lethargic
 *   mood         VARCHAR(20) -- 情绪状态: happy/neutral/fussy/crying
 */

/** 精神状态枚举 */
export enum SpiritLevel {
  ACTIVE   = 'active',    // 活跃
  NORMAL   = 'normal',    // 正常
  TIRED    = 'tired',     // 偏疲惫
  LETHARGIC = 'lethargic', // 非常差
}

/** 情绪状态枚举 */
export enum MoodLevel {
  HAPPY   = 'happy',    // 开心
  NEUTRAL = 'neutral',  // 平静
  FUSSY   = 'fussy',    // 烦躁
  CRYING  = 'crying',   // 哭闹
}

/** 单条症状对象 */
export class SymptomItemDto {
  @ApiProperty({ description: '症状类型编号（1=rash 2=vomit 3=fever 4=diarrhea 5=constipation 6=other）' })
  @IsNumber()
  type: number;

  @ApiPropertyOptional({ description: '严重程度（1=mild 2=moderate 3=severe）' })
  @IsOptional()
  @IsNumber()
  severity?: number;
}

export class CreateSymptomDto {
  @ApiProperty() @IsUUID() baby_id: string;

  @ApiProperty({ description: '记录时间（ISO 8601）' })
  @IsDateString()
  record_time: string;

  @ApiProperty({
    description: '症状列表，如 [{"type":1,"severity":2}]',
    type: [SymptomItemDto],
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'symptoms 至少需要包含一条症状记录' })
  @ValidateNested({ each: true })
  @Type(() => SymptomItemDto)
  symptoms: SymptomItemDto[];

  @ApiPropertyOptional({ enum: SpiritLevel, description: '精神状态' })
  @IsOptional()
  @IsEnum(SpiritLevel)
  spirit?: SpiritLevel;

  @ApiPropertyOptional({ enum: MoodLevel, description: '情绪状态' })
  @IsOptional()
  @IsEnum(MoodLevel)
  mood?: MoodLevel;

  @ApiPropertyOptional({ description: '照片 fileID 列表', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photo_ids?: string[];

  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

/** 更新症状记录 DTO */
export class UpdateSymptomDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() record_time?: string;
  @ApiPropertyOptional({ type: [SymptomItemDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SymptomItemDto) symptoms?: SymptomItemDto[];
  @ApiPropertyOptional({ enum: SpiritLevel }) @IsOptional() @IsEnum(SpiritLevel) spirit?: SpiritLevel;
  @ApiPropertyOptional({ enum: MoodLevel }) @IsOptional() @IsEnum(MoodLevel) mood?: MoodLevel;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) photo_ids?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}