import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DDL: medical_record（迁移 001 基础字段 + 003 扩展字段 + 020 类型化扩展字段）
 *   基础: visit_date/hospital/diagnosis/medications(JSON)/photo_ids(JSON)/note
 *   003 : visit_type/doctor/result_summary/follow_up_date (+014 visit_time +015 follow_up_time)
 *   020 : 疫苗(vaccine_*)、儿保(checkup_*)、就诊(sick_*) 类型化列，见 TECH-011 §2.1
 */

/**
 * 就诊类型枚举（2026-08-22 精简 blood/allergy 后，020 保留 4 型；blood/allergy 仅老数据展示）
 */
export enum VisitType {
  CHECKUP = 'checkup',   // 儿保检查
  SICK    = 'sick',      // 就诊记录
  VACCINE = 'vaccine',   // 疫苗接种
  OTHER   = 'other',     // 其他检查
}

/** 废弃就诊类型（仅老数据展示/归一），不参与新建 */
export const LEGACY_VISIT_TYPES = ['blood', 'allergy'] as const;

/** 疫苗参考库程序类别 */
export const VACCINE_CATEGORY_LABELS: Record<string, string> = {
  free: '免费',
  paid: '自费',
};

/** 接种后反应枚举 */
export enum VaccineReaction {
  NONE = 'none',
  FEVER = 'fever',
  LOCAL_REDNESS = 'local_redness',
  INDURATION = 'induration',
  RASH = 'rash',
  SLEEPY_IRRITABLE = 'sleepy_irritable',
  OTHER = 'other',
}

/** 接种部位 */
export enum VaccineSite {
  LEFT_ARM = 'left_arm',
  RIGHT_ARM = 'right_arm',
  THIGH = 'thigh',
  ORAL = 'oral',
  OTHER = 'other',
  UNKNOWN = 'unknown',
}

/** 儿保里程碑维度 */
export enum CheckupMilestoneDim {
  GROSS = 'gross',           // 大运动
  FINE = 'fine',             // 精细动作
  LANGUAGE = 'language',     // 语言
  COGNITIVE = 'cognitive',   // 认知
  SOCIAL = 'social',         // 社会适应
}

/** 里程碑状态 */
export enum MilestoneStatus {
  OK = 'ok',                 // 正常
  WATCH = 'watch',           // 待观察
  NA = 'na',                 // 未评估
}

/** 儿保测量同步生长记录状态 */
export enum CheckupGrowthSync {
  NONE = 'none',
  SYNCED = 'synced',
  OVERWRITTEN = 'overwritten',
  SKIPPED = 'skipped',
}

/** 单条用药记录（medications JSON item；P1 就诊开药扩展 days；PRD-017 识图扩展 spec/quantity/frequency/route/note） */
export class MedicationItemDto {
  @ApiProperty({ description: '药品名称' }) @IsString() name: string;
  @ApiPropertyOptional({ description: '单次用量，如 1.25ml / 0.8袋（AI 识图复用此字段）' }) @IsOptional() @IsString() dose?: string;
  @ApiPropertyOptional({ description: '服药天数（选填）' }) @IsOptional() @IsInt() @Min(1) @Max(365) days?: number;
  // ── PRD-017 识图建档扩展（全可选，向后兼容）──
  @ApiPropertyOptional({ description: '规格，如 0.6g 15ml/瓶' }) @IsOptional() @IsString() spec?: string;
  @ApiPropertyOptional({ description: '数量，如 1瓶 / 1盒' }) @IsOptional() @IsString() quantity?: string;
  @ApiPropertyOptional({ description: '频次，如 每日3次 / 必要时' }) @IsOptional() @IsString() frequency?: string;
  @ApiPropertyOptional({ description: '给药途径，如 口服' }) @IsOptional() @IsString() route?: string;
  @ApiPropertyOptional({ description: '备注，如 必要时' }) @IsOptional() @IsString() note?: string;
}

/** 儿保里程碑单条 */
export class MilestoneItemDto {
  @ApiProperty({ enum: CheckupMilestoneDim, description: '发育维度' })
  @IsEnum(CheckupMilestoneDim)
  dim: string;

  @ApiProperty({ enum: MilestoneStatus, description: 'ok=正常 watch=待观察 na=未评估' })
  @IsIn(['ok', 'watch', 'na'])
  status: string;

