import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_POOL } from '../../common/database/database.module';
import { getBeijingToday, formatSqlDate } from '../../common/utils/date.util';
import { computeVaccineBook, ScheduleDoseRow, VaxRecordRow, VaccineSettingRow } from './vaccine-book.core';

/** baby_vaccine_setting 写入体（controller 透传） */
export interface UpsertVaccineSettingDto {
  baby_id: string;
  vaccine_key: string;
  track_flag?: boolean;
  replaced_flag?: boolean;
  replaced_note?: string;
}

/**
 * 疫苗本服务：参考程序库读取 + 宝宝级进度计算 + 偏好 upsert（TECH-011 §3.4）
 * 计算逻辑全部在 vaccine-book.core.ts（纯函数），本服务只做 IO。
 */
@Injectable()
export class VaccineBookService {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  /** 参考程序库全量（疫苗本渲染 + 记录表单疫苗联想） */
  async listSchedule() {
    const [rows] = await this.db.query<any[]>(
      `SELECT vkey, name, category, dose_seq, dose_label,
              month_min, month_rec, month_max, note
       FROM vaccine_schedule ORDER BY sort ASC, vkey ASC, dose_seq ASC`,
    );
    return rows;
  }

  /** 疫苗本：状态机结果（PRD-005 US-03） */
  async getBook(babyId: string) {
    const [babies] = await this.db.execute<any[]>(
      'SELECT id, birth_date FROM baby_profile WHERE id = ?',
      [babyId],
    );
    const baby = babies[0];
    if (!baby) throw new NotFoundException('找不到该宝宝');

    const [scheduleRows] = await this.db.query<any[]>(
      `SELECT vkey, name, category, dose_seq, dose_label, month_min, month_rec, month_max, note
       FROM vaccine_schedule ORDER BY sort ASC, vkey ASC, dose_seq ASC`,
    );
    const [recordRows] = await this.db.query<any[]>(
      `SELECT id, vaccine_schedule_key, vaccine_name, vaccine_dose_seq, visit_date
       FROM medical_record
       WHERE baby_id = ? AND visit_type = 'vaccine'`,
      [babyId],
    );
    const [settingRows] = await this.db.query<any[]>(
      'SELECT vaccine_key, track_flag, replaced_flag FROM baby_vaccine_setting WHERE baby_id = ?',
      [babyId],
    );

    const schedule: ScheduleDoseRow[] = scheduleRows.map((r) => ({
      vkey: r.vkey,
      name: r.name,
      category: r.category,
      dose_seq: r.dose_seq,
      dose_label: r.dose_label,
      month_min: r.month_min,
      month_rec: r.month_rec,
      month_max: r.month_max,
      note: r.note,
    }));
    const records: VaxRecordRow[] = recordRows.map((r) => ({
      id: r.id,
      vaccine_schedule_key: r.vaccine_schedule_key,
      vaccine_name: r.vaccine_name,
      vaccine_dose_seq: r.vaccine_dose_seq,
      visit_date: formatSqlDate(r.visit_date),
    }));
    const settings: VaccineSettingRow[] = settingRows.map((r) => ({
      vaccine_key: r.vaccine_key,
      track_flag: r.track_flag,
      replaced_flag: r.replaced_flag,
    }));

    return computeVaccineBook({
      schedule,
      records,
      settings,
      birth_date: formatSqlDate(baby.birth_date),
      ref_date: getBeijingToday(),
    });
  }

  /** 宝宝级偏好 upsert（跟踪开关 / 联合疫苗替代标记） */
  async upsertSetting(userId: string, dto: UpsertVaccineSettingDto) {
    const [exists] = await this.db.execute<any[]>(
      'SELECT id FROM vaccine_schedule WHERE vkey = ? LIMIT 1',
      [dto.vaccine_key],
    );
    if (!exists[0]) throw new BadRequestException('未知的疫苗程序键');

    const id = uuidv4();
    await this.db.execute(
      `INSERT INTO baby_vaccine_setting
         (id, baby_id, vaccine_key, track_flag, replaced_flag, replaced_note, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         track_flag = VALUES(track_flag),
         replaced_flag = VALUES(replaced_flag),
         replaced_note = VALUES(replaced_note),
         updated_by = VALUES(updated_by)`,
      [
        id,
        dto.baby_id,
        dto.vaccine_key,
        dto.track_flag === undefined ? 1 : (dto.track_flag ? 1 : 0),
        dto.replaced_flag === undefined ? 0 : (dto.replaced_flag ? 1 : 0),
        dto.replaced_note ?? null,
        userId,
      ],
    );
    return { baby_id: dto.baby_id, vaccine_key: dto.vaccine_key };
  }
}
