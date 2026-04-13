import { SetMetadata } from '@nestjs/common';

/**
 * 家庭成员角色枚举
 * DDL: family_member.role VARCHAR(10)  owner=创建者 member=普通成员
 * （Migration 008: TINYINT 1=owner/2=member → VARCHAR）
 *
 * 规则：OWNER 权限高于 MEMBER
 */
export enum FamilyRole {
  OWNER  = 'owner',   // 创建者（可管理成员、删除家庭）
  MEMBER = 'member',  // 普通成员（可增删改记录）
}

/** 角色权重映射（数值越小权限越高） */
export const FAMILY_ROLE_WEIGHT: Record<string, number> = {
  owner:  1,
  member: 2,
};

export const MIN_ROLE_KEY = 'minRole';

/**
 * @MinRole(FamilyRole.OWNER) — 声明该路由所需的最低角色
 *
 * 配合 RoleGuard 使用。OWNER 权限高于 MEMBER。
 *
 * 使用示例：
 * @Delete(':id')
 * @UseGuards(JwtGuard, FamilyMemberGuard, RoleGuard)
 * @MinRole(FamilyRole.OWNER)
 * remove() { ... }
 */
export const MinRole = (role: FamilyRole) => SetMetadata(MIN_ROLE_KEY, role);
