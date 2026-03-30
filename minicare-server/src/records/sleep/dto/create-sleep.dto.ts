import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * DDL: sleep_record.status TINYINT 1=ongoing 2=ended
 * 注：DDL 中不存在 quality / sleep_period 字段
 */

export class StartSleepDto {
  @ApiProperty() @IsUUID() baby_id: string;

  @ApiProperty({ description: '睡眠开始时间（ISO 8601）' })
  @IsDateString()
  start_time: string;

  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class EndSleepDto {
  @ApiProperty({ description: '睡眠结束时间（ISO 8601）' })
  @IsDateString()
  end_time: string;

  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}
