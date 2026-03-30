import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_POOL } from '../../common/database/database.module';
import {
  CreateActivityDto,
  ACTIVITY_TYPE_TO_INT,
  INT_TO_ACTIVITY_TYPE,
} from './dto/create-activity.dto';

@Injectable()
export class ActivityService {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  async create(userId: string, dto: CreateActivityDto) {
    const id = uuidv4();
    await this.db.execute(
      `INSERT INTO activity_record (id, baby_id, recorded_by, record_time, activity_type, duration_min, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        dto.baby_id,
        userId,
        dto.record_time,
        ACTIVITY_TYPE_TO_INT[dto.activity_type] ?? 5,
        dto.duration_min ?? null,
        dto.note         ?? null,
      ],
    );
    return { id };
  }

  async findAll(babyId: string, limit = 20, offset = 0) {
    const [rows] = await this.db.execute<any[]>(
      'SELECT * FROM activity_record WHERE baby_id = ? ORDER BY record_time DESC LIMIT ? OFFSET ?',
      [babyId, limit, offset],
    );
    return rows.map((r) => ({
      ...r,
      activity_type: INT_TO_ACTIVITY_TYPE[r.activity_type] ?? r.activity_type,
    }));
  }

  async remove(id: string) {
    await this.db.execute('DELETE FROM activity_record WHERE id = ?', [id]);
    return { id };
  }
}
