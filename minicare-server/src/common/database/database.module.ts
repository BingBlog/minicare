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

        // 本地开发（非 production）连接超时缩短为 5s，
        // 避免 nest --watch 每次文件保存重启时等待 30s 冷启动
        const isProd = process.env.NODE_ENV === 'production';
        const connectTimeout = isProd ? 30_000 : 5_000;

        const pool = createPool({
          host: process.env.DB_HOST ?? 'localhost',
          port: Number(process.env.DB_PORT ?? 3306),
          database: process.env.DB_NAME ?? 'minicare',
          user: process.env.DB_USER ?? 'root',
          password: process.env.DB_PASS ?? '',
          charset: 'utf8mb4',
          timezone: '+08:00',    // 北京时间（CST）：全链路统一使用本地时间，无需时区转换
          waitForConnections: true,
          connectionLimit: 10,        // CloudRun 单实例建议 ≤ 10
          queueLimit: 0,
          connectTimeout,             // 生产 30s（Serverless 冷启动），本地 5s
          // CynosDB Serverless 服务端会在约 10 分钟空闲后断开连接，
          // idleTimeout 让连接池在空闲连接被服务端关闭前主动销毁，避免 ETIMEDOUT
          idleTimeout: 300_000,       // 5 分钟无请求则销毁连接（< 服务端 ~10 分钟阈值）
          maxIdle: 2,                 // 保留的空闲连接数，减少不必要的长连接
          enableKeepAlive: true,
          keepAliveInitialDelay: 60_000,  // 1 分钟后开始发 TCP keepalive
        });

        // 仅在已配置 DB_HOST 时才预热（本地开发未配置时跳过）
        if (process.env.DB_HOST) {
          // pid 用于诊断：若每次请求都打印此行，说明进程在频繁重启（nest --watch 触发）
          logger.log(`MySQL 连接池创建中（pid=${process.pid}，timeout=${connectTimeout}ms）`);
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