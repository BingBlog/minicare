# minicare MVP 发布前代码审查报告

> 审查日期：2026-04-14
> 审查范围：minicare-server（NestJS 后端）+ minicare-web（React 前端）
> 审查维度：安全性、数据完整性、架构分层、代码规范、健壮性

---

## 总览

| 优先级 | 条目 | 处置建议 |
|---|---|---|
| Critical（MVP 前必须修复） | S1-1 ~ S1-5（5 项）| 上线前必须修复 |
| High（MVP 前强烈建议修复） | S2-1 ~ S2-2（2 项）+ R1-1 ~ R1-3（3 项）| 上线前修复 |
| Medium（架构/规范，T+1 可接受） | S3-1 ~ S3-5, S4-1 ~ S4-5（10 项）+ R2-1 ~ R2-4（4 项）| 近期迭代处理 |
| Low（优化建议，后续迭代） | F1-1, F1-2, F2-1 ~ F2-3, F3-1 ~ F3-5（10 项）+ R3-1 ~ R3-5（5 项）| 排入 backlog |

---

## 一、后端（minicare-server）

### S1 — 安全性（Critical）

#### S1-1 JWT Secret 未配置时任意 Token 均可通过验证

**文件**：`src/auth/jwt.guard.ts:33`

当前代码中 `secret: process.env.JWT_SECRET`，若环境变量未设置则值为 `undefined`，`@nestjs/jwt` 底层将其视为空字符串 secret，攻击者可使用 `HS256 + empty-secret` 伪造任意有效 Token，所有鉴权接口均可绕过。

**修复**：在 `main.ts` bootstrap 顶部增加硬断言：
```typescript
if (!process.env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET 未配置，拒绝启动');
}
```

---

#### S1-2 AUTH_TEST_MODE 生产环境残留风险

**文件**：`src/auth/auth.service.ts:22-50`

若 CloudRun EnvParams 误配置 `AUTH_TEST_MODE=true`，任意手机号均可使用固定验证码 `123456` 直接登录生产账号，完全绕过 CloudBase 短信验证。

**修复**：在 `main.ts` bootstrap 中增加生产环境硬阻断：
```typescript
if (process.env.NODE_ENV === 'production' && process.env.AUTH_TEST_MODE === 'true') {
  throw new Error('FATAL: 生产环境禁止启用 AUTH_TEST_MODE');
}
```

---

#### S1-3 /health 端点泄露环境配置信息

**文件**：`src/main.ts:62-80`

`/health` 接口不需要鉴权，任何人可访问，但当前返回了 `auth_test_mode`、`jwt_set`、`env` 等配置状态，攻击者可据此判断是否存在测试模式入口。

**修复**：生产环境仅返回极简信息：
```typescript
if (process.env.NODE_ENV === 'production') {
  res.json({ status: 'ok' });
  return;
}
// 非生产环境保留诊断字段
```

---

#### S1-4 记录接口未校验 baby_id 属于当前 familyId（IDOR 越权读取）

**文件**：`src/records/feeding/feeding.controller.ts:26-33`，以及所有其他记录类型的 GET 接口

`FamilyMemberGuard` 只验证调用者是某家庭的成员，但 `baby_id` Query 参数未做归属校验。恶意用户可以合法加入家庭 A，然后传入家庭 B 的 `baby_id` 枚举家庭 B 的所有记录，属于 IDOR（Insecure Direct Object Reference）漏洞。

**影响范围**：feeding、sleep、diaper、activity、health、symptom、growth、medical 所有 GET 列表和详情接口。

**修复**：在各 service 的 `findAll` / `findOne` 入口增加归属校验，controller 传入 familyId：
```typescript
// service.findAll 开头
const [babyRows] = await this.db.execute<any[]>(
  'SELECT id FROM baby_profile WHERE id = ? AND family_id = ?',
  [babyId, familyId],
);
if (babyRows.length === 0) throw new ForbiddenException('无权访问该宝宝数据');
```

---

