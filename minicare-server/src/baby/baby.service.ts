import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_POOL } from '../common/database/database.module';
import { CreateBabyDto } from './dto/create-baby.dto';
import { GENDER_TO_INT, GENDER_TO_STR } from '../app-config/app-config.data';

@Injectable()
export class BabyService {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  /**
   * 在家庭下创建宝宝档案（MVP 每家庭限 1 个宝宝）
   */
  async createBaby(familyId: string, createdBy: string, dto: CreateBabyDto) {
    // MVP 阶段：每家庭限 1 个宝宝
    const [existing] = await this.db.execute<any[]>(
      'SELECT id FROM baby_profile WHERE family_id = ?',
      [familyId],
    );
    if (existing.length > 0) {
      throw new ConflictException('MVP 阶段每个家庭只能创建一个宝宝档案');
    }

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
        GENDER_TO_INT[dto.gender] ?? 0,
        allergyTypesJson,
        dto.allergy_level ?? null,
        dto.birth_weight_g ?? null,
        dto.birth_height_cm ?? null,
        createdBy,
      ],
    );

    return this.getBabyByFamily(familyId);
  }

  /**
   * 获取家庭的宝宝档案（MVP 返回第一个）
   */
  async getBabyByFamily(familyId: string) {
    const [rows] = await this.db.execute<any[]>(
      `SELECT id, family_id, name, birth_date, gender,
              allergy_types, allergy_level,
              birth_weight_g, birth_height_cm,
              avatar_url, created_at
       FROM baby_profile WHERE family_id = ? LIMIT 1`,
      [familyId],
    );
    if (rows.length === 0) throw new NotFoundException('尚未创建宝宝档案');

    const baby = rows[0];
    // allergy_types 存的是 JSON 字符串，需解析
    if (typeof baby.allergy_types === 'string') {
      try { baby.allergy_types = JSON.parse(baby.allergy_types); } catch { baby.allergy_types = []; }
    }
    // gender TINYINT → 字符串
    baby.gender = GENDER_TO_STR[baby.gender] ?? 'unknown';
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
       FROM baby_profile WHERE id = ? AND family_id = ?`,
      [babyId, familyId],
    );
    if (rows.length === 0) throw new NotFoundException('宝宝档案不存在');

    const baby = rows[0];
    if (typeof baby.allergy_types === 'string') {
      try { baby.allergy_types = JSON.parse(baby.allergy_types); } catch { baby.allergy_types = []; }
    }
    baby.gender = GENDER_TO_STR[baby.gender] ?? 'unknown';
    return baby;
  }

  /**
   * 更新宝宝档案（可选字段，任意组合）
   */
  async updateBaby(babyId: string, familyId: string, dto: Partial<CreateBabyDto>) {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (dto.name !== undefined)            { fields.push('name = ?');            values.push(dto.name); }
    if (dto.birth_date !== undefined)      { fields.push('birth_date = ?');      values.push(dto.birth_date); }
    if (dto.gender !== undefined)          { fields.push('gender = ?');          values.push(GENDER_TO_INT[dto.gender] ?? 0); }
    if (dto.allergy_types !== undefined)   { fields.push('allergy_types = ?');   values.push(JSON.stringify(dto.allergy_types)); }
    if (dto.allergy_level !== undefined)   { fields.push('allergy_level = ?');   values.push(dto.allergy_level); }
    if (dto.birth_weight_g !== undefined)  { fields.push('birth_weight_g = ?');  values.push(dto.birth_weight_g); }
    if (dto.birth_height_cm !== undefined) { fields.push('birth_height_cm = ?'); values.push(dto.birth_height_cm); }

    if (fields.length === 0) return this.getBabyById(babyId, familyId);

    values.push(babyId, familyId);
    await this.db.execute(
      `UPDATE baby_profile SET ${fields.join(', ')} WHERE id = ? AND family_id = ?`,
      values,
    );

    return this.getBabyById(babyId, familyId);
  }
}
