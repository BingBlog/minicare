import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_POOL } from '../../common/database/database.module';
import { StartSleepDto, EndSleepDto } from './dto/create-sleep.dto';
import { toMysqlDatetime } from '../../common/utils/date.util';

/**
 * DDL: sleep_record.status TINYINT  1=ongoing  2=ended
 * 不存在 quality / sleep_period 字段
 */
const SLEEP_STATUS = { ONGOING: 1, ENDED: 2 } as const;

@Injectable()
export class SleepService {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  /**
   * 开始计时（创建 status=1 的记录）
   * 一个宝宝同时只能有一条 ongoing 睡眠记录
   */
  async startSleep(userId: string, dto: StartSleepDto) {
    // 检查是否已有 ongoing 记录
    const [existing] = await this.db.execute<any[]>(
      'SELECT id FROM sleep_record WHERE baby_id = ? AND status = ?',
      [dto.baby_id, SLEEP_STATUS.ONGOING],
    );
    if (existing.length > 0) {
      throw new ConflictException('该宝宝已有进行中的睡眠记录，请先结束当前睡眠');
    }

    const id = uuidv4();
    await this.db.execute(
      `INSERT INTO sleep_record (id, baby_id, recorded_by, start_time, status, note)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, dto.baby_id, userId, toMysqlDatetime(dto.start_time), SLEEP_STATUS.ONGOING, dto.note ?? null],
    );
    return { id, status: 'ongoing' };
  }

  /**
   * 结束计时（更新 status=2，计算 duration_min）
   */
  async endSleep(sleepId: string, dto: EndSleepDto) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT id, start_time FROM sleep_record WHERE id = ? AND status = ?',
      [sleepId, SLEEP_STATUS.ONGOING],
    );
    if (rows.length === 0) {
      throw new NotFoundException('找不到进行中的睡眠记录');
    }

    // mysql2 driver 已配置 timezone='+00:00'，DATETIME 字段直接以 UTC 返回 Date 对象
    const startTime = new Date(rows[0].start_time);
    const endTime   = new Date(dto.end_time);

    if (endTime <= startTime) {
      throw new BadRequestException('结束时间不能早于开始时间');
    }

    const durationMin = Math.round((endTime.getTime() - startTime.getTime()) / 60_000);

    await this.db.execute(
      `UPDATE sleep_record
       SET end_time = ?, duration_min = ?, status = ?,
           note = COALESCE(?, note)
       WHERE id = ?`,
      [toMysqlDatetime(dto.end_time), durationMin, SLEEP_STATUS.ENDED, dto.note ?? null, sleepId],
    );

    return { id: sleepId, duration_min: durationMin, status: 'ended' };
  }

  async findAll(babyId: string, limit = 20, offset = 0) {
    const [rows] = await this.db.execute<any[]>(
      `SELECT * FROM sleep_record WHERE baby_id = ? ORDER BY start_time DESC LIMIT ? OFFSET ?`,
      [babyId, limit, offset],
    );
    return rows.map((r) => ({
      ...r,
      status: r.status === SLEEP_STATUS.ONGOING ? 'ongoing' : 'ended',
    }));
  }

  /** 获取当前 ongoing 记录（用于前端显示计时器） */
  async getOngoing(babyId: string) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT * FROM sleep_record WHERE baby_id = ? AND status = ? LIMIT 1',
      [babyId, SLEEP_STATUS.ONGOING],
    );
    if (!rows[0]) return null;
    return { ...rows[0], status: 'ongoing' };
  }

  /** 删除睡眠记录（仅允许删除已结束的记录） */
  async remove(sleepId: string) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT id, status FROM sleep_record WHERE id = ?',
      [sleepId],
    );
    if (rows.length === 0) {
      throw new NotFoundException('找不到该睡眠记录');
    }
    if (rows[0].status === SLEEP_STATUS.ONGOING) {
      throw new BadRequestException('无法删除进行中的睡眠记录，请先结束');
    }

    await this.db.execute('DELETE FROM sleep_record WHERE id = ?', [sleepId]);
    return { id: sleepId, deleted: true };
  }
}