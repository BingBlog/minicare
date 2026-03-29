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

@Injectable()
export class BabyService {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  /**
   * 在家庭下创建宝宝档案（MVP 每家庭限 1 个宝宝）
   */
  async createBaby(familyId: string, dto: CreateBabyDto) {
    // MVP 阶段：每家庭限 1 个宝宝
    const [existing] = await this.db.execute<any[]>(
      'SELECT id FROM baby_profile WHERE family_id = ?',
      [familyId],
    );
    if (existing.length > 0) {
      throw new ConflictException('MVP 阶段每个家庭只能创建一个宝宝档案');
    }

    const babyId = uuidv4();
    await this.db.execute(
      `INSERT INTO baby_profile (id, family_id, name, birth_date, gender, birth_weight_g, birth_height_cm)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        babyId,
        familyId,
        dto.name,
        dto.birth_date,
        dto.gender,
        dto.birth_weight_g ?? null,
        dto.birth_height_cm ?? null,
      ],
    );

    return { id: babyId, ...dto, family_id: familyId };
  }

  /**
   * 获取家庭的宝宝档案（MVP 返回第一个）
   */
  async getBabyByFamily(familyId: string) {
    const [rows] = await this.db.execute<any[]>(
      `SELECT id, family_id, name, birth_date, gender, birth_weight_g, birth_height_cm, avatar_url, created_at
       FROM baby_profile WHERE family_id = ? LIMIT 1`,
      [familyId],
    );
    if (rows.length === 0) throw new NotFoundException('尚未创建宝宝档案');
    return rows[0];
  }

  /**
   * 按 baby_id 获取（同时验证属于该家庭）
   */
  async getBabyById(babyId: string, familyId: string) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT * FROM baby_profile WHERE id = ? AND family_id = ?',
      [babyId, familyId],
    );
    if (rows.length === 0) throw new NotFoundException('宝宝档案不存在');
    return rows[0];
  }
}
