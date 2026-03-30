import {
  ConflictException,
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
   * 创建家庭，创建者自动成为 OWNER（role=0）
   */
  async createFamily(userId: string, dto: CreateFamilyDto) {
    const conn = await this.db.getConnection();
    try {
      await conn.beginTransaction();

      const familyId   = uuidv4();
      const memberId   = uuidv4();
      // 生成初始邀请码（6 位大写字母数字）
      const inviteCode = Math.random().toString(36).slice(2, 8).toUpperCase();

      await conn.execute(
        'INSERT INTO family_group (id, name, invite_code, created_by) VALUES (?, ?, ?, ?)',
        [familyId, dto.name, inviteCode, userId],
      );

      // 创建者加入家庭，role=1（owner），status=2（active）
      // DDL: role TINYINT  1=owner 2=member
      await conn.execute(
        'INSERT INTO family_member (id, family_id, user_id, role, status) VALUES (?, ?, ?, 1, 2)',
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
       WHERE fm.user_id = ? AND fm.status = 2
       ORDER BY fg.created_at DESC`,
      [userId],
    );
    return rows;
  }

  /**
   * 获取家庭成员列表
   */
  async getMembers(familyId: string) {
    const [rows] = await this.db.execute<any[]>(
      `SELECT fm.id, fm.role, fm.status, fm.joined_at,
              ua.id AS user_id, ua.nickname AS name, ua.avatar_url
       FROM family_member fm
       JOIN user_account ua ON fm.user_id = ua.id
       WHERE fm.family_id = ? AND fm.status = 2
       ORDER BY fm.role ASC, fm.joined_at ASC`,
      [familyId],
    );
    return rows;
  }

  /**
   * 生成邀请码（简单实现：6 位随机字母数字，有效期 24h）
   * TODO: 生产阶段可改为存储到 Redis 并设置 TTL
   */
  async createInviteCode(familyId: string): Promise<string> {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    await this.db.execute(
      `UPDATE family_group SET invite_code = ? WHERE id = ?`,
      [code, familyId],
    );
    return code;
  }

  /**
   * 今日记录聚合（多类型时间轴）
   * 合并喂养/睡眠/尿布/活动/健康/症状记录，按时间倒序排列
   */
  async getTodayRecords(familyId: string) {
    // 先取 baby_id（MVP: 每家庭 1 个宝宝）
    const [babies] = await this.db.execute<any[]>(
      'SELECT id FROM baby_profile WHERE family_id = ? LIMIT 1',
      [familyId],
    );
    if (babies.length === 0) return [];
    const babyId = babies[0].id;

    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10); // 'YYYY-MM-DD'

    const sql = `
      SELECT 'feeding'  AS type, id, record_time AS time, note FROM feeding_record
        WHERE baby_id = ? AND DATE(record_time) = ?
      UNION ALL
      SELECT 'sleep'    AS type, id, start_time  AS time, note FROM sleep_record
        WHERE baby_id = ? AND DATE(start_time)  = ?
      UNION ALL
      SELECT 'diaper'   AS type, id, record_time AS time, note FROM diaper_record
        WHERE baby_id = ? AND DATE(record_time) = ?
      UNION ALL
      SELECT 'activity' AS type, id, record_time AS time, note FROM activity_record
        WHERE baby_id = ? AND DATE(record_time) = ?
      UNION ALL
      SELECT 'health'   AS type, id, record_time AS time, note FROM health_record
        WHERE baby_id = ? AND DATE(record_time) = ?
      UNION ALL
      SELECT 'symptom'  AS type, id, record_time AS time, note FROM symptom_record
        WHERE baby_id = ? AND DATE(record_time) = ?
      UNION ALL
      SELECT 'growth'   AS type, id, record_date AS time, note FROM growth_record
        WHERE baby_id = ? AND record_date = ?
      UNION ALL
      SELECT 'medical'  AS type, id, visit_date  AS time, note FROM medical_record
        WHERE baby_id = ? AND visit_date  = ?
      ORDER BY time DESC
    `;

    const params = [
      babyId, dateStr,  // feeding
      babyId, dateStr,  // sleep
      babyId, dateStr,  // diaper
      babyId, dateStr,  // activity
      babyId, dateStr,  // health
      babyId, dateStr,  // symptom
      babyId, dateStr,  // growth
      babyId, dateStr,  // medical
    ];

    const [rows] = await this.db.execute<any[]>(sql, params);
    return rows;
  }

  /**
   * 通过邀请码加入家庭
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

    // 检查是否已是成员
    const [existing] = await this.db.execute<any[]>(
      'SELECT id FROM family_member WHERE family_id = ? AND user_id = ?',
      [familyId, userId],
    );

    if (existing.length > 0) {
      throw new ConflictException('您已经是该家庭的成员');
    }

    // 通过邀请码加入，role=2（member），status=2（active）
    await this.db.execute(
      'INSERT INTO family_member (id, family_id, user_id, role, status) VALUES (?, ?, ?, 2, 2)',
      [uuidv4(), familyId, userId],
    );

    return { familyId };
  }
}
