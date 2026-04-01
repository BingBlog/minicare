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
   * 生成（刷新）邀请码（6 位随机大写字母数字，调用后旧码立即失效）
   * TODO: 生产阶段可改为存储到 Redis 并设置 TTL
   *
   * @returns { code: string } 前端期望的响应结构
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
   *
   * 注意：
   *  - feed_type / breast_side / sleep status 在 DB 中存整数，此处用 CASE WHEN 转回字符串
   *  - milk_types / milk_scoops / supplement_items 是 JSON 字符串，通过 JSON_OBJECT 嵌套后
   *    仍为字符串，Service 层统一对 detail 做 JSON.parse
   */
  async getTodayRecords(familyId: string) {
    // 先取 baby_id（MVP: 每家庭 1 个宝宝）
    const [babies] = await this.db.execute<any[]>(
      'SELECT id FROM baby_profile WHERE family_id = ? LIMIT 1',
      [familyId],
    );
    if (babies.length === 0) return [];
    const babyId = babies[0].id;

    // 全链路使用北京时间（CST），数据库连接已配置 timezone: '+08:00'
    // DATE(field) 直接按 CST 截取日期，与 dateStr 完全一致，无需时区换算
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const sql = `
      SELECT 'feeding' AS type, id, record_time AS time, note,
        JSON_OBJECT(
          'feed_type',          CASE feed_type WHEN 1 THEN 'breast' WHEN 2 THEN 'formula' WHEN 3 THEN 'complementary' ELSE NULL END,
          'formula_ml',         formula_ml,
          'milk_types',         milk_types,
          'milk_scoops',        milk_scoops,
          'breast_side',        CASE breast_side WHEN 1 THEN 'left' WHEN 2 THEN 'right' WHEN 3 THEN 'both' ELSE NULL END,
          'duration_min',       duration_min,
          'complementary_food', complementary_food,
          'supplement_items',   supplement_items
        ) AS detail
      FROM feeding_record WHERE baby_id = ? AND DATE(record_time) = ?
      UNION ALL
      SELECT 'sleep' AS type, id, start_time AS time, note,
        JSON_OBJECT(
          'duration_min',  duration_min,
          'sleep_period',  sleep_period,
          'quality',       quality,
          'status',        CASE status WHEN 1 THEN 'ongoing' ELSE 'ended' END
        ) AS detail
      FROM sleep_record WHERE baby_id = ? AND DATE(start_time) = ?
      UNION ALL
      SELECT 'diaper' AS type, id, record_time AS time, note,
        JSON_OBJECT(
          'diaper_type',  CASE diaper_type WHEN 1 THEN 'wet' WHEN 2 THEN 'dirty' WHEN 3 THEN 'mixed' WHEN 4 THEN 'dry' ELSE NULL END,
          'poop_type',    poop_type,
          'diaper_count', diaper_count
        ) AS detail
      FROM diaper_record WHERE baby_id = ? AND DATE(record_time) = ?
      UNION ALL
      SELECT 'activity' AS type, id, record_time AS time, note,
        JSON_OBJECT(
          'activity_type', CASE activity_type WHEN 1 THEN 'bath' WHEN 2 THEN 'outdoor' WHEN 3 THEN 'play' WHEN 4 THEN 'tummy_time' WHEN 5 THEN 'other' ELSE NULL END,
          'duration_min',  duration_min,
          'intensity',     intensity
        ) AS detail
      FROM activity_record WHERE baby_id = ? AND DATE(record_time) = ?
      UNION ALL
      SELECT 'health' AS type, id, record_time AS time, note,
        JSON_OBJECT(
          'temperature', temperature,
          'mood',        CASE mood WHEN 1 THEN 'happy' WHEN 2 THEN 'neutral' WHEN 3 THEN 'fussy' WHEN 4 THEN 'crying' ELSE NULL END
        ) AS detail
      FROM health_record WHERE baby_id = ? AND DATE(record_time) = ?
      UNION ALL
      SELECT 'symptom' AS type, id, record_time AS time, note,
        JSON_OBJECT(
          'spirit', spirit,
          'mood',   mood
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

    // mysql2 不自动解析 JSON 列，手动 parse detail 字段
    // milk_types / milk_scoops / supplement_items 也是 JSON 字符串，嵌套在 detail 内，同样需要解析
    return rows.map((row) => {
      let detail: Record<string, unknown> = {};
      if (row.detail) {
        const parsed = typeof row.detail === 'string' ? JSON.parse(row.detail) : row.detail;
        // 对 detail 内部的 JSON 字符串字段再次解析（feeding 专有字段）
        detail = {
          ...parsed,
          milk_types:       this.tryParseJson(parsed.milk_types),
          milk_scoops:      this.tryParseJson(parsed.milk_scoops),
          supplement_items: this.tryParseJson(parsed.supplement_items),
        };
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
