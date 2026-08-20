import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';

/**
 * DDL: medication_record（迁移 013）
 *   id, baby_id, medication_id, medication_name（快照）, dose,
 *   record_time, note, recorded_by, created_at, updated_at, deleted_at（软删除）
 */

/** 单次服药打卡 */
export class CreateMedicationRecordDto {
  @ApiProperty({ description: '宝宝 UUID' })
  @IsUUID()
  baby_id!: string;

  @ApiPropertyOptional({ description: '关联药品清单 ID（清单软删后可为空）' })
  @IsOptional()
  @IsUUID()
  medication_id?: string;

  @ApiProperty({ description: '药品名称快照（≤50 字）' })
  @IsString()
  @Length(1, 50)
  medication_name!: string;

  @ApiPropertyOptional({ description: '本次实际剂量，可空=按需（≤50 字）' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  dose?: string;

  @ApiProperty({
    description: '服药时间（本地时间字符串，不带时区后缀，如 2026-08-20T16:30:00）',
  })
  @IsString()
  record_time!: string;

  @ApiPropertyOptional({ description: '备注（≤200 字）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

/** 更新服药打卡（全部可选） */
export class UpdateMedicationRecordDto {
  @ApiPropertyOptional({ description: '关联药品清单 ID' })
  @IsOptional()
  @IsUUID()
  medication_id?: string;

  @ApiPropertyOptional({ description: '药品名称快照（≤50 字）' })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  medication_name?: string;

  @ApiPropertyOptional({ description: '本次实际剂量，可空=按需（≤50 字）' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  dose?: string;

  @ApiPropertyOptional({ description: '服药时间（本地时间字符串）' })
  @IsOptional()
  @IsString()
  record_time?: string;

  @ApiPropertyOptional({ description: '备注（≤200 字）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
