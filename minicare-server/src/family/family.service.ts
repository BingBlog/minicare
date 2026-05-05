import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_POOL } from '../common/database/database.module';
import { CreateFamilyDto } from './dto/create-family.dto';

@Injectable()
export class FamilyService {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  /**
   * 创建家庭，创建者自动成为 OWNER（role='owner'）
   */
  async createFamily(userId: string, dto: CreateFamilyDto) {
    const conn = await this.db.getConnection();
    try {
      await conn.beginTransaction();

      const familyId   = uuidv4();
      const memberId   = uuidv4();
      // 保留 invite_code 字段（兼容旧数据，不再对外暴露）
      const inviteCode = Math.random().toString(36).slice(2, 8).toUpperCase();

      await conn.execute(
        'INSERT INTO family_group (id, name, invite_code, created_by) VALUES (?, ?, ?, ?)',
        [familyId, dto.name, inviteCode, userId],
      );

      // 创建者加入家庭，role='owner'，status='active'（Migration 008: TINYINT → VARCHAR）
      await conn.execute(
        "INSERT INTO family_member (id, family_id, user_id, role, status) VALUES (?, ?, ?, 'owner', 'active')",
        [memberId, familyId, userId],
      );

      await conn.commit();

      return { id: familyId, name: dto.name };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * 获取用户所有家庭列表
   */
  async getMyFamilies(userId: string) {
    const [rows] = await this.db.execute<any[]>(
      `SELECT fg.id, fg.name, fg.created_at, fm.role
       FROM family_group fg
       JOIN family_member fm ON fg.id = fm.family_id
       WHERE fm.user_id = ? AND fm.status = 'active'
       ORDER BY fg.created_at DESC`,
      [userId],
    );
    return rows;
  }

  /**
   * 获取家庭成员列表（active + pending 分开返回）
   * - active 成员：status='active'，展示昵称、手机号
   * - pending 成员：status='pending'，展示 invite_phone（脱敏），无 user_id
   */
  async getMembers(familyId: string) {
    const [rows] = await this.db.execute<any[]>(
      `SELECT fm.id, fm.role, fm.status, fm.joined_at, fm.invite_phone,
              ua.id AS user_id, ua.nickname AS name, ua.avatar_url
       FROM family_member fm
       LEFT JOIN user_account ua ON fm.user_id = ua.id
       WHERE fm.family_id = ? AND fm.status IN ('pending', 'active')
       ORDER BY fm.status ASC, fm.role ASC, fm.joined_at ASC`,
      [familyId],
    );
    return rows;
  }

  /**
   * 按手机号邀请成员（创建 pending 记录）
   *
   * 规则：
   * - 不可重复邀请已 active 的成员（通过 invite_phone 或 user phone 查找）
   * - 不可重复邀请已 pending 的相同手机号
   * - 被邀请人可以尚未注册（user_id=NULL，等待注册后激活）
   * - 不可邀请自己
   */
  async inviteByPhone(familyId: string, inviterId: string, phone: string) {
    // 检查邀请人自身手机号
    const [selfRows] = await this.db.execute<any[]>(
      'SELECT phone FROM user_account WHERE id = ?',
      [inviterId],
    );
    if (selfRows.length > 0 && selfRows[0].phone === phone) {
      throw new ConflictException('不能邀请自己');
    }

    // 检查该手机号是否已有 active/pending 记录（两种情况）
    // 1) 已注册用户通过 user_account.phone 关联
    // 2) 尚未注册通过 invite_phone 直接关联
    const [existing] = await this.db.execute<any[]>(
      `SELECT fm.id, fm.status FROM family_member fm
       LEFT JOIN user_account ua ON fm.user_id = ua.id
       WHERE fm.family_id = ?
         AND fm.status IN ('pending', 'active')
         AND (fm.invite_phone = ? OR ua.phone = ?)`,
      [familyId, phone, phone],
    );

    if (existing.length > 0) {
      const status = existing[0].status;
      if (status === 'active') {
        throw new ConflictException('该成员已在家庭中');
      } else {
        throw new ConflictException('已邀请，等待对方登录接受');
      }
    }

    // 创建 pending 记录（user_id=NULL，待登录激活）
    const memberId = uuidv4();
    await this.db.execute(
      `INSERT INTO family_member (id, family_id, user_id, role, status, invite_phone, invited_by)
       VALUES (?, ?, NULL, 'member', 'pending', ?, ?)`,
      [memberId, familyId, phone, inviterId],
    );

    return { memberId, status: 'pending' };
  }

  /**
   * 激活该手机号下所有 pending 邀请
   *
   * 在用户登录/注册成功后调用。
   * 将 invite_phone=phone、status='pending' 的记录更新为 user_id=userId、status='active'。
   *
   * @returns 被激活的家庭 ID 列表（供前端判断是否需要展示切换引导）
   */
  async activatePendingInvites(userId: string, phone: string): Promise<string[]> {
    // 查找待激活的 pending 记录
    const [pending] = await this.db.execute<any[]>(
      `SELECT id, family_id FROM family_member
       WHERE invite_phone = ? AND status = 'pending' AND user_id IS NULL`,
      [phone],
    );

    if (pending.length === 0) return [];

    // 批量激活
    await this.db.execute(
      `UPDATE family_member
       SET user_id = ?, status = 'active', joined_at = NOW()
       WHERE invite_phone = ? AND status = 'pending' AND user_id IS NULL`,
      [userId, phone],
    );

    return pending.map((r: any) => r.family_id as string);
  }

  /**
   * 移除家庭成员（仅 Owner 可操作，不可移除自身）
   * memberId 为 family_member.id
   */
  async removeMember(familyId: string, memberId: string, operatorUserId: string) {
    // 校验目标成员存在且属于该家庭
    const [rows] = await this.db.execute<any[]>(
      'SELECT id, user_id, role, status FROM family_member WHERE id = ? AND family_id = ?',
      [memberId, familyId],
    );
    if (rows.length === 0) {
      throw new NotFoundException('成员不存在');
    }

    const target = rows[0];

    // 不可移除创建者
    if (target.role === 'owner') {
      throw new ForbiddenException('不可移除家庭创建者');
    }

    // 不可移除自身
    if (target.user_id === operatorUserId) {
      throw new ForbiddenException('不可移除自身');
    }

    // 软删除（status='left' 表示已离开）
    await this.db.execute(
      "UPDATE family_member SET status = 'left' WHERE id = ?",
      [memberId],
    );

    return { success: true };
  }

  /**
   * 生成（刷新）邀请码
   * @deprecated 已被手机号邀请流程替代，保留接口用于兼容旧版本
   */
  async createInviteCode(familyId: string): Promise<{ code: string }> {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    await this.db.execute(
      `UPDATE family_group SET invite_code = ? WHERE id = ?`,
      [code, familyId],
    );
    return { code };
  }

  /**
   * 今日记录聚合（多类型时间轴）
   * 合并喂养/睡眠/尿布/活动/健康/症状/生长/医疗记录，按时间倒序排列
   *
   * 每条记录携带 detail JSON 对象，包含该类型的关键摘要字段，
   * 供前端 getRecordSummary() 直接消费，无需额外请求。
   */
  async getTodayRecords(familyId: string, date?: string) {
    // 先取 baby_id（MVP: 每家庭 1 个宝宝）
    const [babies] = await this.db.execute<any[]>(
      'SELECT id FROM baby_profile WHERE family_id = ? LIMIT 1',
      [familyId],
    );
    if (babies.length === 0) return [];
    const babyId = babies[0].id;

    // 若传入 date 且格式合法（YYYY-MM-DD），使用传入日期；否则默认今日
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    let dateStr: string;
    if (date && dateRegex.test(date)) {
      dateStr = date;
    } else {
      const today = new Date();
      dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    }

    // feeding: 四张子表 UNION，各自携带类型标记和关键摘要
    const sql = `
      SELECT 'feeding' AS type, id, record_time AS time, note,
        JSON_OBJECT(
          'feed_type',    'breast',
          'breast_side',  breast_side,
          'duration_min', duration_min
        ) AS detail
      FROM feeding_breast_record WHERE baby_id = ? AND DATE(record_time) = ?
      UNION ALL
      SELECT 'feeding' AS type, id, record_time AS time, note,
        JSON_OBJECT(
          'feed_type',  'formula',
          'formula_ml', formula_ml
        ) AS detail
      FROM feeding_formula_record WHERE baby_id = ? AND DATE(record_time) = ?
      UNION ALL
      SELECT 'feeding' AS type, id, record_time AS time, note,
        JSON_OBJECT(
          'feed_type', 'complementary'
        ) AS detail
      FROM feeding_food_record WHERE baby_id = ? AND DATE(record_time) = ?
      UNION ALL
      SELECT 'feeding' AS type, id, record_time AS time, note,
        JSON_OBJECT(
          'feed_type',        'supplement',
          'supplement_items', supplement_items
        ) AS detail
      FROM feeding_supplement_record WHERE baby_id = ? AND DATE(record_time) = ?
      UNION ALL
      SELECT 'sleep' AS type, id, start_time AS time, note,
        JSON_OBJECT(
          'duration_min', duration_min,
          'sleep_period', sleep_period,
          'quality',      quality,
          'status',       status
        ) AS detail
      FROM sleep_record WHERE baby_id = ? AND DATE(start_time) = ?
      UNION ALL
      SELECT 'diaper' AS type, id, record_time AS time, note,
        JSON_OBJECT(
          'diaper_type',  diaper_type,
          'poop_type',    poop_type,
          'diaper_count', diaper_count
        ) AS detail
      FROM diaper_record WHERE baby_id = ? AND DATE(record_time) = ?
      UNION ALL
      SELECT 'activity' AS type, id, record_time AS time, note,
        JSON_OBJECT(
          'activity_type', activity_type,
          'duration_min',  duration_min,
          'intensity',     intensity
        ) AS detail
      FROM activity_record WHERE baby_id = ? AND DATE(record_time) = ?
      UNION ALL
      SELECT 'health' AS type, id, record_time AS time, note,
        JSON_OBJECT(
          'temperature',      temperature,
          'skin_care',        skin_care,
          'allergy_symptoms', allergy_symptoms,
          'allergy_severity', allergy_severity,
          'medications',      medications
        ) AS detail
      FROM health_record WHERE baby_id = ? AND DATE(record_time) = ?
      UNION ALL
      SELECT 'symptom' AS type, id, record_time AS time, note,
        JSON_OBJECT(
          'spirit',   spirit,
          'mood',     mood,
          'symptoms', symptoms
        ) AS detail
      FROM symptom_record WHERE baby_id = ? AND DATE(record_time) = ?
      UNION ALL
      SELECT 'growth' AS type, id, record_date AS time, note,
        JSON_OBJECT(
          'height_mm', height_mm,
          'weight_g',  weight_g,
          'head_mm',   head_mm
        ) AS detail
      FROM growth_record WHERE baby_id = ? AND record_date = ?
      UNION ALL
      SELECT 'medical' AS type, id, visit_date AS time, note,
        JSON_OBJECT(
          'hospital',  hospital,
          'diagnosis', diagnosis
        ) AS detail
      FROM medical_record WHERE baby_id = ? AND visit_date = ?
      ORDER BY time DESC
    `;

    const params = [
      babyId, dateStr,  // feeding_breast_record
      babyId, dateStr,  // feeding_formula_record
      babyId, dateStr,  // feeding_food_record
      babyId, dateStr,  // feeding_supplement_record
      babyId, dateStr,  // sleep
      babyId, dateStr,  // diaper
      babyId, dateStr,  // activity
      babyId, dateStr,  // health
      babyId, dateStr,  // symptom
      babyId, dateStr,  // growth
      babyId, dateStr,  // medical
    ];

    const [rows] = await this.db.execute<any[]>(sql, params);

    return rows.map((row) => {
      let detail: Record<string, unknown> = {};
      if (row.detail) {
        const parsed = typeof row.detail === 'string' ? JSON.parse(row.detail) : row.detail;
        // supplement_items 是 feeding_supplement_record 中的 JSON 列，MySQL 驱动可能以字符串返回
        // 仅当 parsed 里本身有该字段时才做 JSON 解析，避免其他类型记录多出 null 字段
        if (Object.prototype.hasOwnProperty.call(parsed, 'supplement_items')) {
          detail = { ...parsed, supplement_items: this.tryParseJson(parsed.supplement_items) };
        } else if (Object.prototype.hasOwnProperty.call(parsed, 'medications')) {
          // health_record: medications / skin_care / allergy_symptoms 均为 JSON 列
          detail = {
            ...parsed,
            medications:      this.tryParseJson(parsed.medications),
            skin_care:        this.tryParseJson(parsed.skin_care),
            allergy_symptoms: this.tryParseJson(parsed.allergy_symptoms),
          };
        } else if (Object.prototype.hasOwnProperty.call(parsed, 'symptoms')) {
          // symptom_record: symptoms 为 JSON 列
          detail = { ...parsed, symptoms: this.tryParseJson(parsed.symptoms) };
        } else {
          detail = { ...parsed };
        }
      }
      return { ...row, detail };
    });
  }

  /** 安全 JSON 解析辅助（非字符串或 null 直接返回原值） */
  private tryParseJson(val: unknown): unknown {
    if (val == null) return null;
    if (typeof val !== 'string') return val;
    try { return JSON.parse(val); } catch { return val; }
  }

  /**
   * 通过邀请码加入家庭
   * @deprecated 已被手机号邀请流程替代
   */
  async joinByCode(userId: string, code: string) {
    const [rows] = await this.db.execute<any[]>(
      `SELECT id FROM family_group WHERE invite_code = ?`,
      [code],
    );

    if (rows.length === 0) {
      throw new NotFoundException('邀请码无效或已过期');
    }

    const familyId: string = rows[0].id;

    const [existing] = await this.db.execute<any[]>(
      'SELECT id FROM family_member WHERE family_id = ? AND user_id = ?',
      [familyId, userId],
    );

    if (existing.length > 0) {
      throw new ConflictException('您已经是该家庭的成员');
    }

    await this.db.execute(
      "INSERT INTO family_member (id, family_id, user_id, role, status) VALUES (?, ?, ?, 'member', 'active')",
      [uuidv4(), familyId, userId],
    );

    return { familyId };
  }
}