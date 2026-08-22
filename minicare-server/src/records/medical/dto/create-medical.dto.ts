import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
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

/**
 * 就诊类型枚举（2026-08-22 精简：去掉 allergy 过敏原检测 / blood 血液检查，
 * 两者低频或与 other 重复，老数据读取不受影响，前端编辑时归一为 other）
 */
export enum VisitType {
  CHECKUP = 'checkup',   // 儿保检查
  SICK    = 'sick',      // 就诊记录
  VACCINE = 'vaccine',   // 疫苗接种
  OTHER   = 'other',     // 其他检查
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

  @ApiPropertyOptional({ description: '就诊/检查时间（HH:mm，可选）', example: '10:30' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  visit_time?: string;

  @ApiPropertyOptional({
    enum: VisitType,
    description: '就诊类型（checkup/sick/vaccine/other）',
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

  @ApiPropertyOptional({ description: '下次复查时间（HH:mm，可选）' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  follow_up_time?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class UpdateMedicalDto {
  @ApiPropertyOptional({ description: '就诊日期（YYYY-MM-DD）' })
  @IsOptional()
  @IsDateString()
  visit_date?: string;

  @ApiPropertyOptional({ description: '就诊/检查时间（HH:mm，可选）' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  visit_time?: string;

  @ApiPropertyOptional({ enum: VisitType })
  @IsOptional()
  @IsEnum(VisitType)
  visit_type?: VisitType;

  @ApiPropertyOptional() @IsOptional() @IsString() hospital?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() doctor?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() diagnosis?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() result_summary?: string;

  @ApiPropertyOptional({ type: [MedicationItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MedicationItemDto)
  medications?: MedicationItemDto[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photo_ids?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  follow_up_date?: string;

  @ApiPropertyOptional({ description: '下次复查时间（HH:mm，可选）' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  follow_up_time?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}