#### S1-5 activatePendingInvites 逻辑在 auth.service.ts 和 family.service.ts 中重复

**文件**：`src/auth/auth.service.ts:152-168` 和 `src/family/family.service.ts:144-163`

两处代码对 `family_member` 表做了完全相同的 UPDATE 操作，注释说"避免循环依赖"，但实质是制造了重复逻辑。未来 `FamilyService` 激活逻辑变更（如新增激活后通知）时，`AuthService` 版本不会自动同步，导致数据一致性风险。

**修复**：使用 `forwardRef` 打破循环依赖，或将激活逻辑提取到不依赖任何业务模块的独立 `InviteService`：
```typescript
// auth.module.ts
imports: [forwardRef(() => FamilyModule), ...]
// auth.service.ts 直接调用 familyService.activatePendingInvites
```

---

### S2 — 数据完整性（High）

#### S2-1 feeding.service.ts mapSupplementRow 返回旧格式 feed_type

**文件**：`src/records/feeding/feeding.service.ts:177-184`

```typescript
private mapSupplementRow(r: any) {
  return {
    ...r,
    feed_type: 'complementary',    // 应为 'supplement'
    complementary_food: '营养素',   // 旧格式残留
    supplement_items: parseSupplementItems(r.supplement_items),
  };
}
```

Migration 008 已将营养素迁移到独立的 `feeding_supplement_record` 表，`family.service.ts` 的 `getTodayRecords`（今日时间线）已正确返回 `feed_type: 'supplement'`。但记录列表接口（`/api/family/:id/records/feeding`）的 `findAll` / `findOne` 仍返回旧格式，导致记录列表页和时间线页显示不一致。

此外，`update` 方法（line 352-354）用 `record.complementary_food === '营养素'` 判断是否为营养素记录，依赖 `mapSupplementRow` 返回的旧字段，若修正 mapSupplementRow 则 update 逻辑也需同步更新。

**修复**：
```typescript
private mapSupplementRow(r: any) {
  return {
    ...r,
    feed_type: 'supplement',
    // 删除 complementary_food: '营养素'
    supplement_items: parseSupplementItems(r.supplement_items),
  };
}
// update 方法中改为 if (feedType === 'supplement') { ... }
```

---

#### S2-2 feeding.service.ts findAll 全量加载四张子表后内存排序分页

**文件**：`src/records/feeding/feeding.service.ts:186-261`

每次 `findAll` 从 4 张子表 SELECT 全量记录到 Node.js 内存，加上 IN 查询 formulaIds / foodIds 的明细，最多 6 次数据库往返，然后在内存排序分页。目前数据量少问题未暴露，MVP 上线后随记录累积，内存和响应时间将线性劣化。

**修复**：改用单次 UNION ALL + 数据库侧 ORDER BY / LIMIT / OFFSET 分页，明细仅针对当页记录 id 查询：
```sql
SELECT id, record_time, 'breast' AS feed_type, ...
FROM feeding_breast_record WHERE baby_id = ?
UNION ALL
SELECT id, record_time, 'formula' AS feed_type, ...
FROM feeding_formula_record WHERE baby_id = ?
UNION ALL
...
ORDER BY record_time DESC
LIMIT ? OFFSET ?
```

---

### S3 — 架构与分层（Medium）

#### S3-1 getTodayRecords 复杂 SQL 聚合内联在 FamilyService

**文件**：`src/family/family.service.ts:220-347`

`getTodayRecords` 方法体约 130 行，包含 11 张表的 UNION ALL SQL（80 行）及后处理。`FamilyService` 本职是家庭和成员关系管理，跨模块时间轴聚合不属于其职责边界，造成方法过长、难以测试，后续新增记录类型时需修改 FamilyService。

**建议**：提取到 `src/family/timeline.service.ts` 或 `src/records/timeline.service.ts`。

---

#### S3-2 report.service.ts 单文件超 1000 行

**文件**：`src/report/report.service.ts`（1001 行）

