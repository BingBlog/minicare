import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Pool, PoolConnection } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_POOL } from '../../common/database/database.module';
import {
  CreateMedicalDto,
  UpdateMedicalDto,
  LEGACY_VISIT_TYPES,
  CheckupGrowthSync,
  MedicalDocumentInputDto,
} from './dto/create-medical.dto';
import { ParseImagesDto } from './dto/parse-images.dto';
import { toMysqlDate, getBeijingToday, addDays, formatSqlDate } from '../../common/utils/date.util';
import { TimelineService } from '../timeline/timeline.service';
import { GrowthService } from '../growth/growth.service';
import { AgentService } from '../../agent/agent.service';

/**
 * MedicalService —— 医疗记录（020 类型化：vaccine/checkup/sick/other）
 * 手写 SQL 风格与既有 service 保持一致；类型化 JSON 列在 mapRow 统一解析。
 */

/** 医疗记录全部业务列（含 020 扩展），insert/update 共用白名单 */
const ALL_COLUMNS = [
  'visit_date', 'visit_time', 'visit_type', 'hospital', 'doctor', 'diagnosis',
  'result_summary', 'medications', 'photo_ids', 'follow_up_date', 'follow_up_time', 'note',
  // 020 类型化
  'vaccine_name', 'vaccine_schedule_key', 'vaccine_dose_seq', 'vaccine_site', 'vaccine_batch',
  'vaccine_reactions', 'vaccine_reaction_note',
  'checkup_height_mm', 'checkup_weight_g', 'checkup_head_mm', 'checkup_milestones',
  'checkup_assessment', 'checkup_qa', 'checkup_growth_sync',
  'sick_complaint', 'sick_symptom_flags',
] as const;

/** JSON 列白名单（写库序列化 / 读库解析） */
const JSON_COLUMNS = new Set([
  'medications', 'photo_ids', 'vaccine_reactions', 'checkup_milestones', 'checkup_qa', 'sick_symptom_flags',
]);

@Injectable()
export class MedicalService {
  private readonly logger = new Logger(MedicalService.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly db: Pool,
    private readonly timelineService: TimelineService,
    private readonly growthService: GrowthService,
    private readonly agentService: AgentService,
  ) {}

  private jsonOrNull(v: unknown): string | null {
    if (v === undefined || v === null) return null;
    return JSON.stringify(v);
  }

  /** 行输出归一：日期转 YYYY-MM-DD、JSON 解析、needsCompletion 判定 */
  private mapRow(r: any) {
    const out: Record<string, any> = { ...r };
    out.visit_date = formatSqlDate(r.visit_date);
    if (r.follow_up_date) out.follow_up_date = formatSqlDate(r.follow_up_date);
    for (const col of JSON_COLUMNS) {
      if (r[col] != null) {
        out[col] = typeof r[col] === 'string' ? JSON.parse(r[col]) : r[col];
      } else {
        out[col] = col === 'medications' || col === 'photo_ids' ? [] : null;
      }
    }
    // 老疫苗记录（无疫苗名结构化）→ 前端展示"补全为疫苗记录"引导（PRD-005 US-10）
    out.needsCompletion = r.visit_type === 'vaccine' && !r.vaccine_name;
    return out;
  }

  private hasMeasurement(dto: { checkup_height_mm?: number; checkup_weight_g?: number; checkup_head_mm?: number }): boolean {
    return dto.checkup_height_mm != null || dto.checkup_weight_g != null || dto.checkup_head_mm != null;
  }

  // ── 单据档案（PRD-017 / TECH-035：行=图片，随记录同事务写入；仅 findOne 带出）──

  /** photo_ids 归一（DB 行可能是 JSON 字符串或数组） */
  private parsePhotoIds(v: any): string[] {
    if (v == null) return [];
    if (Array.isArray(v)) return v;
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }

