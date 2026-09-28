import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { DATABASE_POOL } from '../common/database/database.module';

export interface FamilyContext {
  familyId: string;
  userId: string;
  /** DDL: family_member.role VARCHAR(10)  owner=创建者 member=普通成员 */
  role: string;
  memberId: string;
}

/**
 * FamilyMemberGuard — 验证当前用户是指定 family 的成员
 *
 * 从路由参数 :familyId 或请求 body 的 family_id 中读取 family_id，
 * 查询 family_member 表确认成员资格（status='active'），
 * 并将 FamilyContext 注入 request.familyContext。
 *
 * 必须在 JwtGuard 之后执行（依赖 request.user.sub）。
 */
@Injectable()
export class FamilyMemberGuard implements CanActivate {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId: string = request.user?.sub;
    const familyId: string =
      request.params?.familyId ?? request.body?.family_id ?? request.query?.family_id;

    if (!familyId) {
      throw new ForbiddenException('缺少 family_id 参数');
    }

    const [rows] = await this.db.execute<any[]>(
      `SELECT fm.id, fm.role
       FROM family_member fm
       JOIN family_group fg ON fg.id = fm.family_id AND fg.deleted_at IS NULL
       WHERE fm.family_id = ? AND fm.user_id = ? AND fm.status = 'active'`,
      [familyId, userId],
    );

    if (rows.length === 0) {
      throw new ForbiddenException('您不是该家庭的成员');
    }

    request.familyContext = {
      familyId,
      userId,
      role: rows[0].role,   // VARCHAR: 'owner' | 'member'
      memberId: rows[0].id,
    } satisfies FamilyContext;

    return true;
  }
}
