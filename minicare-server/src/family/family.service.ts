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

      const familyId = uuidv4();
      await conn.execute(
        'INSERT INTO family_group (id, name, created_by) VALUES (?, ?, ?)',
        [familyId, dto.name, userId],
      );

      // 创建者加入家庭，role=0（OWNER）
      await conn.execute(
        'INSERT INTO family_member (family_id, user_id, role, status) VALUES (?, ?, 0, "active")',
        [familyId, userId],
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
   * 获取家庭成员列表
   */
  async getMembers(familyId: string) {
    const [rows] = await this.db.execute<any[]>(
      `SELECT fm.id, fm.role, fm.status, fm.joined_at,
              ua.id AS user_id, ua.name, ua.avatar_url
       FROM family_member fm
       JOIN user_account ua ON fm.user_id = ua.id
       WHERE fm.family_id = ? AND fm.status = 'active'
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
      `UPDATE family_group SET invite_code = ?, invite_code_expires_at = DATE_ADD(NOW(), INTERVAL 24 HOUR)
       WHERE id = ?`,
      [code, familyId],
    );
    return code;
  }

  /**
   * 通过邀请码加入家庭
   */
  async joinByCode(userId: string, code: string) {
    const [rows] = await this.db.execute<any[]>(
      `SELECT id FROM family_group 
       WHERE invite_code = ? AND invite_code_expires_at > NOW()`,
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

    await this.db.execute(
      'INSERT INTO family_member (family_id, user_id, role, status) VALUES (?, ?, 2, "active")',
      [familyId, userId],
    );

    return { familyId };
  }
}