  /** 单据输入 → 绑定的 db 值（与 INSERT 列序一致） */
  private docBindValues(recordId: string, d: MedicalDocumentInputDto): any[] {
    return [
      uuidv4(), recordId, d.file_id, d.doc_type, d.status,
      d.confidence ?? null,
      d.parsed_json != null ? JSON.stringify(d.parsed_json) : null,
      d.error_note ?? null,
    ];
  }

  /** 有效单据过滤：file_id 必须 ∈ photo_ids（防越权/防脏数据），file_id 去重（后者覆盖） */
  private filterDocs(docs: MedicalDocumentInputDto[], photoIds: string[]): MedicalDocumentInputDto[] {
    const allowed = new Set(photoIds);
    const byFile = new Map<string, MedicalDocumentInputDto>();
    for (const d of docs) {
      if (allowed.has(d.file_id)) byFile.set(d.file_id, d);
    }
    return [...byFile.values()];
  }

  /** 多值插入档案（create 事务内） */
  private async insertDocuments(conn: PoolConnection, recordId: string, docs: MedicalDocumentInputDto[]) {
    if (docs.length === 0) return;
    const placeholders = docs.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    const values = docs.flatMap((d) => this.docBindValues(recordId, d));
    await conn.query(
      `INSERT INTO medical_document
         (id, medical_record_id, file_id, doc_type, status, confidence, parsed_json, error_note)
       VALUES ${placeholders}`,
      values,
    );
  }

  /** 更新时同步档案：upsert 提交项 + 按 photo_ids 清理孤儿（update 事务内） */
  private async syncDocuments(
    conn: PoolConnection,
    recordId: string,
    docs: MedicalDocumentInputDto[] | undefined,
    photoIds: string[],
  ) {
    if (docs !== undefined) {
      for (const d of this.filterDocs(docs, photoIds)) {
        await conn.execute(
          `INSERT INTO medical_document
             (id, medical_record_id, file_id, doc_type, status, confidence, parsed_json, error_note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             doc_type = VALUES(doc_type), status = VALUES(status), confidence = VALUES(confidence),
             parsed_json = VALUES(parsed_json), error_note = VALUES(error_note), updated_at = NOW()`,
          this.docBindValues(recordId, d),
        );
      }
    }
    // 清理:档案行必须对应现存图片（photo_ids 空 → 全部清理）
    if (photoIds.length > 0) {
      await conn.query(
        'DELETE FROM medical_document WHERE medical_record_id = ? AND file_id NOT IN (?)',
        [recordId, photoIds],
      );
    } else {
      await conn.execute('DELETE FROM medical_document WHERE medical_record_id = ?', [recordId]);
    }
  }

  /** 读取档案（按 photo_ids 顺序；仅 findOne 调用，列表接口不携带） */
  private async loadDocuments(recordId: string, photoIds: string[]) {
    const [docs] = await this.db.execute<any[]>(
      'SELECT * FROM medical_document WHERE medical_record_id = ?',
      [recordId],
    );
    if (docs.length === 0) return [];
    const order = new Map(photoIds.map((fid, i) => [fid, i]));
    return docs
      .map((d) => ({
        file_id: d.file_id,
        doc_type: d.doc_type,
        status: d.status,
        confidence: d.confidence,
        parsed_json: d.parsed_json != null
          ? (typeof d.parsed_json === 'string' ? JSON.parse(d.parsed_json) : d.parsed_json)
          : null,
        error_note: d.error_note,
        updated_at: d.updated_at,
      }))
      .sort((a, b) => (order.get(a.file_id) ?? 99) - (order.get(b.file_id) ?? 99));
  }

