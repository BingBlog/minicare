import { Global, Logger, Module } from '@nestjs/common';
import { createPool, Pool } from 'mysql2/promise';

export const DATABASE_POOL = 'DATABASE_POOL';

/**
 * MySQL 连接池 — 全局单例（@Global）
 *
 * 连接参数通过环境变量注入，不硬编码。
 * CloudBase MySQL（CynosDB Serverless）有自动启停机制，
 * 首次连接前可能有 5~10s 冷启动延迟（体验版限制）。
 */
@Global()
@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      useFactory: (): Pool => {
        const logger = new Logger('DatabaseModule');

        const pool = createPool({
          host: process.env.DB_HOST ?? 'localhost',
          port: Number(process.env.DB_PORT ?? 3306),
          database: process.env.DB_NAME ?? 'minicare',
          user: process.env.DB_USER ?? 'root',
          password: process.env.DB_PASS ?? '',
          charset: 'utf8mb4',
          timezone: '+00:00',    // 强制 UTC：与 toMysqlDatetime() 写入的 UTC 数值保持一致
          waitForConnections: true,
          connectionLimit: 10,        // CloudRun 单实例建议 ≤ 10
          queueLimit: 0,
          connectTimeout: 30_000,     // Serverless 冷启动预留 30s
          enableKeepAlive: true,
          keepAliveInitialDelay: 10_000,
        });

        // 仅在已配置 DB_HOST 时才预热（本地开发未配置时跳过）
        if (process.env.DB_HOST) {
          pool.getConnection()
            .then((conn) => {
              logger.log('MySQL 连接池初始化成功');
              conn.release();
            })
            .catch((err: Error) => {
              logger.warn(`MySQL 连接池预热失败（Serverless 冷启动中）: ${err.message}`);
            });
        } else {
          logger.debug('DB_HOST 未配置，跳过连接预热（本地开发模式）');
        }

        return pool;
      },
    },
  ],
  exports: [DATABASE_POOL],
})
export class DatabaseModule {}