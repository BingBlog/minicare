import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppConfigData } from './app-config.data';

@ApiTags('config')
@Controller('config')
export class AppConfigController {
  /**
   * GET /api/config
   * 返回前端所需的全量配置（枚举选项、数值范围、营养素列表、快捷入口默认值）
   * 无需鉴权，Public 接口
   */
  @Get()
  @ApiOperation({ summary: '获取全量应用配置', description: '公开接口，无需鉴权。前端通过版本号判断是否需要刷新本地缓存。' })
  getConfig() {
    return AppConfigData.build();
  }
}