feeding、sleep、diaper、activity、growth、health、medical、symptom、food_observation 等所有统计域的查询和聚合全部集中在一个文件，单一职责严重违反。

**建议**：按统计域拆分子 service（FeedingReportService、SleepReportService 等），由 ReportService 作为聚合入口注入。

---

#### S3-3 InviteByPhoneDto 定义在 Controller 文件中

**文件**：`src/family/family.controller.ts:21-26`

DTO 应单独放在 `dto/` 目录，与项目其他模块规范保持一致，便于独立测试和复用。

**修复**：移动到 `src/family/dto/invite-by-phone.dto.ts`。

---

#### S3-4 DatabaseModule 未实现 OnModuleDestroy，连接池不会优雅关闭

**文件**：`src/common/database/database.module.ts`

应用收到 SIGTERM（CloudRun 滚动更新时）时，连接池不会调用 `pool.end()`，可能导致进行中的事务被强制断开，出现 ECONNRESET 日志。

**修复**：为 Pool Provider 注册销毁钩子：
```typescript
{
  provide: 'DB_LIFECYCLE',
  useFactory: (pool: Pool) => ({
    async onModuleDestroy() { await pool.end(); },
  }),
  inject: [DATABASE_POOL],
}
```

---

#### S3-5 废弃邀请码接口仍挂载在生产路由

**文件**：`src/family/family.controller.ts:96-111`

`createInviteCode` 和 `joinByCode` 标注了 `@deprecated` 但仍可访问，增加攻击面。`joinByCode` 逻辑也与新手机号邀请流程的校验不一致（未检查 invite_phone）。

**修复**：MVP 发布前删除两个废弃 controller 方法及对应 service 实现，或改为返回 410 Gone。

---

### S4 — 代码规范（Medium）

#### S4-1 大量使用 any 类型

| 位置 | 说明 |
|---|---|
| `auth.service.ts:17` | `tcb: any` |
| `family-member.guard.ts:42` | `execute<any[]>` 后直接访问字段 |
| `feeding.service.ts` mapXxxRow 参数 | 4 个 map 方法均无行类型 |
| `report.service.ts` | 大量查询结果 `any[]` |

**建议**：为高频 DB 查询结果定义行类型接口，降低字段名拼写错误风险。

---

#### S4-2 feeding.service.ts 使用 throw new Error 而非 NestJS 异常类

**文件**：`src/records/feeding/feeding.service.ts:143`

```typescript
throw new Error(`Unsupported feed_type: ${dto.feed_type}`);
```

原生 `Error` 不会被 NestJS 全局异常过滤器正确捕获，会返回 500，且错误信息可能暴露给客户端。

**修复**：改为 `throw new BadRequestException('不支持的喂养类型')`。

---

#### S4-3 FeedType DTO 枚举未包含 supplement

**文件**：`src/records/feeding/dto/create-feeding.dto.ts:30-34`

`FeedType` 枚举只有 `breast / formula / complementary`，缺少 `supplement`。`@IsEnum(FeedType)` 会直接拒绝前端传入 `feed_type: 'supplement'` 的请求（400 Bad Request）。当前 service 通过复合条件绕行，逻辑隐晦。

**修复**：枚举添加 `SUPPLEMENT = 'supplement'`，service 添加直接分支，删除旧兼容判断。

---

#### S4-4 uuid 在注册热路径中动态 import

**文件**：`src/auth/auth.service.ts:111`

```typescript
const { v4: uuidv4 } = await import('uuid'); // 动态 import
```

`uuid` 是同步模块，应改为文件顶部的静态 import，与其他 service 保持一致。

---

#### S4-5 createFamily 使用 Math.random 生成邀请码，熵值不足

**文件**：`src/family/family.service.ts:28`

```typescript
const inviteCode = Math.random().toString(36).slice(2, 8).toUpperCase();
```

`Math.random()` 为伪随机，安全敏感的邀请码应使用 `crypto.randomBytes`。

**修复**：`import { randomBytes } from 'crypto'`，使用 `randomBytes(3).toString('hex').toUpperCase()`。