  /**
   * 儿保测量同步生长记录（TECH-011 §1.4 / PRD D2：同日默认覆盖）
   * 有任一测量且未显式 skip → 调 growth.create（ON DUPLICATE 覆盖当日），
   * 回填 checkup_growth_sync = overwritten(当日已有) / synced(新建)。
   * 降级：growth 写失败仅告警，不阻断 medical 主流程（best_effort 口径）。
   */
  private async syncGrowthFromCheckup(
    userId: string,
    babyId: string,
    visitDate: string, // YYYY-MM-DD
    visitTime: string | undefined,
    m: { checkup_height_mm?: number; checkup_weight_g?: number; checkup_head_mm?: number },
    medicalId: string,
  ) {
    let existed = false;
    try {
      const [rows] = await this.db.execute<any[]>(
        'SELECT id FROM growth_record WHERE baby_id = ? AND record_date = ?',
        [babyId, toMysqlDate(visitDate)],
      );
      existed = rows.length > 0;
    } catch (e: any) {
      this.logger.warn(`syncGrowth precheck failed: ${e?.message}`);
    }
    try {
      await this.growthService.create(userId, {
        baby_id: babyId,
        record_date: visitDate,
        record_time: visitTime,
        weight_g: m.checkup_weight_g,
        height_mm: m.checkup_height_mm,
        head_mm: m.checkup_head_mm,
      });
    } catch (e: any) {
      this.logger.warn(`sync growth skipped (medical ${medicalId}): ${e?.message}`);
      return;
    }
    try {
      await this.db.execute(
        'UPDATE medical_record SET checkup_growth_sync = ? WHERE id = ?',
        [existed ? CheckupGrowthSync.OVERWRITTEN : CheckupGrowthSync.SYNCED, medicalId],
      );
    } catch (e: any) {
      this.logger.warn(`sync backfill checkup_growth_sync failed (medical ${medicalId}): ${e?.message}`);
    }
  }

  private warnStockSyncPending(medicalId: string) {
    this.logger.warn(`sync_meds_to_stock 需要 P1 引入 MedicationModule 后生效（medical ${medicalId}）`);
  }

  async create(userId: string, dto: CreateMedicalDto) {
    const id = uuidv4();
    const measured = this.hasMeasurement(dto);
    const willSkip = dto.checkup_growth_sync === CheckupGrowthSync.SKIPPED;
    // 初值：无测量 → null；skip → skipped；有测量待同步 → null（成功后回填）
    const syncInit = !measured ? null : (willSkip ? CheckupGrowthSync.SKIPPED : null);

    // 主记录 + 单据档案同事务（PRD-017：档案写失败整体回滚，不产生"记录存了档案丢了"半成品）
    const conn = await this.db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        `INSERT INTO medical_record
           (id, baby_id, recorded_by, ${ALL_COLUMNS.join(', ')})
         VALUES (?, ?, ?, ${ALL_COLUMNS.map(() => '?').join(', ')})`,
        [
          id, dto.baby_id, userId,
          toMysqlDate(dto.visit_date),
          dto.visit_time            ?? null,
          dto.visit_type            ?? null,
          dto.hospital              ?? null,
          dto.doctor                ?? null,
          dto.diagnosis             ?? null,
          dto.result_summary        ?? null,
          this.jsonOrNull(dto.medications),
          this.jsonOrNull(dto.photo_ids),
          dto.follow_up_date ? toMysqlDate(dto.follow_up_date) : null,
          dto.follow_up_time        ?? null,
          dto.note                  ?? null,
          dto.vaccine_name          ?? null,
          dto.vaccine_schedule_key  ?? null,
          dto.vaccine_dose_seq      ?? null,
          dto.vaccine_site          ?? null,
          dto.vaccine_batch         ?? null,
          this.jsonOrNull(dto.vaccine_reactions),
          dto.vaccine_reaction_note ?? null,
          dto.checkup_height_mm     ?? null,
          dto.checkup_weight_g      ?? null,
          dto.checkup_head_mm       ?? null,
          this.jsonOrNull(dto.checkup_milestones),
          dto.checkup_assessment    ?? null,
          this.jsonOrNull(dto.checkup_qa),
          syncInit,
          dto.sick_complaint        ?? null,
          this.jsonOrNull(dto.sick_symptom_flags),
        ],
      );
      // 单据档案同事务写入（仅保留 file_id ∈ photo_ids 的项）
      if (dto.documents?.length) {
        await this.insertDocuments(conn, id, this.filterDocs(dto.documents, dto.photo_ids ?? []));
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    await this.timelineService.upsertFromSource('medical', id);

    if (measured && !willSkip) {
      await this.syncGrowthFromCheckup(userId, dto.baby_id, dto.visit_date, dto.visit_time, dto, id);
    }
    if (dto.sync_meds_to_stock && dto.medications?.length) this.warnStockSyncPending(id);
    return { id };
  }

