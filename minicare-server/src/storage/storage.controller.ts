import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { StorageService } from './storage.service';
import { JwtGuard } from '../auth/jwt.guard';
import { IsString } from 'class-validator';

class GetUploadUrlDto {
  @ApiProperty({ example: 'symptoms/uuid-baby/uuid-record/1.jpg', description: '存储路径' })
  @IsString()
  cloudPath: string;
}

class GetDownloadUrlsDto {
  @ApiProperty({ type: [String] })
  fileIDs: string[];
}

@ApiTags('storage')
@Controller('storage')
@UseGuards(JwtGuard)
@ApiBearerAuth()
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  /**
   * POST /storage/upload-url
   * 获取临时上传 URL（客户端直传 COS）
   */
  @Post('upload-url')
  @ApiOperation({ summary: '获取临时上传 URL（客户端直传）' })
  getUploadUrl(@Body() dto: GetUploadUrlDto) {
    return this.storageService.getUploadUrl(dto.cloudPath);
  }

  /**
   * POST /storage/download-urls
   * 批量获取临时下载 URL（有效期 1h）
   */
  @Post('download-urls')
  @ApiOperation({ summary: '批量获取临时下载 URL' })
  getDownloadUrls(@Body() dto: GetDownloadUrlsDto) {
    return this.storageService.getTempDownloadUrls(dto.fileIDs);
  }
}