注：邀请码流程已废弃（S3-5），若废弃接口被清理则此问题随之消除。

---

## 二、前端（minicare-web）

### F1 — 安全性（Low）

#### F1-1 Token 双写导致状态冗余

**文件**：`src/lib/store.ts:44-46` 和 `src/api/http.ts:9`

`setUser` 同时写 `localStorage.minicare_token` 和 Zustand store，`http.ts` 绕过 store 直读 localStorage，理论上两者可能不同步。logout 需要两处清理，结构脆弱。

**建议**：`http.ts` 改为从 `useAppStore.getState().token` 读取，从 `setUser` 移除 `localStorage.setItem`（Zustand persist 已负责持久化）。

---

#### F1-2 request() 未处理 401 全局自动登出（Low）

**文件**：`src/api/http.ts:40-43`

Token 有效期 30 天，过期后所有接口返回 401，但前端没有统一拦截，用户会停留在当前页面看到一堆报错。

**修复**：
```typescript
if (res.status === 401) {
  useAppStore.getState().logout()
  window.location.hash = '/login'
  throw new Error('登录已过期，请重新登录')
}
```

---

### F2 — 架构与状态管理

#### F2-1 AuthGuard 的 react-hooks/exhaustive-deps 被 eslint-disable 抑制（Low）

**文件**：`src/components/AuthGuard.tsx:69`

```typescript
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [status, currentFamily, currentBaby])
```

`check` 函数中使用的 `setCurrentFamily` / `setCurrentBaby` 未加入 deps，依靠 eslint-disable 掩盖。Zustand setter 是稳定引用实际不会出问题，但禁用 lint 规则降低代码可信度。

**建议**：将 setter 解构后加入 deps，或补充注释解释为何 setter 不需要加入 deps，然后移除 disable 注释。

---

#### F2-2 RecordContent.tsx 单文件超 1150 行（Medium）

**文件**：`src/components/record/RecordContent.tsx`（1159 行）

所有记录类型的展示组件、Compact 摘要函数、Summary metric 函数全部集中在一个文件，每次修改任何记录类型的展示逻辑都需要在 1000+ 行文件中定位，PR diff 噪音大，无法对单个类型做隔离测试。

**建议**：按类型拆分到 `src/components/record/content/` 子目录，`RecordContent.tsx` 仅作分发入口保留（< 100 行）。

---

#### F2-3 router.tsx 存在无意义路由 /records/form（Low）

**文件**：`src/router.tsx:69-71`

```typescript
{ path: "/records/form", element: <AuthGuard>{S(RecordsPage)}</AuthGuard> }
```

该路由渲染的是 `RecordsPage`（列表页），不会被任何导航触发，属于死代码，造成路由配置混淆。

**修复**：删除该路由条目。

---

### F3 — 代码规范

#### F3-1 时间格式化函数依赖浏览器系统时区（Low）

**文件**：`src/lib/utils.ts:14-17`

`formatTime` 中 `new Date(iso).getHours()` 依赖系统本地时区，在 UTC+0 环境（海外用户、部分测试机）会显示 UTC 时间而非北京时间。

**建议**：统一使用 `Intl.DateTimeFormat` 并显式指定 `timeZone: 'Asia/Shanghai'`。

---

#### F3-2 record-adapters.ts 使用 as RecordItem 强制转换绕过类型检查（Low）

**文件**：`src/lib/record-adapters.ts:16`

`} as RecordItem` 绕过 TypeScript 类型检查，若 `TodayRecord.detail` 字段缺少 `RecordItem` 的某些必要字段，编译期不会报错，可能在运行时访问 undefined 属性。

**建议**：用 `satisfies RecordItem` 替代 `as RecordItem`，或将返回值类型设为 `Partial<RecordItem> & { id: string; type: string }`。

---

#### F3-3 开发调试路由 /dev/icons 在生产环境可访问（Low）

**文件**：`src/router.tsx:104-108`

```typescript
{ path: "/dev/icons", element: S(IconGalleryPage) }
```

