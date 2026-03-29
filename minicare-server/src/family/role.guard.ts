import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FamilyRole, MIN_ROLE_KEY } from '../common/decorators/min-role.decorator';
import { FamilyContext } from './family-member.guard';

/**
 * RoleGuard — 验证当前家庭成员角色是否满足最低要求
 *
 * 依赖 FamilyMemberGuard 已将 FamilyContext 注入 request.familyContext。
 * 读取路由装饰器 @MinRole(FamilyRole.EDITOR) 的元数据进行比较。
 *
 * 规则：role 值越小权限越高（OWNER=0 > EDITOR=1 > VIEWER=2）
 *
 * 使用方式（顺序不可颠倒）：
 * @UseGuards(JwtGuard, FamilyMemberGuard, RoleGuard)
 * @MinRole(FamilyRole.EDITOR)
 */
@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const minRole = this.reflector.getAllAndOverride<FamilyRole>(MIN_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // 路由未声明 @MinRole，默认放行（只需是成员即可）
    if (minRole === undefined) return true;

    const request = context.switchToHttp().getRequest();
    const familyCtx: FamilyContext = request.familyContext;

    // role 数值越小权限越高，要求 EDITOR(1) 则 role <= 1 才通过
    if (familyCtx.role > minRole) {
      throw new ForbiddenException('您的角色权限不足以执行此操作');
    }

    return true;
  }
}