  /** 7 天窗口列表（既有语义，供列表页/Web 兼容；档案走 archive） */
  async findAll(babyId: string, beforeDate?: string) {
    const endDate = beforeDate || addDays(getBeijingToday(), 1);
    const startDate = addDays(endDate, -7);

    const [rows] = await this.db.query<any[]>(
      `SELECT * FROM medical_record
       WHERE baby_id = ? AND visit_date >= ? AND visit_date < ?
       ORDER BY visit_date DESC`,
      [babyId, startDate, endDate],
    );
    const items = rows.map((r) => this.mapRow(r));

    let hasMore = false;
    if (items.length > 0) {
      hasMore = true;
    } else {
      const [countResult] = await this.db.query<any[]>(
        `SELECT COUNT(*) AS total FROM medical_record WHERE baby_id = ? AND visit_date < ?`,
        [babyId, startDate],
      );
      hasMore = countResult[0]?.total > 0;
    }

    return { items, nextBeforeDate: hasMore ? startDate : null };
  }

  /** 全量 keyset 分页档案（PD-P0-03；visit_type 过滤：儿保档案/疫苗历史/就诊历史/记录流） */
  async archive(babyId: string, visitType?: string, beforeDate?: string) {
    const endDate = beforeDate || addDays(getBeijingToday(), 1);
    const where = ['baby_id = ?', 'visit_date < ?'];
    const params: any[] = [babyId, endDate];
    if (visitType) {
      where.push('visit_type = ?');
      params.push(visitType);
    }
    const [rows] = await this.db.query<any[]>(
      `SELECT * FROM medical_record WHERE ${where.join(' AND ')}
       ORDER BY visit_date DESC, created_at DESC LIMIT 30`,
      params,
    );
    const items = rows.map((r) => this.mapRow(r));
    const oldestDate = items.length ? items[items.length - 1].visit_date : null;
    let hasMore = false;
    if (oldestDate) {
      const [count] = await this.db.query<any[]>(
        `SELECT COUNT(*) AS total FROM medical_record WHERE baby_id = ? AND visit_date < ?${visitType ? ' AND visit_type = ?' : ''}`,
        visitType ? [babyId, oldestDate, visitType] : [babyId, oldestDate],
      );
      hasMore = count[0]?.total > 0;
    }
    return { items, nextBeforeDate: hasMore && oldestDate ? oldestDate : null };
  }

  /** 查询下一次复查提醒（首页展示用，既有语义） */
  async findNextFollowUp(babyId: string) {
    const today = getBeijingToday();
    const [rows] = await this.db.query<any[]>(
      `SELECT id, baby_id, visit_date, visit_time, visit_type, hospital,
              follow_up_date, follow_up_time
       FROM medical_record
       WHERE baby_id = ? AND follow_up_date IS NOT NULL AND follow_up_date >= ?
       ORDER BY follow_up_date ASC, follow_up_time ASC LIMIT 1`,
      [babyId, today],
    );
    if (!rows[0]) return null;
    return {
      ...rows[0],
      visit_date: formatSqlDate(rows[0].visit_date),
      follow_up_date: formatSqlDate(rows[0].follow_up_date),
    };
  }