开发工具页面在生产环境仍可访问，虽然不涉及安全风险，但增加了不必要的 bundle 和路由。

**建议**：通过条件注册限制到开发环境：
```typescript
...(import.meta.env.DEV ? [{ path: '/dev/icons', element: S(IconGalleryPage) }] : [])
```

---

#### F3-4 getBabyAge 月龄计算使用 days % 30 近似，精度不足（Low）

**文件**：`src/lib/utils.ts:98-111`

```typescript
const days = totalDays % 30  // 近似每月 30 天，实际月份 28-31 天
if (months < 12) return `${months}个月${days}天`
```

对于婴儿成长记录，精确的月龄（如"3个月12天"）是有临床意义的数据，使用 `% 30` 会导致天数偏差，如某月有 31 天时余数偏小，显示"X个月0天"而实际已经X月1天。

**建议**：用精确的日期差计算：
```typescript
const dayOfMonth = now.getDate()
const dayOfBirth = birth.getDate()
const accurateDays = dayOfMonth >= dayOfBirth
  ? dayOfMonth - dayOfBirth
  : new Date(now.getFullYear(), now.getMonth(), 0).getDate() - dayOfBirth + dayOfMonth
```

---

#### F3-5 babyFoods.ts 本地缓存未设置 TTL，数据无法刷新（Low）

**文件**：`src/api/babyFoods.ts`（待确认）

辅食数据列表有本地缓存机制。若后端静态数据更新（如新增辅食类别），前端缓存不会自动失效，需要用户手动清 localStorage 或等待缓存过期。

**建议**：缓存时附加时间戳，设置合理 TTL（如 24 小时）：
```typescript
const CACHE_TTL = 24 * 60 * 60 * 1000
const cached = localStorage.getItem('baby_foods_cache')
if (cached) {
  const { data, timestamp } = JSON.parse(cached)
  if (Date.now() - timestamp < CACHE_TTL) return data
}
```

---

## 四、第二轮审查（补充覆盖范围）

> 覆盖文件：sleep/diaper/activity/health/growth/medical/symptom/feeding service、auth.service、baby.service、storage.service、events.gateway、main.ts、前端 store/http/AppLayout/TodayTimeline/record-adapters/types

---

### R1 — 安全与数据完整性（High）

#### R1-1 WebSocket join_family 未鉴权，任意客户端可监听任意家庭事件

**文件**：`src/websocket/events.gateway.ts:44,56-65`

`handleConnection` 中有 `TODO: 验证 JWT` 注释但未实现；`handleJoinFamily` 直接将客户端加入 `family:{familyId}` 房间，未验证调用者是否为该家庭成员。任意匿名连接均可传入任意 `familyId` 实时监听所有记录变更推送，属于横向越权。

**修复**：
```typescript
handleConnection(client: Socket) {
  const token = client.handshake.auth?.token as string
  try {
    const payload = this.jwtService.verify(token, { secret: process.env.JWT_SECRET })
    client.data.userId = payload.sub
  } catch {
    client.disconnect()
  }
}

@SubscribeMessage('join_family')
async handleJoinFamily(@ConnectedSocket() client: Socket, @MessageBody() data: { familyId: string }) {
  const userId = client.data.userId
  // 查询 family_member 确认 userId 属于 familyId
  const isMember = await this.familyMemberGuard.checkMembership(userId, data.familyId)
  if (!isMember) { client.emit('error', { message: '无权加入该家庭房间' }); return; }
  client.join(`family:${data.familyId}`)
}
```

---

#### R1-2 StorageService.getUploadUrl 双写逻辑错误（占位上传 + 再获取 UploadInfo）

**文件**：`src/storage/storage.service.ts:16-28`

```typescript
// 先实际上传了一个空 Buffer（浪费资源、污染存储）
const result = await this.tcb.uploadFile({ cloudPath, fileContent: Buffer.alloc(0) })
// 再获取预签名 URL
const uploadInfo = await this.tcb.getUploadFileInfo({ cloudPath })
```

