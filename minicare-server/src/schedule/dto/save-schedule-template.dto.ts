import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ScheduleItemType } from '../schedule-item-type';
import { SCHEDULE_NOTE_MAX_LENGTH, SCHEDULE_TITLE_MAX_LENGTH } from '../schedule.constants';

/** HH:mm（24 小时制），日程时间为"每天重复的时刻"，不带日期与时区 */
const HM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class ScheduleItemDto {
  @ApiPropertyOptional({ description: '已有项的 id；新增项不传，由服务端生成' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({
    enum: ScheduleItemType,
    description:
      '日程项类型；可选集合与默认名见 schedule-item-type.meta.ts（此处不重复列举，避免与声明表漂移）。' +
      'other = 自定义事项，不判定、不计入进度分母',
  })
  @IsEnum(ScheduleItemType)
  item_type!: ScheduleItemType;

  @ApiPropertyOptional({ description: `用户可见名称；为空时由 item_type 推导默认名（≤${SCHEDULE_TITLE_MAX_LENGTH} 字）` })
  @IsOptional()
  @IsString()
  @MaxLength(SCHEDULE_TITLE_MAX_LENGTH)
  title?: string | null;

  @ApiProperty({ description: '计划执行时间 HH:mm' })
  @Matches(HM_PATTERN, { message: '执行时间格式应为 HH:mm' })
  execute_time!: string;

  @ApiPropertyOptional({ description: '准备节点时间 HH:mm；null 表示无准备节点' })
  @IsOptional()
  @Matches(HM_PATTERN, { message: '准备时间格式应为 HH:mm' })
  prepare_time?: string | null;

  @ApiPropertyOptional({ description: '准备提前量（分钟）；仅用于 UI 联动推导，判定不依赖' })
  @IsOptional()
  @IsInt()
  @Min(0)
  prepare_offset_min?: number | null;

  @ApiPropertyOptional({ description: 'false=停用：不参与展示、判定与进度分母', default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: `备注（≤${SCHEDULE_NOTE_MAX_LENGTH} 字）` })
  @IsOptional()
  @IsString()
  @MaxLength(SCHEDULE_NOTE_MAX_LENGTH)
  note?: string | null;
}

/**
 * 全量保存作息模板（差集语义：未出现在 items 中的已有项将被软删除）
 */
export class SaveScheduleTemplateDto {
  @ApiProperty({
    type: [ScheduleItemDto],
    description:
      '全量日程项（新增/修改/保留的合集）。**数组顺序 = 展示顺序**：' +
      '服务端按下标整体重写 `sort_order`（0..n-1），客户端拖拽后直接按新顺序提交即可，' +
      '无需传 sort_order 字段。',
  })
  @IsArray()
  @ArrayMaxSize(50, { message: '日程项最多 50 条' })
  @ValidateNested({ each: true })
  @Type(() => ScheduleItemDto)
  items!: ScheduleItemDto[];
}
