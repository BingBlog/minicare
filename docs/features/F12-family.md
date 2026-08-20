# F12 · 家庭管理

> 功能 ID：P1-002  
> 优先级：P1  
> 状态：**已完成** ✅  
> 最后更新：2026-08-20（解散家庭改为**软删除**：标记 deleted_at + 成员标 left，保留历史数据，Migration 012）
>
> **来源**：MVP-PRD.md §3.2.1  
> 功能 ID：P1-002  
> 优先级：P1  
> 最后同步：2026-08-20（更新：解散家庭改为软删除）
>
> **数据库架构**（Migration 008）：role 和 status 均为 VARCHAR 类型。
> 邀请机制已从"邀请码"升级为"手机号邀请"。

## 功能描述

家庭是 minicare 的核心协作单元。一个家庭可关联多个宝宝和多名照护者，所有家庭成员共享宝宝记录数据。

**平台实现**：微信小程序（主平台），数据通过 REST API 管理。

## 角色系统

| 枚举值 | 中文标签 | 权限 |
|--------|----------|------|
| `owner` | 创建者 | 管理成员、邀请/移除成员、删除家庭 |
| `member` | 成员 | 增删改查所有记录 |

权重：owner(1) > member(2)，通过 `@MinRole()` 装饰器 + `RoleGuard` 实现接口权限控制。

## 成员状态

| 枚举值 | 说明 |
|--------|------|
| `active` | 已加入家庭，正常使用 |
| `pending` | 已被邀请，等待对方登录接受 |
| `left` | 已离开/被移除（软删除） |

## 邀请流程（手机号邀请）

1. Owner 在成员管理面板输入被邀请人手机号
2. 后端创建 `pending` 记录：`invite_phone` 设为手机号，`user_id = NULL`
3. 被邀请人通过手机号注册/登录后，自动触发 `activatePendingInvites()`
4. 系统将匹配手机号的 pending 记录 → 设置 `user_id`、状态改为 `active`

> 注：旧版邀请码流程已废弃。

## 后端 API

| 端点 | 方法 | 角色要求 | 说明 |
|------|------|----------|------|
| `/api/family` | POST | JWT | 创建家庭 |
| `/api/family/mine` | GET | JWT | 获取我的家庭列表 |
| `/api/family/:familyId/members` | GET | FamilyMember | 获取成员列表（含 pending） |
| `/api/family/:familyId/invite-by-phone` | POST | Owner | 按手机号邀请成员 |
| `/api/family/:familyId/members/:memberId` | DELETE | Owner | 移除成员/撤销邀请 |
| `/api/family/:familyId/records/today` | GET | FamilyMember | 今日记录聚合（首页时间轴） |
| `/api/family/:familyId` | DELETE | Owner | **解散家庭**（级联删除全部宝宝和记录） |

## 解散家庭

在"家庭成员管理"弹层（`MembersModal`）底部提供「解散家庭」入口，**仅家庭创建者（owner）可见**：

- 点击后弹出二次确认，提示家庭内所有宝宝档案和全部记录将**不再显示，历史数据归档保留**
- 确认后调用 `DELETE /api/family/:familyId`
- **软删除原则（Migration 012）**：服务端**事务内仅做标记，不物理删除任何数据**：
  1. `family_group.deleted_at = NOW()`（家庭不可见）
  2. 家庭下所有宝宝 `baby_profile.deleted_at = NOW()`（宝宝不可见，记录全部保留）
  3. 全部成员 `family_member.status = 'left'`（复用既有软删除模式，含 pending 邀请）
- 所有记录数据原样保留；`FamilyMemberGuard` 校验 `fg.deleted_at IS NULL`，解散后成员访问任何家庭接口均被拦截（403）
- 删除成功后前端切换到其他家庭；若无其他家庭则清空当前状态
- 普通 member 调用返回 403（`@MinRole(OWNER)` 拦截）

> 背景：用户被邀请加入其他家庭后，自己创建的家庭已无用，需要能解散；软删除保证误删可恢复、历史数据不丢失。

## DTO

**CreateFamilyDto**：
- `name: string`（@MinLength(2) @MaxLength(20)）— 家庭名称

**InviteByPhoneDto**：
- `phone: string`（@Matches(/^1[3-9]\d{9}$/)）— 中国大陆手机号

## 数据库表

**family_group**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | CHAR(36) | UUID |
| `name` | VARCHAR(20) | 家庭名称 |
| `created_by` | CHAR(36) | 创建者 user_id |
| `created_at` | DATETIME | 创建时间 |

**family_member**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | CHAR(36) | UUID |
| `family_id` | CHAR(36) | 关联 family_group.id |
| `user_id` | CHAR(36) | 关联 user_account.id（pending 时为 NULL） |
| `role` | VARCHAR(10) | owner / member |
| `status` | VARCHAR(10) | active / pending / left |
| `invite_phone` | VARCHAR(20) | 被邀请人手机号 |
| `joined_at` | DATETIME | 加入时间 |

## 前端入口

家庭管理通过 **Profile 页**（`我的`标签页）进入：
- `MembersModal.tsx`：底部弹出面板，展示当前成员列表 + pending 邀请 + 邀请输入框
- Owner 可看到移除按钮和邀请入口
- 普通 Member 只能查看成员列表

## 自动创建家庭

新用户注册后进入 Onboarding 流程时，系统自动创建家庭（`name` 来自用户昵称 + "的家庭"），用户成为 owner。无需手动创建家庭步骤。

## 验收标准（AC）

- [x] 新用户 onboarding 自动创建家庭
- [x] Owner 可通过手机号邀请成员
- [x] Pending 状态成员在列表中标示"等待加入"
- [x] 被邀请人登录后自动激活
- [x] Owner 可移除成员/撤销邀请
- [x] 非 Owner 不可见管理操作
- [x] 家庭成员共享所有宝宝记录
- [x] Owner 可解散家庭（二次确认 + 软删除标记，数据归档保留）
- [x] 非 Owner（member）调用解散接口返回 403
- [x] 解散后成员访问家庭接口被拦截（403）

## 相关文件

- 成员管理面板：`minicare-mp/src/pages/profile/MembersModal.tsx`
- API 模块：`minicare-mp/src/api/family.ts`
- 服务端：`minicare-server/src/family/family.controller.ts`
- 服务逻辑：`minicare-server/src/family/family.service.ts`
- 角色守卫：`minicare-server/src/common/decorators/min-role.decorator.ts`
- DTO：`minicare-server/src/family/dto/create-family.dto.ts`