第一步 `uploadFile(Buffer.alloc(0))` 会真实写入一个 0 字节文件到存储桶，再调用 `getUploadFileInfo` 获取另一个预签名 URL，两者是相互独立的操作。客户端最终使用 `uploadInfo.url` 上传覆盖时，存储桶中会先有一个 0 字节文件，再被覆盖写入真实内容，时序竞争下可能产生孤立 0 字节文件；若客户端上传失败则 0 字节文件永久残留。

**修复**：仅调用 `getUploadFileInfo`，删除 `uploadFile` 调用：
```typescript
async getUploadUrl(cloudPath: string) {
  const uploadInfo = await this.tcb.getUploadFileInfo({ cloudPath })
  return {
    fileID: uploadInfo.fileID,
    uploadUrl: uploadInfo.url,
    cosToken: uploadInfo.token ?? '',
  }
}
```

---

#### R1-3 diaper.service.ts remove 未校验记录存在性

**文件**：`src/records/diaper/diaper.service.ts:96-99`

```typescript
async remove(id: string) {
  await this.db.execute('DELETE FROM diaper_record WHERE id = ?', [id]);
  return { id };  // 无论是否实际删除了记录，均返回 { id }
}
```

与同模块其他 service（sleep.service、feeding.service）不同，`remove` 没有先 SELECT 检查记录是否存在。若 `id` 不存在，`DELETE` 影响 0 行但仍返回 200，前端无法感知删除失败。

同样问题存在于 `activity.service.ts:77-80`、`growth.service.ts:90-93`、`medical.service.ts:123-126`、`symptom.service.ts:93-96`。

**修复（以 diaper 为例）**：
```typescript
async remove(id: string) {
  const [rows] = await this.db.execute<any[]>('SELECT id FROM diaper_record WHERE id = ?', [id])
  if (rows.length === 0) throw new NotFoundException('找不到该尿布记录')
  await this.db.execute('DELETE FROM diaper_record WHERE id = ?', [id])
  return { id }
}
```

---

### R2 — 架构与规范（Medium）

#### R2-1 多个 service 中 parseJson 函数重复定义（DRY 违反）

**涉及文件**：
- `diaper.service.ts:9-13`
- `health.service.ts:8-12`
- `feeding.service.ts:12-16`
- `symptom.service.ts:8-12`

四处逻辑完全相同的 `parseJson` 局部函数，未被提取到公共工具。

**修复**：提取到 `src/common/utils/json.util.ts`，各 service import 统一使用：
```typescript
// src/common/utils/json.util.ts
export function parseJson<T = unknown>(val: unknown): T | null {
  if (val == null) return null
  if (typeof val === 'string') { try { return JSON.parse(val) as T } catch { return null } }
  return val as T
}
```

---

#### R2-2 sleep.service.ts findAll 使用 `SELECT *` 带 start/end time 大字段

**文件**：`src/records/sleep/sleep.service.ts:147-149`

`SELECT *` 在 `sleep_record` 上返回包括 `note`（TEXT）在内的全部字段，列表接口通常只需摘要字段（id、start_time、end_time、status、duration_min、quality、sleep_period）。随记录量增长，`note` 字段全量传输会增加不必要带宽开销。

**建议**：列表接口显式列举需要的字段，或区分 list schema / detail schema。

---

#### R2-3 growth.service.ts create 存在 ON DUPLICATE KEY UPDATE 的 id 逻辑问题

**文件**：`src/growth/growth.service.ts:18-45`

`INSERT ... ON DUPLICATE KEY UPDATE` 触发 DUPLICATE 分支时，使用 `INSERT` 时生成的 `id（uuidv4()）` 不会被写入，原有记录的 `id` 不变，因此 `return { id: rows[0]?.id ?? id }` 需要额外一次 SELECT 查询。这个逻辑正确，但 `id` 变量在"已有记录被覆盖"时是无意义的噪音，容易混淆维护者。

