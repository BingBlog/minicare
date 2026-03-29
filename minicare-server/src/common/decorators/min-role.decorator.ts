import { SetMetadata } from '@nestjs/common';

/**
 * 家庭成员角色枚举
 * 与数据库 family_member.role 字段对应
 */
export enum FamilyRole {
  OWNER  = 0,   // 创建者
  EDITOR = 1,   // 编辑者（可以增删改）
  VIEWER = 2,   // 查看者（只读）
}

export const MIN_ROLE_KEY = 'minRole';

/**
 * @MinRole(FamilyRole.EDITOR) — 声明该路由所需的最低角色
 *
 * 配合 RoleGuard 使用。数值越小权限越高（0 > 1 > 2）。
 *
 * 使用示例：
 * @Post()
 * @UseGuards(JwtGuard, FamilyMemberGuard, RoleGuard)
 * @MinRole(FamilyRole.EDITOR)
 * create(@Body() dto: CreateFeedingDto) { ... }
 */
export const MinRole = (role: FamilyRole) => SetMetadata(MIN_ROLE_KEY, role);
