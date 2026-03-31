import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DDL: medical_record（迁移 001 基础字段 + 003 扩展字段）
 *   visit_date     DATE          -- 就诊日期
 *   hospital       VARCHAR(100)  -- 医院名称
 *   diagnosis      TEXT          -- 诊断结论
 *   medications    JSON          -- [{"name":"xx","dose":"xx"}]
 *   photo_ids      JSON          -- 照片 fileID 列表
 *   visit_type     VARCHAR(20)   -- 就诊类型（Migration 003）
 *   doctor         VARCHAR(50)   -- 主诊医生（Migration 003）
 *   result_summary TEXT          -- 结果摘要（Migration 003）
 *   follow_up_date DATE          -- 复查日期（Migration 003）
 */

/** 就诊类型枚举 */
export enum VisitType {
  CHECKUP = 'checkup',   // 常规体检
  ALLERGY = 'allergy',   // 过敏专科
  SICK    = 'sick',      // 生病就诊
  VACCINE = 'vaccine',   // 疫苗接种
  BLOOD   = 'blood',     // 血液检查
  OTHER   = 'other',     // 其他
}

/** 单条用药记录 */
export class MedicationItemDto {
  @ApiProperty({ description: '药品名称' }) @IsString() name: string;
  @ApiPropertyOptional({ description: '剂量描述，如 5ml 每次' }) @IsOptional() @IsString() dose?: string;
}

export class CreateMedicalDto {
  @ApiProperty() @IsUUID() baby_id: string;

  @ApiProperty({ description: '就诊日期（YYYY-MM-DD）' })
  @IsDateString()
  visit_date: string;

  @ApiPropertyOptional({
    enum: VisitType,
    description: '就诊类型（checkup/allergy/sick/vaccine/blood/other）',
  })
  @IsOptional()
  @IsEnum(VisitType)
  visit_type?: VisitType;

  @ApiPropertyOptional({ description: '医院名称（≤100字）' }) @IsOptional() @IsString() hospital?: string;

  @ApiPropertyOptional({ description: '主诊医生姓名（≤50字）' }) @IsOptional() @IsString() doctor?: string;

  @ApiPropertyOptional({ description: '诊断结论' }) @IsOptional() @IsString() diagnosis?: string;

  @ApiPropertyOptional({ description: '结果摘要（如检测指标等）' }) @IsOptional() @IsString() result_summary?: string;

  @ApiPropertyOptional({
    description: '用药列表，如 [{"name":"布洛芬","dose":"5ml"}]',
    type: [MedicationItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MedicationItemDto)
  medications?: MedicationItemDto[];

  @ApiPropertyOptional({ description: '照片 fileID 列表', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photo_ids?: string[];

  @ApiPropertyOptional({ description: '下次复查日期（YYYY-MM-DD）' })
  @IsOptional()
  @IsDateString()
  follow_up_date?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}
