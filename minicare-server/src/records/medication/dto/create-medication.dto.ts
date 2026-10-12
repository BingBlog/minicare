import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';

/**
 * DDL: medication（迁移 013 + 025）
 *   id, baby_id, name, default_dose, photo_id, note, created_by,
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

  @ApiPropertyOptional({ description: '药品照片 fileID（拍药盒；≤512 字符，迁移 025）' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  photo_id?: string;

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

  @ApiPropertyOptional({ description: '药品照片 fileID（传空字符串/null 清除照片；≤512 字符）' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  photo_id?: string;

  @ApiPropertyOptional({ description: '备注（≤200 字）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
