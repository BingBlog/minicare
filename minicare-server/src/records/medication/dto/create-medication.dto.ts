import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';

/**
 * DDL: medication（迁移 013）
 *   id, baby_id, name, default_dose, note, created_by,
 *   created_at, updated_at, deleted_at（软删除）
 */

/** 创建药品清单项 */
export class CreateMedicationDto {
  @ApiProperty({ description: '宝宝 UUID' })
  @IsUUID()
  baby_id!: string;

  @ApiProperty({ description: '药品名称（≤50 字，同宝宝去重）' })
  @IsString()
  @Length(1, 50)
  name!: string;

  @ApiPropertyOptional({ description: '默认剂量，如 5ml / 1袋（≤50 字）' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  default_dose?: string;

  @ApiPropertyOptional({ description: '备注（≤200 字）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

/** 更新药品清单项（全部可选） */
export class UpdateMedicationDto {
  @ApiPropertyOptional({ description: '药品名称（≤50 字，同宝宝去重）' })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  name?: string;

  @ApiPropertyOptional({ description: '默认剂量，如 5ml / 1袋（≤50 字）' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  default_dose?: string;

  @ApiPropertyOptional({ description: '备注（≤200 字）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
