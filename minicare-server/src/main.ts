import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // ── 全局校验管道（class-validator + class-transformer）──────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,         // 过滤 DTO 未定义的字段
      forbidNonWhitelisted: true,
      transform: true,         // 自动类型转换（string → number 等）
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── CORS（允许 Web H5 本地开发和线上域名）──────────────────────
  app.enableCors({
    origin: [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      /\.tcloudbaseapp\.com$/,
      /\.app\.tcloudbase\.com$/,
    ],
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

  // ── 启动监听（CloudRun 会注入 PORT）──────────────────────────
  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`[minicare] Server running on port ${port}`);
}

bootstrap();
