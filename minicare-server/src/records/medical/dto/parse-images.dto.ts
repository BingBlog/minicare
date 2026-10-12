import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsString, IsUUID } from 'class-validator';

/**
 * 识图解析请求（PRD-017 / TECH-035 §3.1）
 * 服务端编排：baby 归属校验 + fileId 前缀校验（/medical/{babyId}/）→ 转发 agent。
 */
export class ParseImagesDto {
  @ApiProperty({ description: '宝宝 ID' }) @IsUUID() baby_id: string;

  @ApiProperty({ description: '图片 fileID 列表（1~6 张）', type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  file_ids: string[];
}
