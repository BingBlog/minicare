import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_POOL } from '../common/database/database.module';
import { CreateBabyDto } from './dto/create-baby.dto';

@Injectable()
export class BabyService {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  async createBaby(familyId: string, createdBy: string, dto: CreateBabyDto) {
    const babyId = uuidv4();
    const allergyTypesJson = dto.allergy_types?.length
      ? JSON.stringify(dto.allergy_types)
      : null;

    await this.db.execute(
      `INSERT INTO baby_profile
         (id, family_id, name, birth_date, gender,
          allergy_types, allergy_level,
          birth_weight_g, birth_height_cm, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        babyId,
        familyId,
        dto.name,
        dto.birth_date,
        dto.gender ?? 'unknown',  // DDL: VARCHAR(10)，直接存字符串
        allergyTypesJson,
        dto.allergy_level ?? null,
        dto.birth_weight_g ?? null,
        dto.birth_height_cm ?? null,
        createdBy,
      ],
    );

    return this.getBabyById(babyId, familyId);
  }

  async listBabies(familyId: string) {
    const [rows] = await this.db.execute<any[]>(
      `SELECT id, family_id, name, birth_date, gender,
              allergy_types, allergy_level,
              birth_weight_g, birth_height_cm,
              avatar_url, created_at
       FROM baby_profile WHERE family_id = ? AND deleted_at IS NULL ORDER BY created_at ASC`,
      [familyId],
    );
    return rows.map((baby: any) => {
      if (typeof baby.allergy_types === 'string') {
        try { baby.allergy_types = JSON.parse(baby.allergy_types); } catch { baby.allergy_types = []; }
      }
      if (!['male', 'female', 'unknown'].includes(baby.gender)) {
        baby.gender = 'unknown';
      }
      return baby;
    });
  }

  async getBabyByFamily(familyId: string) {
    const [rows] = await this.db.execute<any[]>(
      `SELECT id, family_id, name, birth_date, gender,
              allergy_types, allergy_level,
              birth_weight_g, birth_height_cm,
              avatar_url, created_at
       FROM baby_profile WHERE family_id = ? AND deleted_at IS NULL LIMIT 1`,
      [familyId],
    );
    if (rows.length === 0) throw new NotFoundException('尚未创建宝宝档案');

    const baby = rows[0];
    // allergy_types 存的是 JSON 字符串，需解析
    if (typeof baby.allergy_types === 'string') {
      try { baby.allergy_types = JSON.parse(baby.allergy_types); } catch { baby.allergy_types = []; }
    }
    // gender 已是 VARCHAR，直接返回（兼容旧数据：数字字符串 fallback to 'unknown'）
    if (!['male', 'female', 'unknown'].includes(baby.gender)) {
      baby.gender = 'unknown';
    }
    return baby;
  }

  /**
   * 按 baby_id 获取（同时验证属于该家庭）
   */
  async getBabyById(babyId: string, familyId: string) {
    const [rows] = await this.db.execute<any[]>(
      `SELECT id, family_id, name, birth_date, gender,
              allergy_types, allergy_level,
              birth_weight_g, birth_height_cm,
              avatar_url, created_at
       FROM baby_profile WHERE id = ? AND family_id = ? AND deleted_at IS NULL`,
      [babyId, familyId],
    );
    if (rows.length === 0) throw new NotFoundException('宝宝档案不存在');

    const baby = rows[0];
    if (typeof baby.allergy_types === 'string') {
      try { baby.allergy_types = JSON.parse(baby.allergy_types); } catch { baby.allergy_types = []; }
    }
    if (!['male', 'female', 'unknown'].includes(baby.gender)) {
      baby.gender = 'unknown';
    }
    return baby;
  }

  /**
   * 更新宝宝档案（可选字段，任意组合）
   */
  async getMyBabies(userId: string) {
    const [rows] = await this.db.execute<any[]>(
      `SELECT bp.id, bp.family_id, bp.name, bp.birth_date, bp.gender,
              bp.allergy_types, bp.allergy_level,
              bp.birth_weight_g, bp.birth_height_cm,
              bp.avatar_url, bp.created_at,
              fg.name AS family_name,
              fm.role AS family_role
       FROM baby_profile bp
       JOIN family_member fm ON bp.family_id = fm.family_id
       JOIN family_group fg ON bp.family_id = fg.id
       WHERE fm.user_id = ? AND fm.status = 'active'
         AND bp.deleted_at IS NULL AND fg.deleted_at IS NULL
       ORDER BY bp.created_at ASC`,
      [userId],
    );
    return rows.map((baby: any) => {
      if (typeof baby.allergy_types === 'string') {
        try { baby.allergy_types = JSON.parse(baby.allergy_types); } catch { baby.allergy_types = []; }
      }
      if (!['male', 'female', 'unknown'].includes(baby.gender)) {
        baby.gender = 'unknown';
      }
      return baby;
    });
  }

  async updateBaby(babyId: string, familyId: string, dto: Partial<CreateBabyDto>) {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (dto.name !== undefined)            { fields.push('name = ?');            values.push(dto.name); }
    if (dto.birth_date !== undefined)      { fields.push('birth_date = ?');      values.push(dto.birth_date); }
    if (dto.gender !== undefined)          { fields.push('gender = ?');          values.push(dto.gender); } // 直接存 VARCHAR
    if (dto.allergy_types !== undefined)   { fields.push('allergy_types = ?');   values.push(JSON.stringify(dto.allergy_types)); }
    if (dto.allergy_level !== undefined)   { fields.push('allergy_level = ?');   values.push(dto.allergy_level); }
    if (dto.birth_weight_g !== undefined)  { fields.push('birth_weight_g = ?');  values.push(dto.birth_weight_g); }
    if (dto.birth_height_cm !== undefined) { fields.push('birth_height_cm = ?'); values.push(dto.birth_height_cm); }
    if (dto.avatar_url !== undefined)      { fields.push('avatar_url = ?');      values.push(dto.avatar_url ?? null); }

    if (fields.length === 0) return this.getBabyById(babyId, familyId);

    values.push(babyId, familyId);
    await this.db.execute(
      `UPDATE baby_profile SET ${fields.join(', ')} WHERE id = ? AND family_id = ?`,
      values,
    );

    return this.getBabyById(babyId, familyId);
  }

  /**
   * 删除宝宝档案（软删除，仅 Owner 可操作）
   *
   * 原则：全项目删除一律软删除，保留历史数据。
   * 仅标记 baby_profile.deleted_at = NOW()，该宝宝全部记录（feeding/sleep/.../
   * record_timeline 等）原样保留在库中；所有查询按 deleted_at IS NULL 过滤，
   * 前端不再展示。家庭解散时对家庭下所有宝宝执行同样的标记（family.service）。
   */
  async deleteBaby(babyId: string, familyId: string, operatorUserId: string) {
    const conn = await this.db.getConnection();
    try {
      await conn.beginTransaction();

      // 校验宝宝属于该家庭
      const [babyRows] = await conn.execute<any[]>(
        'SELECT id FROM baby_profile WHERE id = ? AND family_id = ? AND deleted_at IS NULL',
        [babyId, familyId],
      );
      if (babyRows.length === 0) {
        throw new NotFoundException('宝宝档案不存在');
      }

      // 校验当前用户是该家庭 owner
      const [memberRows] = await conn.execute<any[]>(
        `SELECT fm.role
         FROM family_member fm
         JOIN family_group fg ON fg.id = fm.family_id AND fg.deleted_at IS NULL
         WHERE fm.family_id = ? AND fm.user_id = ? AND fm.status = 'active'`,
        [familyId, operatorUserId],
      );
      if (memberRows.length === 0 || memberRows[0].role !== 'owner') {
        throw new ForbiddenException('仅家庭创建者可删除宝宝档案');
      }

      // 软删除：标记时间，不物理删除任何数据
      await conn.execute(
        'UPDATE baby_profile SET deleted_at = NOW() WHERE id = ?',
        [babyId],
      );

      await conn.commit();
      return { success: true };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
}
