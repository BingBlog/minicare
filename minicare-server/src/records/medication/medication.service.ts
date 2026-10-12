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
import { toMysqlDatetime } from '../../common/utils/date.util';
import { TimelineService } from '../timeline/timeline.service';
import { CreateMedicationDto, UpdateMedicationDto } from './dto/create-medication.dto';
import { CreateMedicationRecordDto, UpdateMedicationRecordDto } from './dto/create-medication-record.dto';
import { CreateMedicationBatchDto, UpdateMedicationBatchDto } from './dto/medication-batch.dto';

/**
 * 用药记录模块服务（F14）
 *
 * 软删除原则（Migration 012/013）：所有删除仅标记 deleted_at，历史数据保留。
 * 药品清单删除不影响历史打卡（打卡冗余 medication_name 快照）。
 *
 * 多药批次（Migration 025）：一次服药可含多种药，同批 medication_record 共享
 * batch_id，前端按批聚合展示为「一条服药事件」；batch_id=NULL 为历史单药记录。
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
      `SELECT id, baby_id, name, default_dose, photo_id, note, created_at, updated_at
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
      `INSERT INTO medication (id, baby_id, name, default_dose, photo_id, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, babyId, dto.name, dto.default_dose ?? null, dto.photo_id ?? null, dto.note ?? null, userId],
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
    // photo_id 传空字符串视同清除（NULL），避免前端"删除照片"要区分 undefined
    if (dto.photo_id !== undefined)    { setClauses.push('photo_id = ?');    values.push(dto.photo_id || null); }
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

  // ── 多药批次（Migration 025）────────────────────────────────

  /** 新建服药批次：一次服药多种药，批内每药一条记录（共享 batch_id） */
  async createBatch(userId: string, dto: CreateMedicationBatchDto) {
    const batchId = uuidv4();
    const recordTime = toMysqlDatetime(dto.record_time);
    const ids: string[] = [];
    for (const item of dto.items) {
      const id = uuidv4();
      await this.db.execute(
        `INSERT INTO medication_record
           (id, baby_id, medication_id, batch_id, medication_name, dose, record_time, note, recorded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          dto.baby_id,
          item.medication_id ?? null,
          batchId,
          item.medication_name,
          item.dose ?? null,
          recordTime,
          dto.note ?? null,
          userId,
        ],
      );
      ids.push(id);
    }
    for (const id of ids) {
      await this.timelineService.upsertFromSource('medication', id);
    }
    return { batch_id: batchId, ids };
  }

  /**
   * 加载 batch 成员（编辑模式整批回填）
   * anchor 无 batch_id（历史单药记录）→ 返回单条数组，前端表单按单行渲染。
   */
  async getBatch(anchorId: string) {
    const anchor = await this.findOneRecord(anchorId);
    if (!anchor) throw new NotFoundException('找不到该服药记录');
    if (!anchor.batch_id) return [anchor];

    const [rows] = await this.db.execute<any[]>(
      `SELECT id, baby_id, medication_id, batch_id, medication_name, dose,
              record_time, note, recorded_by, created_at, updated_at
       FROM medication_record
       WHERE batch_id = ? AND deleted_at IS NULL
       ORDER BY created_at ASC, id ASC`,
      [anchor.batch_id],
    );
    return rows;
  }

  /**
   * 整批保存（diff）：
   *   - items 中带 record_id 且在批内 → UPDATE（保留行，可改药/剂量）
   *   - items 中不带 record_id     → INSERT（新增行）
   *   - 批内未出现在 items 的行    → 软删除（含物化时间线移除）
   * anchor 无批次且提交了多行时，自动为该批开辟 batch_id 并把 anchor 并入。
   * record_time / note 为批级字段，统一重写到批内全部行。
   */
  async updateBatch(anchorId: string, userId: string, dto: UpdateMedicationBatchDto) {
    const anchor = await this.findOneRecord(anchorId);
    if (!anchor) throw new NotFoundException('找不到该服药记录');

    // 批内既有成员（anchor 无批次时仅 anchor 自身）
    const memberIds: string[] = anchor.batch_id
      ? (
          await this.db.execute<any[]>(
            'SELECT id FROM medication_record WHERE batch_id = ? AND deleted_at IS NULL',
            [anchor.batch_id],
          )
        )[0].map((r) => r.id as string)
      : [anchor.id as string];
    const memberSet = new Set(memberIds);

    // 提交行里的既有记录必须属于本批，防跨批误改
    for (const item of dto.items) {
      if (item.record_id && !memberSet.has(item.record_id)) {
        throw new BadRequestException('提交的记录不属于该服药批次');
      }
    }

    // anchor 无批次、提交了新增行 → 开辟新批次并把 anchor 并入
    const hasNewRows = dto.items.some((i) => !i.record_id);
    let batchId: string | null = anchor.batch_id ?? null;
    if (!batchId && hasNewRows) batchId = uuidv4();

    // 批级 record_time / note：不传则保持原值
    const recordTime = dto.record_time ? toMysqlDatetime(dto.record_time) : anchor.record_time;
    const note = dto.note !== undefined ? (dto.note || null) : (anchor.note ?? null);

    const touched: string[] = [];
    const submittedIds = new Set<string>();

    for (const item of dto.items) {
      if (item.record_id) {
        submittedIds.add(item.record_id);
        await this.db.execute(
          `UPDATE medication_record
             SET medication_id = ?, batch_id = ?, medication_name = ?, dose = ?, record_time = ?, note = ?
           WHERE id = ?`,
          [
            item.medication_id ?? null,
            batchId,
            item.medication_name,
            item.dose ?? null,
            recordTime,
            note,
            item.record_id,
          ],
        );
        touched.push(item.record_id);
      } else {
        const id = uuidv4();
        await this.db.execute(
          `INSERT INTO medication_record
             (id, baby_id, medication_id, batch_id, medication_name, dose, record_time, note, recorded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            anchor.baby_id,
            item.medication_id ?? null,
            batchId,
            item.medication_name,
            item.dose ?? null,
            recordTime,
            note,
            userId,
          ],
        );
        touched.push(id);
      }
    }

    // 未被提交的批内成员 → 软删除 + 移除物化时间线
    for (const mid of memberIds) {
      if (!submittedIds.has(mid)) {
        await this.db.execute(
          'UPDATE medication_record SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
          [mid],
        );
        await this.timelineService.removeBySource('medication', mid);
      }
    }

    for (const id of touched) {
      await this.timelineService.upsertFromSource('medication', id);
    }
    return { batch_id: batchId, ids: touched };
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
      `SELECT id, baby_id, medication_id, batch_id, medication_name, dose,
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
      `SELECT id, baby_id, medication_id, batch_id, medication_name, dose,
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

  /**
   * 软删除服药打卡；同步移除物化时间线行（软删记录不应再出现在时间线）。
   * 多药批次（025）：删除批内任一条 = 删除整批（时间线/列表展示的是合并后的
   * 「一次服药」，删除语义与展示对齐）；batch_id=NULL 的历史单药记录仍为单条删除。
   */
  async removeRecord(id: string) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT id, batch_id FROM medication_record WHERE id = ? AND deleted_at IS NULL',
      [id],
    );
    if (rows.length === 0) return { id, deleted: 0 };

    let ids = [id];
    if (rows[0].batch_id) {
      const [members] = await this.db.execute<any[]>(
        'SELECT id FROM medication_record WHERE batch_id = ? AND deleted_at IS NULL',
        [rows[0].batch_id],
      );
      ids = members.map((m) => m.id as string);
    }

    for (const rid of ids) {
      await this.db.execute(
        'UPDATE medication_record SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
        [rid],
      );
      await this.timelineService.removeBySource('medication', rid);
    }
    return { id, deleted: ids.length };
  }
}