  @ApiPropertyOptional({ description: '该维度备注' }) @IsOptional() @IsString() note?: string;
}

/** 儿保家长问答单条（answer 空 = 待补答复） */
export class QaItemDto {
  @ApiProperty({ description: '我的问题' }) @IsString() question: string;
  @ApiPropertyOptional({ description: '医生答复（空 = 待补答复）' }) @IsOptional() @IsString() answer?: string;
}

/** 单据类型枚举（PRD-017 §3.1；与 agent 解析契约 / mp DOC_TYPE_LABELS 同源） */
export const MEDICAL_DOC_TYPES = ['outpatient_record', 'prescription', 'lab_report', 'imaging_report', 'other'] as const;

/** 单据解析档案输入（PRD-017 / TECH-035：随记录保存一并提交；行=图片） */
export class MedicalDocumentInputDto {
  @ApiProperty({ description: '图片 fileID（须在 photo_ids 内，否则服务端过滤）' })
  @IsString() @IsNotEmpty() @MaxLength(512) file_id: string;

  @ApiProperty({ enum: MEDICAL_DOC_TYPES, description: '单据类型' })
  @IsIn(MEDICAL_DOC_TYPES as unknown as string[])
  doc_type: string;

  @ApiProperty({ description: '识别状态 success|failed' })
  @IsIn(['success', 'failed'])
  status: string;

  @ApiPropertyOptional({ description: '整体置信 high|low（failed 不传）' })
  @IsOptional() @IsIn(['high', 'low']) confidence?: string;

  @ApiPropertyOptional({ description: '解析产出 {docType,confidence,lowConfidenceFields,data:{…}}' })
  @IsOptional() @IsObject() parsed_json?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '失败原因（用户可读短句）' })
  @IsOptional() @IsString() @MaxLength(255) error_note?: string;
}

/** 各类型专属字段组（service 校验/白名单用，避免跨类型写入错列） */
export const TYPED_FIELD_GROUPS = {
  vaccine: [
    'vaccine_name', 'vaccine_schedule_key', 'vaccine_dose_seq', 'vaccine_site',
    'vaccine_batch', 'vaccine_reactions', 'vaccine_reaction_note',
  ],
  checkup: [
    'checkup_height_mm', 'checkup_weight_g', 'checkup_head_mm', 'checkup_milestones',
    'checkup_assessment', 'checkup_qa', 'checkup_growth_sync',
  ],
  sick: ['sick_complaint', 'sick_symptom_flags'],
} as const;

export class CreateMedicalDto {
  @ApiProperty() @IsUUID() baby_id: string;

  @ApiProperty({ description: '就诊日期（YYYY-MM-DD）' })
  @IsDateString()
  visit_date: string;

