import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool, PoolConnection } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_POOL } from '../../common/database/database.module';
import { getBeijingToday, toMysqlDatetime } from '../../common/utils/date.util';
import { TimelineService } from '../timeline/timeline.service';
import {
  CreateFoodObservationDto,
  CreateFoodObservationReactionDto,
  ObservationLogAction,
  ObservationStatus,
  ReactionLevel,
  UnlinkObservationHealthDto,
  UpdateFoodObservationStatusDto,
  UpsertFoodObservationLogDto,
} from './dto/food-observation.dto';

interface FoodObservationRow {
  id: string;
  baby_id: string;
  food_name: string;
  first_intro_at: string;
  last_intro_at: string | null;
  intro_count: number;
  observation_days: number;
  status: ObservationStatus;
  reaction_note: string | null;
  current_day: number | null;
  retry_after_date: string | null;
  severity: ReactionLevel | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class FoodObservationService {
  constructor(
    @Inject(DATABASE_POOL) private readonly db: Pool,
    private readonly timelineService: TimelineService,
  ) {}

  private normalizeFoodName(foodName: string): string {
    return foodName.trim().replace(/\s+/g, ' ');
  }

  private toDateOnly(date?: string): string {
    return date ? date.slice(0, 10) : getBeijingToday();
  }

  private mapObservation(row: FoodObservationRow) {
    return {
      ...row,
      intro_count: Number(row.intro_count ?? 0),
      observation_days: Number(row.observation_days ?? 3),
      current_day: row.current_day == null ? null : Number(row.current_day),
    };
  }

  private parseJsonArray(value: unknown): string[] {
    if (value == null) return [];
    if (Array.isArray(value)) return value.map((item) => String(item));
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  async createOrReuse(dto: CreateFoodObservationDto) {
    const foodName = this.normalizeFoodName(dto.food_name);
    if (!foodName) throw new BadRequestException('food_name 不能为空');
    const observationDays = dto.observation_days ?? 3;
    const introDate = this.toDateOnly(dto.first_intro_at);

    const [rows] = await this.db.query(
      `SELECT id, baby_id, food_name, first_intro_at, last_intro_at, intro_count,
              observation_days, status, reaction_note, current_day, retry_after_date,
              severity, created_at, updated_at
       FROM food_observation
       WHERE baby_id = ? AND food_name = ?
       LIMIT 1`,
      [dto.baby_id, foodName],
    );

    const existing = (rows as FoodObservationRow[])[0];
    if (!existing) {
      const id = uuidv4();
      await this.db.execute(
        `INSERT INTO food_observation
           (id, baby_id, food_name, first_intro_at, last_intro_at, intro_count,
            observation_days, status, current_day, last_status_changed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          id,
          dto.baby_id,
          foodName,
          introDate,
          introDate,
          1,
          observationDays,
          ObservationStatus.OBSERVING,
          1,
        ],
      );
      return {
        id,
        status: ObservationStatus.OBSERVING,
        current_day: 1,
        observation_days: observationDays,
        reused: false,
        action: 'auto_created',
      };
    }

    if (existing.status === ObservationStatus.OBSERVING) {
      await this.db.execute(
        `UPDATE food_observation
         SET last_intro_at = ?,
             intro_count = intro_count + 1,
             updated_at = NOW()
         WHERE id = ?`,
        [introDate, existing.id],
      );
      return {
        id: existing.id,
        status: existing.status,
        current_day: Number(existing.current_day ?? 1),
        observation_days: Number(existing.observation_days ?? observationDays),
        reused: true,
        action: 'reused_active',
      };
    }

    return {
      id: existing.id,
      status: existing.status,
      current_day: Number(existing.current_day ?? existing.observation_days ?? observationDays),
      observation_days: Number(existing.observation_days ?? observationDays),
      reused: true,
      action: `existing_${existing.status}`,
    };
  }

  async list(babyId: string, status?: ObservationStatus) {
    const params: (string | number)[] = [babyId];
    let sql = `SELECT id, baby_id, food_name, first_intro_at, last_intro_at, intro_count,
                      observation_days, status, reaction_note, current_day, retry_after_date,
                      severity, created_at, updated_at
               FROM food_observation
               WHERE baby_id = ?`;
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    sql += ' ORDER BY updated_at DESC';
    const [rows] = await this.db.query(sql, params);
    return (rows as FoodObservationRow[]).map((r) => this.mapObservation(r));
  }

  async findOne(id: string) {
    const [rows] = await this.db.query(
      `SELECT id, baby_id, food_name, first_intro_at, last_intro_at, intro_count,
              observation_days, status, reaction_note, current_day, retry_after_date,
              severity, created_at, updated_at
       FROM food_observation
       WHERE id = ?
       LIMIT 1`,
      [id],
    );
    const observation = (rows as FoodObservationRow[])[0];
    if (!observation) throw new NotFoundException('找不到排敏任务');

    const [logs] = await this.db.query<any[]>(
      `SELECT id, observation_id, baby_id, day_index, record_date, intake_amount_g,
              reaction_flags, reaction_level, note, action, health_record_id,
              recorded_by, created_at, updated_at
       FROM food_observation_log
       WHERE observation_id = ?
       ORDER BY day_index ASC`,
      [id],
    );
    return {
      ...this.mapObservation(observation),
      logs: logs.map((l) => ({
        ...l,
        day_index: Number(l.day_index),
        intake_amount_g: l.intake_amount_g == null ? null : Number(l.intake_amount_g),
        reaction_flags: this.parseJsonArray(l.reaction_flags),
      })),
    };
  }

  async updateStatus(id: string, dto: UpdateFoodObservationStatusDto) {
    const [rows] = await this.db.query(
      `SELECT id, status FROM food_observation WHERE id = ? LIMIT 1`,
      [id],
    );
    if (!(rows as FoodObservationRow[])[0]) throw new NotFoundException('找不到排敏任务');

    const setClauses: string[] = ['status = ?'];
    const params: any[] = [dto.status];
    setClauses.push('last_status_changed_at = NOW()');
    if (dto.reaction_note !== undefined) {
      setClauses.push('reaction_note = ?');
      params.push(dto.reaction_note ?? null);
    }
    if (dto.severity !== undefined) {
      setClauses.push('severity = ?');
      params.push(dto.severity ?? null);
    }
    if (dto.retry_after_date !== undefined) {
      setClauses.push('retry_after_date = ?');
      params.push(dto.retry_after_date ? dto.retry_after_date.slice(0, 10) : null);
    }
    if (dto.status === ObservationStatus.OBSERVING) {
      setClauses.push('current_day = COALESCE(current_day, 1)');
    }
    params.push(id);
    await this.db.execute(`UPDATE food_observation SET ${setClauses.join(', ')} WHERE id = ?`, params);
    return { id, status: dto.status };
  }

  private async loadObservationForUpdate(conn: PoolConnection, id: string) {
    const [rows] = await conn.query<any[]>(
      `SELECT id, baby_id, food_name, observation_days, status, current_day
       FROM food_observation
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException('找不到排敏任务');
    return rows[0];
  }

  private async upsertLogWithConnection(
    conn: PoolConnection,
    userId: string,
    observationId: string,
    dayIndex: number,
    dto: UpsertFoodObservationLogDto,
  ) {
    const reactionFlags = dto.reaction_flags?.length ? JSON.stringify(dto.reaction_flags) : null;
    await conn.execute(
      `INSERT INTO food_observation_log
         (id, observation_id, baby_id, day_index, record_date, intake_amount_g,
          reaction_flags, reaction_level, note, action, health_record_id, recorded_by)
       SELECT ?, id, baby_id, ?, ?, ?, ?, ?, ?, ?, ?, ?
       FROM food_observation
       WHERE id = ?
       ON DUPLICATE KEY UPDATE
         record_date = VALUES(record_date),
         intake_amount_g = VALUES(intake_amount_g),
         reaction_flags = VALUES(reaction_flags),
         reaction_level = VALUES(reaction_level),
         note = VALUES(note),
         action = VALUES(action),
         health_record_id = VALUES(health_record_id),
         recorded_by = VALUES(recorded_by),
         updated_at = NOW()`,
      [
        uuidv4(),
        dayIndex,
        this.toDateOnly(dto.record_date),
        dto.intake_amount_g ?? null,
        reactionFlags,
        dto.reaction_level ?? null,
        dto.note ?? null,
        dto.action ?? ObservationLogAction.CONTINUE,
        dto.health_record_id ?? null,
        userId,
        observationId,
      ],
    );
  }

  async upsertLog(userId: string, observationId: string, dayIndex: number, dto: UpsertFoodObservationLogDto) {
    if (dayIndex < 1 || dayIndex > 7) {
      throw new BadRequestException('dayIndex 必须在 1 到 7 之间');
    }
    const conn = await this.db.getConnection();
    try {
      await conn.beginTransaction();
      const observation = await this.loadObservationForUpdate(conn, observationId);
      if (
        observation.status === ObservationStatus.ALLERGIC &&
        (dto.action ?? ObservationLogAction.CONTINUE) === ObservationLogAction.CONTINUE
      ) {
        throw new BadRequestException('已确认过敏的任务不能继续推进');
      }
      await this.upsertLogWithConnection(conn, userId, observationId, dayIndex, dto);

      let nextDay = Number(observation.current_day ?? 1);
      let nextStatus = observation.status as ObservationStatus;
      const action = dto.action ?? ObservationLogAction.CONTINUE;
      const reactionLevel = dto.reaction_level ?? ReactionLevel.NONE;

      if (action === ObservationLogAction.CONTINUE && reactionLevel === ReactionLevel.NONE) {
        const totalDays = Number(observation.observation_days ?? 3);
        if (dayIndex >= totalDays) {
          nextDay = totalDays;
          nextStatus = ObservationStatus.SAFE;
          await conn.execute(
            `UPDATE food_observation
             SET current_day = ?, status = ?, last_status_changed_at = NOW(), updated_at = NOW()
             WHERE id = ?`,
            [nextDay, nextStatus, observationId],
          );
        } else {
          nextDay = Math.max(Number(observation.current_day ?? 1), dayIndex + 1);
          await conn.execute(
            `UPDATE food_observation
             SET current_day = ?, updated_at = NOW()
             WHERE id = ?`,
            [nextDay, observationId],
          );
        }
      }

      await conn.commit();
      return {
        observation_id: observationId,
        day_index: dayIndex,
        next_day: nextDay,
        status: nextStatus,
      };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async continueToday(userId: string, observationId: string) {
    const [rows] = await this.db.query<any[]>(
      `SELECT current_day FROM food_observation WHERE id = ? LIMIT 1`,
      [observationId],
    );
    if (!rows[0]) throw new NotFoundException('找不到排敏任务');
    const dayIndex = Number(rows[0].current_day ?? 1);
    return this.upsertLog(userId, observationId, dayIndex, {
      reaction_level: ReactionLevel.NONE,
      reaction_flags: [],
      action: ObservationLogAction.CONTINUE,
    });
  }

  async removeLog(observationId: string, dayIndex: number) {
    if (dayIndex < 1 || dayIndex > 7) {
      throw new BadRequestException('dayIndex 必须在 1 到 7 之间');
    }
    const conn = await this.db.getConnection();
    try {
      await conn.beginTransaction();
      const observation = await this.loadObservationForUpdate(conn, observationId);
      if ([ObservationStatus.SAFE, ObservationStatus.ALLERGIC].includes(observation.status)) {
        throw new BadRequestException('已确认状态任务不支持删除打卡记录');
      }

      const [logRows] = await conn.query<any[]>(
        `SELECT id, health_record_id
         FROM food_observation_log
         WHERE observation_id = ? AND day_index = ?
         LIMIT 1
         FOR UPDATE`,
        [observationId, dayIndex],
      );
      const log = logRows[0];
      if (!log) throw new NotFoundException('该日打卡记录不存在');
      if (log.health_record_id) {
        throw new BadRequestException('该打卡已关联健康记录，请先撤销关联');
      }

      await conn.execute(
        'DELETE FROM food_observation_log WHERE observation_id = ? AND day_index = ?',
        [observationId, dayIndex],
      );

      const [maxRows] = await conn.query<any[]>(
        `SELECT MAX(day_index) AS max_day
         FROM food_observation_log
         WHERE observation_id = ?`,
        [observationId],
      );
      const maxDay = Number(maxRows[0]?.max_day ?? 0);
      const totalDays = Number(observation.observation_days ?? 3);
      const nextDay = Math.min(Math.max(maxDay + 1, 1), totalDays);

      await conn.execute(
        `UPDATE food_observation
         SET current_day = ?, updated_at = NOW()
         WHERE id = ?`,
        [nextDay, observationId],
      );

      await conn.commit();
      return { observation_id: observationId, day_index: dayIndex, current_day: nextDay };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async unlinkLogHealth(observationId: string, dayIndex: number, dto: UnlinkObservationHealthDto) {
    if (![ObservationStatus.OBSERVING, ObservationStatus.PAUSED, ObservationStatus.SUSPECTED].includes(dto.target_status)) {
      throw new BadRequestException('target_status 仅支持 observing / paused / suspected');
    }
    const conn = await this.db.getConnection();
    try {
      await conn.beginTransaction();
      await this.loadObservationForUpdate(conn, observationId);

      const [logRows] = await conn.query<any[]>(
        `SELECT id, health_record_id
         FROM food_observation_log
         WHERE observation_id = ? AND day_index = ?
         LIMIT 1
         FOR UPDATE`,
        [observationId, dayIndex],
      );
      const log = logRows[0];
      if (!log) throw new NotFoundException('该日打卡记录不存在');
      if (!log.health_record_id) {
        throw new BadRequestException('该打卡记录未关联健康记录');
      }

      await conn.execute(
        `UPDATE health_record
         SET observation_id = NULL,
             food_name_snapshot = NULL,
             reaction_source = 'manual',
             updated_at = NOW()
         WHERE id = ?`,
        [log.health_record_id],
      );

      await conn.execute(
        `UPDATE food_observation_log
         SET health_record_id = NULL,
             updated_at = NOW()
         WHERE id = ?`,
        [log.id],
      );

      await conn.execute(
        `UPDATE food_observation
         SET status = ?,
             reaction_note = ?,
             last_status_changed_at = NOW(),
             updated_at = NOW()
         WHERE id = ?`,
        [dto.target_status, dto.reaction_note ?? null, observationId],
      );

      await conn.commit();
      return {
        observation_id: observationId,
        day_index: dayIndex,
        target_status: dto.target_status,
      };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async createReaction(userId: string, observationId: string, dto: CreateFoodObservationReactionDto) {
    if (![ObservationStatus.SUSPECTED, ObservationStatus.ALLERGIC].includes(dto.target_status)) {
      throw new BadRequestException('target_status 仅支持 suspected 或 allergic');
    }
    const conn = await this.db.getConnection();
    let healthRecordId = '';
    try {
      await conn.beginTransaction();
      const observation = await this.loadObservationForUpdate(conn, observationId);
      healthRecordId = uuidv4();

      await conn.execute(
        `INSERT INTO health_record
           (id, baby_id, recorded_by, record_time, allergy_symptoms, allergy_severity, note,
            observation_id, food_name_snapshot, reaction_source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          healthRecordId,
          observation.baby_id,
          userId,
          toMysqlDatetime(dto.record_time),
          dto.allergy_symptoms?.length ? JSON.stringify(dto.allergy_symptoms) : null,
          dto.allergy_severity ?? null,
          dto.note ?? null,
          observationId,
          observation.food_name,
          'observation',
        ],
      );

      await this.upsertLogWithConnection(conn, userId, observationId, dto.day_index, {
        record_date: dto.record_time.slice(0, 10),
        reaction_flags: dto.allergy_symptoms ?? [],
        reaction_level: dto.allergy_severity ?? ReactionLevel.MILD,
        note: dto.note,
        action:
          dto.target_status === ObservationStatus.ALLERGIC
            ? ObservationLogAction.MARK_ALLERGIC
            : ObservationLogAction.MARK_SUSPECTED,
        health_record_id: healthRecordId,
      });

      await conn.execute(
        `UPDATE food_observation
         SET status = ?, reaction_note = ?, severity = ?, last_status_changed_at = NOW(), updated_at = NOW()
         WHERE id = ?`,
        [dto.target_status, dto.note ?? null, dto.allergy_severity ?? null, observationId],
      );

      await conn.commit();
      await this.timelineService.upsertFromSource('health', healthRecordId);
      return { observation_id: observationId, health_record_id: healthRecordId, status: dto.target_status };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async getLinkedHealthRecords(observationId: string) {
    const [rows] = await this.db.query<any[]>(
      `SELECT id, baby_id, record_time, allergy_symptoms, allergy_severity, note, created_at
       FROM health_record
       WHERE observation_id = ?
       ORDER BY record_time DESC`,
      [observationId],
    );
    return rows.map((r) => ({
      ...r,
      allergy_symptoms: this.parseJsonArray(r.allergy_symptoms),
    }));
  }

  async removeObservation(id: string) {
    const conn = await this.db.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query<any[]>(
        `SELECT id FROM food_observation WHERE id = ? LIMIT 1 FOR UPDATE`,
        [id],
      );
      if (!rows[0]) throw new NotFoundException('找不到排敏任务');

      const [linked] = await conn.query<any[]>(
        `SELECT COUNT(*) AS cnt
         FROM health_record
         WHERE observation_id = ?`,
        [id],
      );
      if (Number(linked[0]?.cnt ?? 0) > 0) {
        throw new BadRequestException('该任务存在关联健康记录，请先撤销关联后再删除');
      }

      await conn.execute('DELETE FROM food_observation WHERE id = ?', [id]);
      await conn.commit();
      return { id };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }
}
