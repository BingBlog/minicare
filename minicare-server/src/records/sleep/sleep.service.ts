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

@Injectable()
export class SleepService {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  /**
   * 开始计时（创建 status='ongoing' 的记录）
   * 一个宝宝同时只能有一条 ongoing 睡眠记录
   */
  async startSleep(userId: string, dto: StartSleepDto) {
    // 检查是否已有 ongoing 记录
    const [existing] = await this.db.execute<any[]>(
      "SELECT id FROM sleep_record WHERE baby_id = ? AND status = 'ongoing'",
      [dto.baby_id],
    );
    if (existing.length > 0) {
      throw new ConflictException('该宝宝已有进行中的睡眠记录，请先结束当前睡眠');
    }

    const id = uuidv4();
    await this.db.execute(
      `INSERT INTO sleep_record (id, baby_id, recorded_by, started_at, status, note)
       VALUES (?, ?, ?, ?, 'ongoing', ?)`,
      [id, dto.baby_id, userId, dto.started_at, dto.note ?? null],
    );
    return { id, status: 'ongoing' };
  }

  /**
   * 结束计时（更新 status='done'，计算 duration_min）
   */
  async endSleep(sleepId: string, dto: EndSleepDto) {
    const [rows] = await this.db.execute<any[]>(
      "SELECT id, started_at FROM sleep_record WHERE id = ? AND status = 'ongoing'",
      [sleepId],
    );
    if (rows.length === 0) {
      throw new NotFoundException('找不到进行中的睡眠记录');
    }

    const startedAt = new Date(rows[0].started_at);
    const endedAt = new Date(dto.ended_at);
    if (endedAt <= startedAt) {
      throw new BadRequestException('结束时间不能早于开始时间');
    }

    const durationMin = Math.round((endedAt.getTime() - startedAt.getTime()) / 60_000);

    await this.db.execute(
      `UPDATE sleep_record SET ended_at = ?, duration_min = ?, quality = ?, status = 'done', note = COALESCE(?, note)
       WHERE id = ?`,
      [dto.ended_at, durationMin, dto.quality ?? null, dto.note ?? null, sleepId],
    );

    return { id: sleepId, duration_min: durationMin, status: 'done' };
  }

  async findAll(babyId: string, limit = 20, offset = 0) {
    const [rows] = await this.db.execute<any[]>(
      `SELECT * FROM sleep_record WHERE baby_id = ? ORDER BY started_at DESC LIMIT ? OFFSET ?`,
      [babyId, limit, offset],
    );
    return rows;
  }

  /** 获取当前 ongoing 记录（用于前端显示计时器） */
  async getOngoing(babyId: string) {
    const [rows] = await this.db.execute<any[]>(
      "SELECT * FROM sleep_record WHERE baby_id = ? AND status = 'ongoing' LIMIT 1",
      [babyId],
    );
    return rows[0] ?? null;
  }
}
