import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Pool } from 'mysql2/promise';
import { DATABASE_POOL } from '../common/database/database.module';

/**
 * TasksService — 定时任务
 *
 * 任务列表：
 * 1. 睡眠超时检查（每 10 分钟）：ongoing 睡眠超过 16h 自动关闭，防止忘记结束计时
 * 2. DB 保活 ping（每 8 分钟）：Serverless MySQL 10 分钟无连接自动暂停，主动 ping 防止冷启动（R-2 风险缓解）
 *
 * TODO: 辅食新食物观察期提醒（food_observation 表状态检查）
 */
@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  /**
   * 每 8 分钟执行一次 SELECT 1，防止 MySQL Serverless 自动暂停
   * 对应 INFRA R-2 风险（自动启停）的缓解措施
   */
  @Cron('0 */8 * * * *')
  async keepDatabaseAlive() {
    try {
      await this.db.execute('SELECT 1');
      this.logger.debug('DB keepalive ping 成功');
    } catch (err: any) {
      this.logger.warn('DB keepalive ping 失败:', err.message);
    }
  }

  /**
   * 每 10 分钟检查超时睡眠记录（ongoing 超过 16 小时）
   * 自动标记为 done，防止用户忘记结束计时导致数据异常
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async checkSleepTimeout() {
    try {
      const [result] = await this.db.execute(
        `UPDATE sleep_record
         SET status = 'timeout', ended_at = DATE_ADD(started_at, INTERVAL 16 HOUR),
             duration_min = 960, note = CONCAT(IFNULL(note, ''), ' [系统自动关闭: 超过16小时]')
         WHERE status = 'ongoing'
           AND started_at < DATE_SUB(NOW(), INTERVAL 16 HOUR)`,
      );
      const affected = (result as any).affectedRows;
      if (affected > 0) {
        this.logger.warn(`睡眠超时检查：自动关闭 ${affected} 条超时记录`);
      }
    } catch (err: any) {
      this.logger.error('睡眠超时检查失败:', err.message);
    }
  }
}
