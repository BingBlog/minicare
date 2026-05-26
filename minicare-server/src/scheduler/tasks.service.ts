import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Pool } from 'mysql2/promise';
import { DATABASE_POOL } from '../common/database/database.module';
import { SleepService } from '../records/sleep/sleep.service';
import { SleepQuality } from '../records/sleep/dto/create-sleep.dto';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly db: Pool,
    private readonly sleepService: SleepService,
  ) {}

  @Cron('0 */8 * * * *')
  async keepDatabaseAlive() {
    let conn: import('mysql2/promise').PoolConnection | null = null;
    try {
      conn = await this.db.getConnection();
      await conn.execute('SELECT 1');
      this.logger.debug('DB keepalive ping 成功');
    } catch (err: any) {
      this.logger.warn(`DB keepalive ping 失败: ${err.message}`);
    } finally {
      conn?.release();
    }
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async checkSleepTimeout() {
    try {
      const [rows] = await this.db.execute<any[]>(
        `SELECT id FROM sleep_record
         WHERE status = 'ongoing' AND start_time < DATE_SUB(NOW(), INTERVAL 16 HOUR)`,
      );

      if (rows.length === 0) return;

      for (const row of rows) {
        try {
          const endTime = new Date();
          const endTimeStr = `${endTime.getFullYear()}-${String(endTime.getMonth() + 1).padStart(2, '0')}-${String(endTime.getDate()).padStart(2, '0')}T${String(endTime.getHours()).padStart(2, '0')}:${String(endTime.getMinutes()).padStart(2, '0')}:${String(endTime.getSeconds()).padStart(2, '0')}`;

          await this.sleepService.endSleep(row.id, {
            end_time: endTimeStr,
            quality: SleepQuality.POOR,
            note: '[系统自动关闭: 超过16小时]',
          });
          this.logger.warn(`睡眠超时检查：自动关闭记录 ${row.id}`);
        } catch (err: any) {
          this.logger.error(`自动关闭睡眠记录 ${row.id} 失败: ${err.message}`);
        }
      }
    } catch (err: any) {
      this.logger.error('睡眠超时检查失败:', err.message);
    }
  }
}
