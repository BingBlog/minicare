import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * 「多药同服」批次 DTO（F14 增强，迁移 025）
 *
 * 模型：一次服药 = 一个批次（batch_id），批内每药一条 medication_record。
 *   - 新建：POST /records/medication/batch → 服务端生成 batch_id
 *   - 加载：GET  /records/medication/:id/batch（:id 为批内任一条记录 id）
 *   - 保存：PUT  /records/medication/:id/batch（整批 diff：保留行/新增行/删除行）
 */

/** 批次中的单个药品行 */
export class MedicationBatchItemDto {
  @ApiPropertyOptional({ description: '既有记录 id（编辑保留行回传；新增行为空）' })
  @IsOptional()
  @IsUUID()
  record_id?: string;

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
}

/** 新建多药批次 */
export class CreateMedicationBatchDto {
  @ApiProperty({ description: '宝宝 UUID' })
  @IsUUID()
  baby_id!: string;

  @ApiProperty({
    description: '服药时间（本地时间字符串，不带时区后缀，如 2026-10-12T08:30:00）',
  })
  @IsString()
  record_time!: string;

  @ApiPropertyOptional({ description: '备注（批级，≤200 字）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  @ApiProperty({ type: [MedicationBatchItemDto], description: '本次服用的药品列表' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => MedicationBatchItemDto)
  items!: MedicationBatchItemDto[];
}

/** 整批更新（以 :id 所在批次为编辑对象；:id 无批次时自动把该记录并入新批次） */
export class UpdateMedicationBatchDto {
  @ApiPropertyOptional({ description: '服药时间（批级；不传则保持原值）' })
  @IsOptional()
  @IsString()
  record_time?: string;

  @ApiPropertyOptional({ description: '备注（批级；不传则保持原值）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  @ApiProperty({ type: [MedicationBatchItemDto], description: '整批最新状态（缺省的行将被软删除）' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => MedicationBatchItemDto)
  items!: MedicationBatchItemDto[];
}
