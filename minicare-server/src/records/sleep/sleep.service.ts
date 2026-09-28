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
import { toMysqlDatetime, toMysqlDate, getBeijingToday, addDays } from '../../common/utils/date.util';
import { TimelineService } from '../timeline/timeline.service';

const SLEEP_STATUS = { ONGOING: 'ongoing', ENDED: 'ended' } as const;

interface SleepSegment {
  startMysql: string;
  endMysql: string;
  durationMin: number;
}

function inferSleepPeriodFromHour(hour: number): string {
  if (hour >= 22 || hour < 6) return 'night';
  if (hour < 12) return 'morning_nap';
  if (hour < 18) return 'afternoon_nap';
  return 'other';
}

function parseMysqlDatetime(mysqlStr: string): Date | null {
  const m = mysqlStr.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  return new Date(
    Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    Number(m[4]), Number(m[5]), Number(m[6]),
  );
}

@Injectable()
export class SleepService {
  constructor(
    @Inject(DATABASE_POOL) private readonly db: Pool,
    private readonly timelineService: TimelineService,
  ) {}

  async startSleep(userId: string, dto: StartSleepDto) {
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
    await this.timelineService.upsertFromSource('sleep', id);
    return { id, status: 'ongoing' };
  }

  async endSleep(sleepId: string, dto: EndSleepDto) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT id, baby_id, recorded_by, start_time, quality, sleep_period, note FROM sleep_record WHERE id = ? AND status = ?',
      [sleepId, SLEEP_STATUS.ONGOING],
    );
    if (rows.length === 0) {
      throw new NotFoundException('找不到进行中的睡眠记录');
    }

    const existing = rows[0];
    const startMysql = toMysqlDatetime(existing.start_time);
    const endMysql = toMysqlDatetime(dto.end_time);

    const segments = this.computeSegments(startMysql, endMysql);
    if (segments.length === 0) {
      throw new BadRequestException('结束时间不能早于开始时间');
    }

    const quality = dto.quality ?? existing.quality ?? null;
    const sleepPeriod = dto.sleep_period ?? existing.sleep_period ?? null;
    const note = dto.note ?? existing.note ?? null;

    if (segments.length === 1) {
      await this.db.execute(
        `UPDATE sleep_record
         SET end_time = ?, duration_min = ?, status = ?,
             quality = COALESCE(?, quality),
             sleep_period = COALESCE(?, sleep_period),
             note = COALESCE(?, note)
         WHERE id = ?`,
        [
          segments[0].endMysql, segments[0].durationMin, SLEEP_STATUS.ENDED,
          quality, sleepPeriod, note,
          sleepId,
        ],
      );
      await this.timelineService.upsertFromSource('sleep', sleepId);
      return { id: sleepId, duration_min: segments[0].durationMin, status: 'ended' };
    }

    await this.db.execute('DELETE FROM sleep_record WHERE id = ?', [sleepId]);
    await this.timelineService.removeBySource('sleep', sleepId);

    const insertedIds = await this.insertSegments(
      existing.baby_id, existing.recorded_by, segments,
      quality, sleepPeriod, note,
    );

    return {
      id: insertedIds[0],
      duration_min: segments.reduce((s, seg) => s + seg.durationMin, 0),
      status: 'ended',
      split: true,
      records: insertedIds.map((id, i) => ({
        id,
        start_time: segments[i].startMysql,
        end_time: segments[i].endMysql,
        duration_min: segments[i].durationMin,
      })),
    };
  }

  async createCompleteSleep(userId: string, dto: CreateCompleteSleepDto) {
    const startStr = toMysqlDatetime(dto.start_time);
    const endStr   = toMysqlDatetime(dto.end_time);

    const segments = this.computeSegments(startStr, endStr);
    if (segments.length === 0) {
      throw new BadRequestException('结束时间不能早于开始时间');
    }

    if (segments.length === 1) {
      const id = uuidv4();
      await this.db.execute(
        `INSERT INTO sleep_record (id, baby_id, recorded_by, start_time, end_time, status, duration_min, quality, sleep_period, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, dto.baby_id, userId,
          segments[0].startMysql, segments[0].endMysql,
          SLEEP_STATUS.ENDED, segments[0].durationMin,
          dto.quality ?? null, dto.sleep_period ?? null, dto.note ?? null,
        ],
      );
      await this.timelineService.upsertFromSource('sleep', id);
      return { id, duration_min: segments[0].durationMin, status: 'ended' as const };
    }

    const insertedIds = await this.insertSegments(
      dto.baby_id, userId, segments,
      dto.quality ?? null, dto.sleep_period ?? null, dto.note ?? null,
    );

    return {
      id: insertedIds[0],
      duration_min: segments.reduce((s, seg) => s + seg.durationMin, 0),
      status: 'ended' as const,
      split: true,
      records: insertedIds.map((id, i) => ({
        id,
        start_time: segments[i].startMysql,
        end_time: segments[i].endMysql,
        duration_min: segments[i].durationMin,
      })),
    };
  }

  async findAll(babyId: string, beforeDate?: string) {
    const endDate = beforeDate || addDays(getBeijingToday(), 1);
    const startDate = addDays(endDate, -7);

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

    let hasMore = false;
    if (items.length > 0) {
      hasMore = true;
    } else {
      const [countResult] = await this.db.query<any[]>(
        `SELECT COUNT(*) AS total FROM sleep_record WHERE baby_id = ? AND start_time < ?`,
        [babyId, startDatetime],
      );
      hasMore = countResult[0]?.total > 0;
    }

    const nextBeforeDate = hasMore ? startDate : null;
    return { items, nextBeforeDate };
  }

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

  async update(sleepId: string, dto: UpdateSleepDto) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT id, baby_id, recorded_by, start_time, end_time, status, quality, sleep_period, note FROM sleep_record WHERE id = ?',
      [sleepId],
    );
    if (rows.length === 0) throw new NotFoundException('找不到该睡眠记录');

    const existing = rows[0];
    if (existing.status === SLEEP_STATUS.ONGOING) {
      return this.updateOngoing(sleepId, existing, dto);
    }

    const newStartMysql = dto.start_time ? toMysqlDatetime(dto.start_time) : toMysqlDatetime(existing.start_time);
    const newEndMysql   = dto.end_time   ? toMysqlDatetime(dto.end_time)   : toMysqlDatetime(existing.end_time);

    if (!newEndMysql) {
      throw new UnprocessableEntityException('已结束的睡眠记录必须保留结束时间');
    }

    const segments = this.computeSegments(newStartMysql, newEndMysql);
    if (segments.length === 0) {
      throw new UnprocessableEntityException('结束时间不能早于开始时间');
    }

    const quality      = dto.quality      ?? existing.quality      ?? null;
    const sleepPeriod  = dto.sleep_period ?? existing.sleep_period ?? null;
    const note         = dto.note         ?? existing.note         ?? null;

    if (segments.length === 1) {
      const setClauses: string[] = [];
      const values: any[] = [];

      if (dto.start_time   !== undefined) { setClauses.push('start_time = ?');   values.push(newStartMysql); }
      if (dto.end_time     !== undefined) { setClauses.push('end_time = ?');     values.push(newEndMysql); }
      if (dto.quality      !== undefined) { setClauses.push('quality = ?');      values.push(quality); }
      if (dto.sleep_period !== undefined) { setClauses.push('sleep_period = ?'); values.push(sleepPeriod); }
      if (dto.note         !== undefined) { setClauses.push('note = ?');         values.push(note); }

      setClauses.push('duration_min = ?');
      values.push(segments[0].durationMin);

      if (setClauses.length === 0) {
        const [r] = await this.db.execute<any[]>('SELECT * FROM sleep_record WHERE id = ?', [sleepId]);
        return { ...r[0], status: r[0].status === SLEEP_STATUS.ONGOING ? 'ongoing' : 'ended' };
      }

      values.push(sleepId);
      await this.db.execute(
        `UPDATE sleep_record SET ${setClauses.join(', ')} WHERE id = ?`,
        values,
      );
      await this.timelineService.upsertFromSource('sleep', sleepId);

      const [updated] = await this.db.execute<any[]>('SELECT * FROM sleep_record WHERE id = ?', [sleepId]);
      const r = updated[0];
      return { ...r, status: r.status === SLEEP_STATUS.ONGOING ? 'ongoing' : 'ended' };
    }

    await this.db.execute('DELETE FROM sleep_record WHERE id = ?', [sleepId]);
    await this.timelineService.removeBySource('sleep', sleepId);

    await this.deleteOverlappingRecords(existing.baby_id, newStartMysql, newEndMysql, sleepId);

    const insertedIds = await this.insertSegments(
      existing.baby_id, existing.recorded_by, segments,
      quality, sleepPeriod, note,
    );

    const [newRecords] = await this.db.execute<any[]>(
      `SELECT * FROM sleep_record WHERE id IN (${insertedIds.map(() => '?').join(',')})`,
      insertedIds,
    );

    return {
      ...newRecords[0],
      status: 'ended',
      split: true,
      records: newRecords.map((r: any) => ({
        id: r.id,
        start_time: r.start_time,
        end_time: r.end_time,
        duration_min: r.duration_min,
      })),
    };
  }

  private async updateOngoing(sleepId: string, existing: any, dto: UpdateSleepDto) {
    const setClauses: string[] = [];
    const values: any[] = [];

    if (dto.start_time   !== undefined) { setClauses.push('start_time = ?');   values.push(toMysqlDatetime(dto.start_time)); }
    if (dto.quality      !== undefined) { setClauses.push('quality = ?');      values.push(dto.quality); }
    if (dto.sleep_period !== undefined) { setClauses.push('sleep_period = ?'); values.push(dto.sleep_period); }
    if (dto.note         !== undefined) { setClauses.push('note = ?');         values.push(dto.note); }

    if (setClauses.length === 0) {
      const [r] = await this.db.execute<any[]>('SELECT * FROM sleep_record WHERE id = ?', [sleepId]);
      return { ...r[0], status: 'ongoing' };
    }

    values.push(sleepId);
    await this.db.execute(
      `UPDATE sleep_record SET ${setClauses.join(', ')} WHERE id = ?`,
      values,
    );
    await this.timelineService.upsertFromSource('sleep', sleepId);

    const [updated] = await this.db.execute<any[]>('SELECT * FROM sleep_record WHERE id = ?', [sleepId]);
    return { ...updated[0], status: 'ongoing' };
  }

  async remove(sleepId: string) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT id, status FROM sleep_record WHERE id = ?',
      [sleepId],
    );
    if (rows.length === 0) {
      throw new NotFoundException('找不到该睡眠记录');
    }

    await this.db.execute('DELETE FROM sleep_record WHERE id = ?', [sleepId]);
    await this.timelineService.removeBySource('sleep', sleepId);
    return { id: sleepId, deleted: true };
  }

  private computeSegments(startMysql: string, endMysql: string): SleepSegment[] {
    const start = parseMysqlDatetime(startMysql);
    const end   = parseMysqlDatetime(endMysql);
    if (!start || !end) return [];

    const startMs = start.getTime();
    const endMs   = end.getTime();
    if (endMs <= startMs) return [];

    const startDate = toMysqlDate(startMysql);
    const endDate   = toMysqlDate(endMysql);

    if (startDate === endDate) {
      const totalMin = Math.round((endMs - startMs) / 60000);
      return [{ startMysql, endMysql, durationMin: totalMin === 0 ? 1 : totalMin }];
    }

    const segments: SleepSegment[] = [];

    const nextDayOfStart = addDays(startDate, 1);
    const nextDayStart = new Date(`${nextDayOfStart}T00:00:00`);
    const firstMin = Math.round((nextDayStart.getTime() - startMs) / 60000);
    if (firstMin > 0) {
      segments.push({
        startMysql,
        endMysql: `${nextDayOfStart} 00:00:00`,
        durationMin: firstMin,
      });
    }

    let current = nextDayOfStart;
    while (current < endDate) {
      const nextDay = addDays(current, 1);
      if (nextDay < endDate) {
        segments.push({
          startMysql: `${current} 00:00:00`,
          endMysql: `${nextDay} 00:00:00`,
          durationMin: 1440,
        });
      }
      current = nextDay;
    }

    const endDayStart = new Date(`${endDate}T00:00:00`);
    const lastMin = Math.round((endMs - endDayStart.getTime()) / 60000);
    if (lastMin > 0) {
      segments.push({
        startMysql: `${endDate} 00:00:00`,
        endMysql,
        durationMin: lastMin,
      });
    }

    if (segments.length === 0) {
      const totalMin = Math.round((endMs - startMs) / 60000);
      segments.push({ startMysql, endMysql, durationMin: totalMin === 0 ? 1 : totalMin });
    }

    return segments;
  }

  private async insertSegments(
    babyId: string,
    recordedBy: string,
    segments: SleepSegment[],
    quality: string | null,
    sleepPeriod: string | null,
    note: string | null,
  ): Promise<string[]> {
    const ids: string[] = [];

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const id = uuidv4();
      ids.push(id);

      const segPeriod = i === 0
        ? (sleepPeriod ?? inferSleepPeriodFromHour(parseInt(seg.startMysql.substring(11, 13), 10)))
        : inferSleepPeriodFromHour(parseInt(seg.startMysql.substring(11, 13), 10));

      const segNote = i === 0 ? note : null;

      await this.db.execute(
        `INSERT INTO sleep_record (id, baby_id, recorded_by, start_time, end_time, status, duration_min, quality, sleep_period, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, babyId, recordedBy,
          seg.startMysql, seg.endMysql,
          SLEEP_STATUS.ENDED, seg.durationMin,
          quality, segPeriod, segNote,
        ],
      );
      await this.timelineService.upsertFromSource('sleep', id);
    }

    return ids;
  }

  private async deleteOverlappingRecords(babyId: string, rangeStart: string, rangeEnd: string, excludeId: string) {
    const [overlapping] = await this.db.execute<any[]>(
      `SELECT id FROM sleep_record
       WHERE baby_id = ? AND id != ? AND status = 'ended'
         AND start_time < ? AND end_time > ?`,
      [babyId, excludeId, rangeEnd, rangeStart],
    );

    for (const row of overlapping) {
      await this.db.execute('DELETE FROM sleep_record WHERE id = ?', [row.id]);
      await this.timelineService.removeBySource('sleep', row.id);
    }
  }
}
