import { Global, Module } from '@nestjs/common';
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
        const pool = createPool({
          host: process.env.DB_HOST,
          port: Number(process.env.DB_PORT ?? 3306),
          database: process.env.DB_NAME,
          user: process.env.DB_USER,
          password: process.env.DB_PASS,
          charset: 'utf8mb4',
          timezone: '+08:00',
          waitForConnections: true,
          connectionLimit: 10,        // CloudRun 单实例建议 ≤ 10
          queueLimit: 0,
          connectTimeout: 30_000,     // Serverless 冷启动预留 30s
          enableKeepAlive: true,
          keepAliveInitialDelay: 10_000,
        });

        // 启动时预热一个连接，减少第一次请求的延迟
        pool.getConnection()
          .then((conn) => {
            console.log('[Database] MySQL 连接池初始化成功');
            conn.release();
          })
          .catch((err) => {
            console.warn('[Database] MySQL 连接池预热失败（Serverless 冷启动中）:', err.message);
          });

        return pool;
      },
    },
  ],
  exports: [DATABASE_POOL],
})
export class DatabaseModule {}