  /**
   * 识图解析编排（PRD-017 / TECH-035 §3.1）
   * 校验 baby 归属 + fileId 前缀（/medical/{babyId}/）→ 转发 agent（并发 3 在 agent 内）。
   * 解析不落库：结果由前端确认，随"保存"动作经 create/update 的 documents 落库。
   */
  async parseImages(familyId: string, dto: ParseImagesDto) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT id FROM baby_profile WHERE id = ? AND family_id = ? AND deleted_at IS NULL',
      [dto.baby_id, familyId],
    );
    if (rows.length === 0) throw new NotFoundException('宝宝不属于该家庭');

    const prefix = `/medical/${dto.baby_id}/`;
    if (!dto.file_ids.every((fid) => fid.includes(prefix))) {
      throw new BadRequestException('图片不属于该宝宝');
    }
    return this.agentService.postParseImages(dto.file_ids);
  }

  async findOne(id: string) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT * FROM medical_record WHERE id = ?',
      [id],
    );
    if (!rows[0]) return null;
    const out = this.mapRow(rows[0]);
    // 单据档案仅详情带出（列表/档案接口不携带，PRD-017 §9.2-R8）
    out.documents = await this.loadDocuments(id, out.photo_ids ?? []);
    return out;
  }

  /** update 类型锁定：仅 deprecated(blood/allergy)→other 归一放行（TECH-011 §3.5 纵深防御） */
  private assertVisitTypeChangeAllowed(oldType: string | null, newType: string | undefined) {
    if (newType === undefined || oldType === newType) return;
    const legacy = LEGACY_VISIT_TYPES.includes(oldType as any);
    if (legacy && newType === 'other') return;
    throw new BadRequestException('就诊类型不可变更，请删除后新建（老数据归一除外）');
  }

  /** 全字段动态更新；update 需 userId（儿保测量同步 growth 时记录 recorded_by） */
  async update(id: string, userId: string, dto: UpdateMedicalDto) {
    const [rows] = await this.db.execute<any[]>('SELECT * FROM medical_record WHERE id = ?', [id]);
    const existing = rows[0];
    if (!existing) throw new NotFoundException('找不到该医疗记录');

    this.assertVisitTypeChangeAllowed(existing.visit_type, dto.visit_type);

    const setClauses: string[] = [];
    const values: any[] = [];
    const push = (col: string, v: any) => { setClauses.push(`${col} = ?`); values.push(v); };

    if (dto.visit_date !== undefined) push('visit_date', toMysqlDate(dto.visit_date));
    if (dto.visit_time !== undefined) push('visit_time', dto.visit_time ?? null);
    if (dto.visit_type !== undefined) push('visit_type', dto.visit_type ?? null);
    if (dto.hospital !== undefined) push('hospital', dto.hospital ?? null);
    if (dto.doctor !== undefined) push('doctor', dto.doctor ?? null);
    if (dto.diagnosis !== undefined) push('diagnosis', dto.diagnosis ?? null);
    if (dto.result_summary !== undefined) push('result_summary', dto.result_summary ?? null);
    if (dto.medications !== undefined) push('medications', this.jsonOrNull(dto.medications));
    if (dto.photo_ids !== undefined) push('photo_ids', this.jsonOrNull(dto.photo_ids));
    if (dto.follow_up_date !== undefined) push('follow_up_date', dto.follow_up_date ? toMysqlDate(dto.follow_up_date) : null);
    if (dto.follow_up_time !== undefined) push('follow_up_time', dto.follow_up_time ?? null);
    if (dto.note !== undefined) push('note', dto.note ?? null);
    // 020 类型化
    if (dto.vaccine_name !== undefined) push('vaccine_name', dto.vaccine_name ?? null);
    if (dto.vaccine_schedule_key !== undefined) push('vaccine_schedule_key', dto.vaccine_schedule_key ?? null);
    if (dto.vaccine_dose_seq !== undefined) push('vaccine_dose_seq', dto.vaccine_dose_seq ?? null);
    if (dto.vaccine_site !== undefined) push('vaccine_site', dto.vaccine_site ?? null);
    if (dto.vaccine_batch !== undefined) push('vaccine_batch', dto.vaccine_batch ?? null);
    if (dto.vaccine_reactions !== undefined) push('vaccine_reactions', this.jsonOrNull(dto.vaccine_reactions));
    if (dto.vaccine_reaction_note !== undefined) push('vaccine_reaction_note', dto.vaccine_reaction_note ?? null);
    if (dto.checkup_height_mm !== undefined) push('checkup_height_mm', dto.checkup_height_mm ?? null);
    if (dto.checkup_weight_g !== undefined) push('checkup_weight_g', dto.checkup_weight_g ?? null);
    if (dto.checkup_head_mm !== undefined) push('checkup_head_mm', dto.checkup_head_mm ?? null);
    if (dto.checkup_milestones !== undefined) push('checkup_milestones', this.jsonOrNull(dto.checkup_milestones));
    if (dto.checkup_assessment !== undefined) push('checkup_assessment', dto.checkup_assessment ?? null);
    if (dto.checkup_qa !== undefined) push('checkup_qa', this.jsonOrNull(dto.checkup_qa));
    if (dto.sick_complaint !== undefined) push('sick_complaint', dto.sick_complaint ?? null);
    if (dto.sick_symptom_flags !== undefined) push('sick_symptom_flags', this.jsonOrNull(dto.sick_symptom_flags));

    // 儿保测量同步语义：带测量未 skip → 先置 null 待回填；skip → skipped；无测量 → 维持/显式更新
    const measured = dto.checkup_height_mm !== undefined || dto.checkup_weight_g !== undefined || dto.checkup_head_mm !== undefined;
    const willSkip = dto.checkup_growth_sync === CheckupGrowthSync.SKIPPED;
    if (measured) {
      push('checkup_growth_sync', willSkip ? CheckupGrowthSync.SKIPPED : null);
    } else if (dto.checkup_growth_sync !== undefined) {
      push('checkup_growth_sync', dto.checkup_growth_sync ?? null);
    }

    // 主记录更新 + 档案同步同事务（PRD-017）
    const needDocSync = dto.documents !== undefined || dto.photo_ids !== undefined;
    if (setClauses.length > 0 || needDocSync) {
      const conn = await this.db.getConnection();
      try {
        await conn.beginTransaction();
        if (setClauses.length > 0) {
          values.push(id);
          await conn.execute(`UPDATE medical_record SET ${setClauses.join(', ')} WHERE id = ?`, values);
        }
        if (needDocSync) {
          const targetPhotoIds = dto.photo_ids !== undefined
            ? dto.photo_ids
            : this.parsePhotoIds(existing.photo_ids);
          await this.syncDocuments(conn, id, dto.documents, targetPhotoIds);
        }
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
      if (setClauses.length > 0) {
        await this.timelineService.upsertFromSource('medical', id);
      }
    }

    if (measured && !willSkip) {
      const visitDate = dto.visit_date !== undefined ? toMysqlDate(dto.visit_date) : formatSqlDate(existing.visit_date);
      await this.syncGrowthFromCheckup(
        userId,
        existing.baby_id,
        visitDate,
        dto.visit_time ?? existing.visit_time,
        {
          checkup_height_mm: dto.checkup_height_mm,
          checkup_weight_g: dto.checkup_weight_g,
          checkup_head_mm: dto.checkup_head_mm,
        },
        id,
      );
    }

    if (dto.sync_meds_to_stock && dto.medications?.length) this.warnStockSyncPending(id);

    const [updated] = await this.db.execute<any[]>('SELECT * FROM medical_record WHERE id = ?', [id]);
    return this.mapRow(updated[0]);
  }

  async remove(id: string) {
    // 先子后主（PRD-017：档案随记录删除；与既有物理删除口径一致）
    await this.db.execute('DELETE FROM medical_document WHERE medical_record_id = ?', [id]);
    await this.db.execute('DELETE FROM medical_record WHERE id = ?', [id]);
    await this.timelineService.removeBySource('medical', id);
    return { id };
  }
}
