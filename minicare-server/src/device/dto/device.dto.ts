/**
 * 音箱设备 DTO（device.dto.ts，TECH-008 §3）
 */
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

/** POST /api/device/bind — 绑定码换取设备 token */
export class BindDeviceDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{6}$/, { message: 'code 必须是 6 位数字' })
  code!: string;

  @IsOptional()
  @IsString()
  device_name?: string;

  @IsOptional()
  @IsString()
  device_type?: string;

  @IsOptional()
  @IsString()
  mac_address?: string;
}

/** openai 兼容 messages[] 单条 */
export class LlmMessageDto {
  @IsString()
  @IsNotEmpty()
  role!: string;

  @IsString()
  content!: string;
}

/** POST /api/device/llm — xiaozhi LLM Adapter 入参（openai 兼容） */
export class DeviceLlmDto {
  @IsOptional()
  @IsString()
  model?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LlmMessageDto)
  messages!: LlmMessageDto[];
}
