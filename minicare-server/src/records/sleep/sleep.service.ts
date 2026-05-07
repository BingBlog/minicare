import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_POOL } from '../../common/database/database.module';
import { StartSleepDto, EndSleepDto, UpdateSleepDto, CreateCompleteSleepDto } from './dto/create-sleep.dto';
import { toMysqlDatetime } from '../../common/utils/date.util';

/**
 * DDL: sleep_record.status VARCHAR(10)  ongoing=进行中  ended=已结束
 * （Migration 008: TINYINT 1=ongoing/2=ended → VARCHAR 'ongoing'/'ended'）
 */
const SLEEP_STATUS = { ONGOING: 'ongoing', ENDED: 'ended' } as const;

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
      'SELECT id FROM sleep_record WHERE baby_id = ? AND status = ?',
      [dto.baby_id, SLEEP_STATUS.ONGOING],
    );
    if (existing.length > 0) {
      throw new ConflictException('该宝宝已有进行中的睡眠记录，请先结束当前睡眠');
    }

    const id = uuidv4();
    await this.db.execute(
      `INSERT INTO sleep_record (id, baby_id, recorded_by, start_time, status, quality, sleep_period, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, dto.baby_id, userId,
        toMysqlDatetime(dto.start_time),
        SLEEP_STATUS.ONGOING,
        dto.quality      ?? null,
        dto.sleep_period ?? null,
        dto.note         ?? null,
      ],
    );
    return { id, status: 'ongoing' };
  }

  /**
   * 结束计时（更新 status='ended'，计算 duration_min）
   */
  async endSleep(sleepId: string, dto: EndSleepDto) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT id, start_time FROM sleep_record WHERE id = ? AND status = ?',
      [sleepId, SLEEP_STATUS.ONGOING],
    );
    if (rows.length === 0) {
      throw new NotFoundException('找不到进行中的睡眠记录');
    }

    const endTimeStr = toMysqlDatetime(dto.end_time);

    // 用 MySQL 的 TIMESTAMPDIFF 做差值，规避 Node.js 应用层时区解析歧义：
    // CloudRun 容器运行在 UTC+0，而前端传入的是不带 Z 的本地时间串（北京时间），
    // 若在 JS 层做 new Date() 相减会引入 8 小时偏差。
    // 改为先写入 end_time，再由 MySQL 原地计算 TIMESTAMPDIFF（字段均为 CST，无时区问题）。
    const [checkRows] = await this.db.execute<any[]>(
      `SELECT TIMESTAMPDIFF(MINUTE, start_time, ?) AS diff FROM sleep_record WHERE id = ?`,
      [endTimeStr, sleepId],
    );
    const durationMin = Number(checkRows[0]?.diff ?? 0);

    if (durationMin < 0) {
      throw new BadRequestException('结束时间不能早于开始时间');
    }
    // TIMESTAMPDIFF(MINUTE,...) 对不足 1 分钟的间隔返回 0，按 1 分钟存储
    const safeDurationMin = durationMin === 0 ? 1 : durationMin;

    await this.db.execute(
      `UPDATE sleep_record
       SET end_time = ?, duration_min = ?, status = ?,
           quality      = COALESCE(?, quality),
           sleep_period = COALESCE(?, sleep_period),
           note         = COALESCE(?, note)
       WHERE id = ?`,
      [
        endTimeStr, safeDurationMin, SLEEP_STATUS.ENDED,
        dto.quality      ?? null,
        dto.sleep_period ?? null,
        dto.note         ?? null,
        sleepId,
      ],
    );

    return { id: sleepId, duration_min: safeDurationMin, status: 'ended' };
  }

  /**
   * 补录已完成睡眠：直接插入 status=ended，不与「进行中」记录冲突
   */
  async createCompleteSleep(userId: string, dto: CreateCompleteSleepDto) {
    const startStr = toMysqlDatetime(dto.start_time);
    const endStr   = toMysqlDatetime(dto.end_time);

    // 用 MySQL TIMESTAMPDIFF 计算时长，规避 JS 层在 UTC+0 容器上解析北京时间串的偏差
    const [diffRows] = await this.db.execute<any[]>(
      `SELECT TIMESTAMPDIFF(MINUTE, ?, ?) AS diff`,
      [startStr, endStr],
    );
    const durationMin = Number(diffRows[0]?.diff ?? 0);

    if (durationMin < 0) {
      throw new BadRequestException('结束时间不能早于开始时间');
    }
    // TIMESTAMPDIFF(MINUTE,...) 对不足 1 分钟的间隔返回 0，按 1 分钟存储
    const safeDurationMin = durationMin === 0 ? 1 : durationMin;

    const id = uuidv4();
    await this.db.execute(
      `INSERT INTO sleep_record (id, baby_id, recorded_by, start_time, end_time, status, duration_min, quality, sleep_period, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        dto.baby_id,
        userId,
        startStr,
        endStr,
        SLEEP_STATUS.ENDED,
        safeDurationMin,
        dto.quality ?? null,
        dto.sleep_period ?? null,
        dto.note ?? null,
      ],
    );
    return { id, duration_min: safeDurationMin, status: 'ended' as const };
  }

  /**
   * 日期分页查询睡眠记录
   * - 每次返回固定 3 天（北京时间）的完整数据
   * - before_date: 北京日期 YYYY-MM-DD，查询 [before_date - 3天, before_date) 范围
   * - 初次不传 before_date，默认从明天开始（包含今天的数据）
   * - 如果查询范围内无数据，用 COUNT 检查更早是否还有记录
   *
   * @returns { items, nextBeforeDate } — nextBeforeDate 为 null 表示没有更多数据
   */
  async findAll(babyId: string, beforeDate?: string) {
    const endDate = beforeDate || this.addDays(this.getTodayBeijing(), 1);
    const startDate = this.addDays(endDate, -7);

    const startDatetime = `${startDate} 00:00:00`;
    const endDatetime = `${endDate} 00:00:00`;

    const [rows] = await this.db.query<any[]>(
      `SELECT * FROM sleep_record WHERE baby_id = ? AND start_time >= ? AND start_time < ? ORDER BY start_time DESC`,
      [babyId, startDatetime, endDatetime],
    );

    const items = rows.map((r) => ({
      ...r,
      status: r.status === SLEEP_STATUS.ONGOING ? 'ongoing' : 'ended',
    }));

    // 判断是否还有更多数据
    let hasMore = false;
    if (items.length > 0) {
      hasMore = true;
    } else {
      // 当前窗口无数据，检查更早是否还有记录
      const [countResult] = await this.db.query<any[]>(
        `SELECT COUNT(*) AS total FROM sleep_record WHERE baby_id = ? AND start_time < ?`,
        [babyId, startDatetime],
      );
      hasMore = countResult[0]?.total > 0;
    }

    const nextBeforeDate = hasMore ? startDate : null;
    return { items, nextBeforeDate };
  }

  private getTodayBeijing(): string {
    const now = new Date();
    const bj = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const y = bj.getUTCFullYear();
    const m = String(bj.getUTCMonth() + 1).padStart(2, '0');
    const d = String(bj.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private addDays(dateStr: string, days: number): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    date.setUTCDate(date.getUTCDate() + days);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
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

  async findOne(id: string) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT * FROM sleep_record WHERE id = ?',
      [id],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return { ...r, status: r.status === SLEEP_STATUS.ONGOING ? 'ongoing' : 'ended' };
  }

  /** 更新已结束的睡眠记录 */
  async update(sleepId: string, dto: UpdateSleepDto) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT id, start_time, end_time, status FROM sleep_record WHERE id = ?',
      [sleepId],
    );
    if (rows.length === 0) throw new NotFoundException('找不到该睡眠记录');

    const setClauses: string[] = [];
    const values: any[] = [];

    if (dto.start_time   !== undefined) { setClauses.push('start_time = ?');   values.push(toMysqlDatetime(dto.start_time)); }
    if (dto.end_time     !== undefined) { setClauses.push('end_time = ?');     values.push(toMysqlDatetime(dto.end_time)); }
    if (dto.quality      !== undefined) { setClauses.push('quality = ?');      values.push(dto.quality); }
    if (dto.sleep_period !== undefined) { setClauses.push('sleep_period = ?'); values.push(dto.sleep_period); }
    if (dto.note         !== undefined) { setClauses.push('note = ?');         values.push(dto.note); }

    // 重新计算 duration_min（如果 start_time 或 end_time 有更新）
    // 用 MySQL TIMESTAMPDIFF 计算，规避 Node.js 应用层在 UTC+0 容器上解析北京时间串的偏差
    const hasTimeChange = dto.start_time !== undefined || dto.end_time !== undefined;
    const existingEndTime = rows[0].end_time; // DB 中已有 end_time（CST DATETIME 字符串）
    const newStartStr = dto.start_time ? toMysqlDatetime(dto.start_time) : null;
    const newEndStr   = dto.end_time   ? toMysqlDatetime(dto.end_time)   : null;

    if (hasTimeChange && (newEndStr || existingEndTime)) {
      // 确定用于计算的实际 start/end 字符串（均为 CST 本地时间）
      const calcStartStr = newStartStr ?? null;   // null → SQL 用字段当前值
      const calcEndStr   = newEndStr   ?? null;

      // 构造 TIMESTAMPDIFF 查询（对新值或现有字段值做差）
      const startExpr = calcStartStr ? '?' : 'start_time';
      const endExpr   = calcEndStr   ? '?' : 'end_time';
      const diffParams: any[] = [];
      if (calcStartStr) diffParams.push(calcStartStr);
      if (calcEndStr)   diffParams.push(calcEndStr);
      diffParams.push(sleepId);

      const [diffRows] = await this.db.execute<any[]>(
        `SELECT TIMESTAMPDIFF(MINUTE, ${startExpr}, ${endExpr}) AS diff FROM sleep_record WHERE id = ?`,
        diffParams,
      );
      const durationMin = Number(diffRows[0]?.diff ?? 0);
      if (durationMin < 0) {
        throw new UnprocessableEntityException(
          '结束时间不能早于开始时间，若为夜间跨午夜睡眠，请确保结束时间日期为次日',
        );
      }
      // TIMESTAMPDIFF(MINUTE,...) 对不足 1 分钟的间隔返回 0，按 1 分钟存储
      const safeDurationMin = durationMin === 0 ? 1 : durationMin;
      setClauses.push('duration_min = ?');
      values.push(safeDurationMin);
    }

    if (setClauses.length === 0) {
      const [r] = await this.db.execute<any[]>('SELECT * FROM sleep_record WHERE id = ?', [sleepId]);
      return { ...r[0], status: r[0].status === SLEEP_STATUS.ONGOING ? 'ongoing' : 'ended' };
    }

    values.push(sleepId);
    await this.db.execute(
      `UPDATE sleep_record SET ${setClauses.join(', ')} WHERE id = ?`,
      values,
    );

    const [updated] = await this.db.execute<any[]>('SELECT * FROM sleep_record WHERE id = ?', [sleepId]);
    const r = updated[0];
    return { ...r, status: r.status === SLEEP_STATUS.ONGOING ? 'ongoing' : 'ended' };
  }

  /** 删除睡眠记录（ongoing / ended 均可删除；ongoing 用于「取消计时」场景） */
  async remove(sleepId: string) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT id, status FROM sleep_record WHERE id = ?',
      [sleepId],
    );
    if (rows.length === 0) {
      throw new NotFoundException('找不到该睡眠记录');
    }

    await this.db.execute('DELETE FROM sleep_record WHERE id = ?', [sleepId]);
    return { id: sleepId, deleted: true };
  }
}