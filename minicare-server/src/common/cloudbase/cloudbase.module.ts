import { Global, Module } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cloudbase = require('@cloudbase/node-sdk') as typeof import('@cloudbase/node-sdk');

export const CLOUDBASE_APP = 'CLOUDBASE_APP';
export const CLOUDBASE_AI_APP = 'CLOUDBASE_AI_APP';

@Global()
@Module({
  providers: [
    {
      provide: CLOUDBASE_APP,
      useFactory: () => {
        const app = cloudbase.init({
          env: process.env.TCB_ENV_ID!,
          secretId: process.env.TCB_SECRET_ID,
          secretKey: process.env.TCB_SECRET_KEY,
        });
        console.log('[CloudBase] Node SDK 初始化完成，环境:', process.env.TCB_ENV_ID);
        return app;
      },
    },
    {
      provide: CLOUDBASE_AI_APP,
      useFactory: () => {
        const aiEnvId = process.env.TCB_AI_ENV_ID;
        if (!aiEnvId) {
          console.log('[CloudBase] TCB_AI_ENV_ID 未配置，AI 调用将使用主环境');
          return null;
        }
        const app = cloudbase.init({
          env: aiEnvId,
          secretId: process.env.TCB_AI_SECRET_ID || process.env.TCB_SECRET_ID,
          secretKey: process.env.TCB_AI_SECRET_KEY || process.env.TCB_SECRET_KEY,
        });
        console.log('[CloudBase] AI 专用 SDK 初始化完成，环境:', aiEnvId);
        return app;
      },
    },
  ],
  exports: [CLOUDBASE_APP, CLOUDBASE_AI_APP],
})
export class CloudbaseModule {}