**建议**：明确注释"重复时 id 以查询结果为准"，或改用 `INSERT ... ON DUPLICATE KEY UPDATE id = id` 并删除 `uuid` 占位变量。

---

#### R2-4 AppLayout.tsx 内联 SVG 图标违反项目图标规范

**文件**：`src/components/AppLayout.tsx:17-71`

`AppLayout.tsx` 中直接内联了 `IconHouse`、`IconClipboardList`、`IconBarChart2`、`IconUserRound` 四个 SVG 组件，而项目已有统一的 `src/components/ui/icons.tsx` 图标库（frontend-coding.mdc 规则一）。内联图标导致：
1. 图标样式（strokeWidth、viewBox）与 icons.tsx 规范脱离
2. 图标无法在图标展示页 `/dev/icons` 中预览和管理
3. 重复代码

**修复**：将四个 Tab 图标添加到 `src/components/ui/icons.tsx`，在 `AppLayout.tsx` 中统一 import。

---

### R3 — 代码规范（Low）

#### R3-1 types.ts 中 CreateSleepDto 标注 @deprecated 但未删除

**文件**：`src/api/types.ts:243-250`

```typescript
/**
 * @deprecated 旧接口兼容，前端已改为 startSleep + endSleep 两步流程
 * 该类型保留供补录模式单次提交使用（后续可删除）
 */
export interface CreateSleepDto { ... }
```

既已标注 `@deprecated` 且注释说明"后续可删除"，MVP 发布前应彻底清理，避免未来维护者误用。

**修复**：确认无 import 引用后删除。

---

#### R3-2 store.ts token 字段与 localStorage 双存在潜在竞争

**文件**：`src/lib/store.ts:44-46`

Zustand `persist` 中间件持久化 `token` 字段，同时 `setUser` 手动写 `localStorage.minicare_token`；`logout` 手动删 `localStorage.minicare_token`，同时 persist 也会在下次 rehydrate 时更新。在多 tab 场景下：Tab A 登出 → `minicare_token` 被清除 → Tab B 仍持有 store 中的旧 token → Tab B 下次请求 401。

**建议**：与 F1-1 一并处理——由 Zustand persist 统一管理持久化，`http.ts` 从 store 读取 token，不再独立操作 localStorage。

---

#### R3-3 feeding.service.ts 对 complementary_food === '营养素' 的判断是历史兼容代码，应明确注释或清理

**文件**：`src/records/feeding/feeding.service.ts:99`

```typescript
if (dto.supplement_items?.length || dto.complementary_food === '营养素') {
```

`|| dto.complementary_food === '营养素'` 是 Migration 008 前的旧判断逻辑，正常情况下新客户端不会传 `complementary_food='营养素'`，仅用于旧数据兼容。

**建议**：添加明确注释，标注为迁移期兼容代码及预计清理时间，避免未来维护者不理解此逻辑保留原因。

---

#### R3-4 main.ts /health 端点 `auth_test_mode` 字段直接暴露配置状态（已在 S1-3 提及）

此条目作为 R3-4 与 S1-3 关联，优先级在 S1-3 中已列为 Critical，此处不重复，仅记录跨模块影响：`auth_test_mode` 暴露点同时影响 `main.ts` 和 `auth.service.ts` 的联动，修复时两处需同步。

---

#### R3-5 record-adapters.ts todayRecordToRecordItem 中 start_time 字段重复赋值

**文件**：`src/lib/record-adapters.ts:14-15`

```typescript
time: rec.time,
record_time: rec.time,  // 重复写入，与 TodayRecord 字段 'time' 冗余
```

`TodayRecord` 使用 `time` 字段，`RecordItem` 使用 `record_time`，适配时两个字段均写入同一值，是有意为之的兼容桥。但 `time: rec.time` 同时也通过 spread 中的 `nested` 写入，若 `detail` 包含 `time` 字段会被二次覆盖。

**建议**：在此函数加注释说明两个字段的来源和用途，明确哪个是 primary key，避免混淆维护者。

---

## 三、附录：修复优先级汇总