  @ApiPropertyOptional({ description: '就诊/检查时间（HH:mm，可选）', example: '10:30' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  visit_time?: string;

  @ApiPropertyOptional({ enum: VisitType, description: '就诊类型（checkup/sick/vaccine/other）' })
  @IsOptional()
  @IsEnum(VisitType)
  visit_type?: VisitType;

  @ApiPropertyOptional({ description: '医院名称（≤100字）' }) @IsOptional() @IsString() hospital?: string;

  @ApiPropertyOptional({ description: '主诊医生姓名（≤50字）' }) @IsOptional() @IsString() doctor?: string;

  @ApiPropertyOptional({ description: '诊断结论' }) @IsOptional() @IsString() diagnosis?: string;

  @ApiPropertyOptional({ description: '结果摘要（如检测指标等）' }) @IsOptional() @IsString() result_summary?: string;

  @ApiPropertyOptional({
    description: '用药列表，如 [{"name":"布洛芬","dose":"5ml","days":3}]',
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

  // ── 020 类型化扩展 ──
  @ApiPropertyOptional({ description: '疫苗名称（自定义名或参考库名快照）' }) @IsOptional() @IsString() vaccine_name?: string;
  @ApiPropertyOptional({ description: '参考库程序键（自定义疫苗不传）' }) @IsOptional() @IsString() vaccine_schedule_key?: string;
  @ApiPropertyOptional({ description: '第几剂（1 起）' }) @IsOptional() @IsInt() @Min(1) @Max(20) vaccine_dose_seq?: number;
  @ApiPropertyOptional({ enum: VaccineSite }) @IsOptional() @IsEnum(VaccineSite) vaccine_site?: string;
  @ApiPropertyOptional({ description: '疫苗批号' }) @IsOptional() @IsString() vaccine_batch?: string;
  @ApiPropertyOptional({ description: '接种后反应枚举数组', enum: VaccineReaction, isArray: true })
  @IsOptional() @IsArray() @IsEnum(VaccineReaction, { each: true })
  vaccine_reactions?: string[];
  @ApiPropertyOptional({ description: '接种反应文字说明' }) @IsOptional() @IsString() vaccine_reaction_note?: string;

  @ApiPropertyOptional({ description: '身高（mm，与 growth 同单位）' }) @IsOptional() @IsInt() @Min(100) @Max(1600) checkup_height_mm?: number;
  @ApiPropertyOptional({ description: '体重（g）' }) @IsOptional() @IsInt() @Min(500) @Max(60000) checkup_weight_g?: number;
  @ApiPropertyOptional({ description: '头围（mm）' }) @IsOptional() @IsInt() @Min(200) @Max(700) checkup_head_mm?: number;
  @ApiPropertyOptional({ description: '发育里程碑（5 维可选）', type: [MilestoneItemDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => MilestoneItemDto)
  checkup_milestones?: MilestoneItemDto[];
  @ApiPropertyOptional({ description: '医生综合评估与建议' }) @IsOptional() @IsString() checkup_assessment?: string;
  @ApiPropertyOptional({ description: '家长问答列表（answer 空=待补答复）', type: [QaItemDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => QaItemDto)
  checkup_qa?: QaItemDto[];
  @ApiPropertyOptional({ description: '同步生长记录状态（系统回填；前端仅可传 skipped）', enum: CheckupGrowthSync })
  @IsOptional() @IsIn(['none', 'synced', 'overwritten', 'skipped'])
  checkup_growth_sync?: string;

  @ApiPropertyOptional({ description: '主诉描述' }) @IsOptional() @IsString() sick_complaint?: string;
  @ApiPropertyOptional({ description: '主诉症状标签枚举数组', type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  sick_symptom_flags?: string[];

  @ApiPropertyOptional({ description: '单据解析档案（PRD-017 识图；行=图片）', type: [MedicalDocumentInputDto] })
  @IsOptional() @IsArray() @ArrayMaxSize(6) @ValidateNested({ each: true }) @Type(() => MedicalDocumentInputDto)
  documents?: MedicalDocumentInputDto[];

  @ApiPropertyOptional({ description: '就诊开药是否同步加入药箱（P1；true 时按 medications 逐条去重写入药箱）' })
  @IsOptional() @IsBoolean()
  sync_meds_to_stock?: boolean;
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

  // ── 020 类型化扩展（同 Create）──
  @ApiPropertyOptional() @IsOptional() @IsString() vaccine_name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vaccine_schedule_key?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(20) vaccine_dose_seq?: number;
  @ApiPropertyOptional() @IsOptional() @IsEnum(VaccineSite) vaccine_site?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vaccine_batch?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsEnum(VaccineReaction, { each: true })
  vaccine_reactions?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() vaccine_reaction_note?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(100) @Max(1600) checkup_height_mm?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(500) @Max(60000) checkup_weight_g?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(200) @Max(700) checkup_head_mm?: number;
  @ApiPropertyOptional({ type: [MilestoneItemDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => MilestoneItemDto)
  checkup_milestones?: MilestoneItemDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() checkup_assessment?: string;
  @ApiPropertyOptional({ type: [QaItemDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => QaItemDto)
  checkup_qa?: QaItemDto[];
  @ApiPropertyOptional() @IsOptional() @IsIn(['none', 'synced', 'overwritten', 'skipped'])
  checkup_growth_sync?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() sick_complaint?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  sick_symptom_flags?: string[];

  @ApiPropertyOptional({ description: '单据解析档案（PRD-017 识图；全量提交，服务端 upsert+按 photo_ids 清理）', type: [MedicalDocumentInputDto] })
  @IsOptional() @IsArray() @ArrayMaxSize(6) @ValidateNested({ each: true }) @Type(() => MedicalDocumentInputDto)
  documents?: MedicalDocumentInputDto[];

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  sync_meds_to_stock?: boolean;
}
