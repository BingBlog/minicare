# F12 · 家庭管理

> 功能 ID：P1-002  
> 优先级：P1  
> 状态：**已完成** ✅  
> 最后更新：2026-05-03（对齐小程序实际实现）
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

## 相关文件

- 成员管理面板：`minicare-mp/src/pages/profile/MembersModal.tsx`
- API 模块：`minicare-mp/src/api/family.ts`
- 服务端：`minicare-server/src/family/family.controller.ts`
- 服务逻辑：`minicare-server/src/family/family.service.ts`
- 角色守卫：`minicare-server/src/common/decorators/min-role.decorator.ts`
- DTO：`minicare-server/src/family/dto/create-family.dto.ts`