### MVP 发布前必须完成（Critical + High）

| 编号 | 位置 | 问题简述 |
|---|---|---|
| S1-1 | `jwt.guard.ts:33` | JWT_SECRET 未配置时鉴权失效 |
| S1-2 | `auth.service.ts:22` | AUTH_TEST_MODE 生产残留风险 |
| S1-3 | `main.ts:62-80` | /health 泄露配置信息 |
| S1-4 | 所有记录 GET 接口 | baby_id 归属未校验（IDOR） |
| S1-5 | `auth.service.ts:152` | 激活邀请逻辑重复/分层越界 |
| S2-1 | `feeding.service.ts:177` | mapSupplementRow 返回旧格式 |
| S2-2 | `feeding.service.ts:186` | findAll 全量加载内存排序 |
| R1-1 | `events.gateway.ts:44` | WebSocket join_family 未鉴权，任意客户端可监听任意家庭 |
| R1-2 | `storage.service.ts:16` | getUploadUrl 双写逻辑错误，产生孤立 0 字节文件 |
| R1-3 | `diaper/activity/growth/medical/symptom service` | remove 未校验记录存在性，删除失败返回 200 |

### 近期迭代处理（Medium）

| 编号 | 位置 | 问题简述 |
|---|---|---|
| S3-1 | `family.service.ts:220` | getTodayRecords 职责越界 |
| S3-2 | `report.service.ts` | 单文件 1000+ 行 |
| S3-3 | `family.controller.ts:21` | DTO 未放 dto/ 目录 |
| S3-4 | `database.module.ts` | 连接池无优雅关闭 |
| S3-5 | `family.controller.ts:96` | 废弃接口未清理 |
| S4-1 | 多处 | 大量 any 类型 |
| S4-2 | `feeding.service.ts:143` | throw new Error 非 NestJS 异常 |
| S4-3 | `create-feeding.dto.ts:30` | FeedType 缺少 supplement |
| S4-4 | `auth.service.ts:111` | uuid 动态 import |
| S4-5 | `family.service.ts:28` | Math.random 生成邀请码 |
| F2-2 | `RecordContent.tsx` | 单文件 1150+ 行 |
| R2-1 | 4 个 service 文件 | parseJson 函数重复定义（DRY 违反） |
| R2-2 | `sleep.service.ts:147` | findAll 使用 SELECT *，note 字段无谓传输 |
| R2-3 | `growth.service.ts:18` | ON DUPLICATE KEY UPDATE 的 id 变量逻辑混淆 |
| R2-4 | `AppLayout.tsx:17-71` | 内联 SVG 图标违反图标规范，未使用 icons.tsx |

### 后续迭代（Low）

| 编号 | 位置 | 问题简述 |
|---|---|---|
| F1-1 | `store.ts + http.ts` | Token 双写冗余 |
| F1-2 | `http.ts:40` | 缺少 401 全局自动登出 |
| F2-1 | `AuthGuard.tsx:69` | eslint-disable 抑制 deps 检查 |
| F2-3 | `router.tsx:69` | 无意义路由 /records/form |
| F3-1 | `utils.ts:14` | 时间格式化依赖系统时区 |
| F3-2 | `record-adapters.ts:16` | as RecordItem 强制转换 |
| F3-3 | `router.tsx:104` | 开发路由在生产可访问 |
| F3-4 | `utils.ts:98` | getBabyAge 月龄精度不足 |
| F3-5 | `babyFoods.ts` | 缓存无 TTL |
| R3-1 | `api/types.ts:243` | @deprecated CreateSleepDto 未删除 |
| R3-2 | `store.ts:44` | token 双存在多 tab 竞争（与 F1-1 合并处理） |
| R3-3 | `feeding.service.ts:99` | 迁移期兼容代码无注释说明 |
| R3-4 | `main.ts + auth.service.ts` | /health auth_test_mode 暴露（与 S1-3 关联） |
| R3-5 | `record-adapters.ts:14` | time/record_time 双写无注释说明 |
