import { Global, Module } from '@nestjs/common';
import cloudbase from '@cloudbase/node-sdk';

export const CLOUDBASE_APP = 'CLOUDBASE_APP';

/**
 * CloudBase Node SDK 单例 — 全局模块
 *
 * 用于：
 * - Auth 模块：调用 CloudBase SMS OTP API 发送/验证手机号
 * - Storage 模块：生成临时上传/下载 URL
 * - 未来：AI 图文识别（OCR）、云函数调用等
 */
@Global()
@Module({
  providers: [
    {
      provide: CLOUDBASE_APP,
      useFactory: () => {
        const app = cloudbase.init({
          env: process.env.TCB_ENV_ID!,
          // CloudRun 环境内自动使用内网凭证，无需配置 secretId/secretKey
          // 本地开发需要在环境变量中提供 CLOUDBASE_SECRETID / CLOUDBASE_SECRETKEY
          secretId: process.env.TCB_SECRET_ID,
          secretKey: process.env.TCB_SECRET_KEY,
        });
        console.log('[CloudBase] Node SDK 初始化完成，环境:', process.env.TCB_ENV_ID);
        return app;
      },
    },
  ],
  exports: [CLOUDBASE_APP],
})
export class CloudbaseModule {}
