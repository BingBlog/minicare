// 环境变量加载：本地开发从 .env.local 读取，生产环境由 CloudRun 直接注入
import { config } from 'dotenv';
import { resolve } from 'path';
// 非生产环境加载 .env.local（本地开发）
if (process.env.NODE_ENV !== 'production') {
  config({ path: resolve(process.cwd(), '.env.local') });
}

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // ── 全局路由前缀 /api（排除 /health）────────────────────────────
  app.setGlobalPrefix('api', { exclude: ['health'] });

  // ── 全局校验管道（class-validator + class-transformer）──────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,         // 过滤 DTO 未定义的字段
      forbidNonWhitelisted: true,
      transform: true,         // 自动类型转换（string → number 等）
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── CORS ──────────────────────────────────────────────────────
  // 所有环境均按 CORS_ORIGINS 环境变量白名单启用，
  // 本地开发在 .env.local 中配置，生产/staging 在 CloudRun EnvParams 中配置。
  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    credentials: true,
  });

  // ── Swagger（仅非生产环境）────────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('minicare API')
      .setDescription('minicare 后端 API 文档（NestJS · CloudRun）')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api-docs', app, document);
    console.log('[minicare] Swagger: http://localhost:3000/api-docs');
  }

  // ── /health 端点（CloudRun 健康检查 + curl 验证）────────────
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/health', (_req: unknown, res: { json: (data: unknown) => void }) => {
    // DB 配置脱敏检查：只暴露是否存在、host 前缀、端口，不暴露密码
    const dbHost = process.env.DB_HOST;
    const dbDiag = {
      host_set: !!dbHost,
      host_hint: dbHost ? `${dbHost.slice(0, 10)}...` : '(not set)',
      port: process.env.DB_PORT ?? '(not set)',
      name: process.env.DB_NAME ?? '(not set)',
      user_set: !!process.env.DB_USER,
      pass_set: !!process.env.DB_PASS,
      jwt_set: !!process.env.JWT_SECRET,
      auth_test_mode: process.env.AUTH_TEST_MODE ?? '(not set)',
    };
    res.json({
      status: 'ok',
      service: 'minicare-api',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV ?? 'development',
      db: dbDiag,
    });
  });

  // ── 启动监听（CloudRun 会注入 PORT）──────────────────────────
  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`[minicare] Server running on port ${port}`);
}

bootstrap();
