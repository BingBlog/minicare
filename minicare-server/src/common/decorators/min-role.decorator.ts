import { SetMetadata } from '@nestjs/common';

/**
 * 家庭成员角色枚举
 * 与数据库 family_member.role 字段对应
 * DDL: role TINYINT  1=owner 2=member
 *
 * 规则：role 数值越小权限越高（OWNER=1 > MEMBER=2）
 */
export enum FamilyRole {
  OWNER  = 1,  // 创建者（可管理成员、删除家庭）
  MEMBER = 2,  // 普通成员（可增删改记录）
}

export const MIN_ROLE_KEY = 'minRole';

/**
 * @MinRole(FamilyRole.OWNER) — 声明该路由所需的最低角色
 *
 * 配合 RoleGuard 使用。数值越小权限越高（1 > 2）。
 *
 * 使用示例：
 * @Delete(':id')
 * @UseGuards(JwtGuard, FamilyMemberGuard, RoleGuard)
 * @MinRole(FamilyRole.OWNER)
 * remove() { ... }
 */
export const MinRole = (role: FamilyRole) => SetMetadata(MIN_ROLE_KEY, role);
