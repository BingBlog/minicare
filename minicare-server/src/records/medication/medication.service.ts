import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_POOL } from '../../common/database/database.module';
import { toMysqlDatetime } from '../../common/utils/date.util';
import { TimelineService } from '../timeline/timeline.service';
import { CreateMedicationDto, UpdateMedicationDto } from './dto/create-medication.dto';
import { CreateMedicationRecordDto, UpdateMedicationRecordDto } from './dto/create-medication-record.dto';

/**
 * 用药记录模块服务（F14）
 *
 * 软删除原则（Migration 012/013）：所有删除仅标记 deleted_at，历史数据保留。
 * 药品清单删除不影响历史打卡（打卡冗余 medication_name 快照）。
 */
@Injectable()
export class MedicationService {
  constructor(
    @Inject(DATABASE_POOL) private readonly db: Pool,
    private readonly timelineService: TimelineService,
  ) {}

  // ── 药品清单 ────────────────────────────────────────────────

  async listMedications(familyId: string, babyId: string) {
    const [rows] = await this.db.execute<any[]>(
      `SELECT id, baby_id, name, default_dose, note, created_at, updated_at
       FROM medication
       WHERE baby_id = ? AND deleted_at IS NULL
       ORDER BY created_at ASC`,
      [babyId],
    );
    return rows;
  }

  async createMedication(familyId: string, babyId: string, userId: string, dto: CreateMedicationDto) {
    await this.assertNameUnique(familyId, babyId, dto.name, null);
    const id = uuidv4();
    await this.db.execute(
      `INSERT INTO medication (id, baby_id, name, default_dose, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, babyId, dto.name, dto.default_dose ?? null, dto.note ?? null, userId],
    );
    return { id };
  }

  async updateMedication(familyId: string, babyId: string, id: string, dto: UpdateMedicationDto) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT id FROM medication WHERE id = ? AND baby_id = ? AND deleted_at IS NULL',
      [id, babyId],
    );
    if (rows.length === 0) throw new NotFoundException('药品不存在');

    if (dto.name !== undefined) {
      await this.assertNameUnique(familyId, babyId, dto.name, id);
    }

    const setClauses: string[] = [];
    const values: any[] = [];
    if (dto.name !== undefined)        { setClauses.push('name = ?');        values.push(dto.name); }
    if (dto.default_dose !== undefined) { setClauses.push('default_dose = ?'); values.push(dto.default_dose ?? null); }
    if (dto.note !== undefined)        { setClauses.push('note = ?');        values.push(dto.note ?? null); }

    if (setClauses.length > 0) {
      values.push(id);
      await this.db.execute(`UPDATE medication SET ${setClauses.join(', ')} WHERE id = ?`, values);
    }
    return { id };
  }

  /** 软删除药品清单（历史打卡记录保留，名称快照不受影响） */
  async removeMedication(id: string) {
    await this.db.execute(
      'UPDATE medication SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
      [id],
    );
    return { id };
  }

  /** 同宝宝同名去重（应用层校验；软删记录不参与查重） */
  private async assertNameUnique(familyId: string, babyId: string, name: string, excludeId: string | null) {
    const params: any[] = [babyId, name];
    let sql = 'SELECT id FROM medication WHERE baby_id = ? AND name = ? AND deleted_at IS NULL';
    if (excludeId) {
      sql += ' AND id <> ?';
      params.push(excludeId);
    }
    const [rows] = await this.db.execute<any[]>(sql, params);
    if (rows.length > 0) {
      throw new ConflictException('该药品已存在，请勿重复添加');
    }
  }

  // ── 服药打卡 ────────────────────────────────────────────────

  async createRecord(userId: string, dto: CreateMedicationRecordDto) {
    const id = uuidv4();
    await this.db.execute(
      `INSERT INTO medication_record
         (id, baby_id, medication_id, medication_name, dose, record_time, note, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        dto.baby_id,
        dto.medication_id ?? null,
        dto.medication_name,
        dto.dose ?? null,
        toMysqlDatetime(dto.record_time),
        dto.note ?? null,
        userId,
      ],
    );
    await this.timelineService.upsertFromSource('medication', id);
    return { id };
  }

  /**
   * 查询服药记录（按日）
   * date 可选（YYYY-MM-DD），默认今日；软删记录不返回
   */
  async listRecords(babyId: string, date?: string) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    let dateStr: string;
    if (date && dateRegex.test(date)) {
      dateStr = date;
    } else {
      const d = new Date();
      dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    const [rows] = await this.db.execute<any[]>(
      `SELECT id, baby_id, medication_id, medication_name, dose,
              record_time, note, recorded_by, created_at, updated_at
       FROM medication_record
       WHERE baby_id = ? AND deleted_at IS NULL AND DATE(record_time) = ?
       ORDER BY record_time DESC`,
      [babyId, dateStr],
    );
    return rows;
  }

  async findOneRecord(id: string) {
    const [rows] = await this.db.execute<any[]>(
      `SELECT id, baby_id, medication_id, medication_name, dose,
              record_time, note, recorded_by, created_at, updated_at
       FROM medication_record WHERE id = ? AND deleted_at IS NULL`,
      [id],
    );
    return rows[0] ?? null;
  }

  async updateRecord(id: string, dto: UpdateMedicationRecordDto) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT id FROM medication_record WHERE id = ? AND deleted_at IS NULL',
      [id],
    );
    if (rows.length === 0) throw new NotFoundException('找不到该服药记录');

    const setClauses: string[] = [];
    const values: any[] = [];
    if (dto.medication_id !== undefined)   { setClauses.push('medication_id = ?');   values.push(dto.medication_id ?? null); }
    if (dto.medication_name !== undefined) { setClauses.push('medication_name = ?'); values.push(dto.medication_name); }
    if (dto.dose !== undefined)            { setClauses.push('dose = ?');            values.push(dto.dose ?? null); }
    if (dto.record_time !== undefined)     { setClauses.push('record_time = ?');     values.push(toMysqlDatetime(dto.record_time)); }
    if (dto.note !== undefined)            { setClauses.push('note = ?');            values.push(dto.note ?? null); }

    if (setClauses.length > 0) {
      values.push(id);
      await this.db.execute(`UPDATE medication_record SET ${setClauses.join(', ')} WHERE id = ?`, values);
      await this.timelineService.upsertFromSource('medication', id);
    }
    return { id };
  }

  /** 软删除服药打卡；同步移除物化时间线行（软删记录不应再出现在时间线） */
  async removeRecord(id: string) {
    await this.db.execute(
      'UPDATE medication_record SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
      [id],
    );
    await this.timelineService.removeBySource('medication', id);
    return { id };
  }
}
