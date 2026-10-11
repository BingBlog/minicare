# TECH-024 后端上线兼容性评估（旧版小程序影响）

> 评估日期：2026-10-11
> 场景：小程序前后端全量发布 —— 后端（minicare-server）先上线 staging/生产，小程序（weapp）后走提审发布。
> 核心问题：**新后端上线后，线上旧版小程序（未含 10-09 新功能的版本）会不会被破坏？**

---

## 0. 结论速览

| 判定项 | 结论 |
| --- | --- |
| 旧版小程序 + 新后端（既有功能） | ✅ **无破坏性变更**，记录/列表/日记/登录/聊天/报告全部向后兼容 |
| 旧版登录态（存量 JWT） | ✅ 不踢下线（`payload.tv ?? 0` 与列默认值 0 匹配） |
| 旧版小程序 + 新 schema（迁移先行窗口期） | ✅ 全部迁移为 additive（加列/建表），旧代码不引用新列 |
| 敏感变更 ①：医疗「就诊类型」编辑锁定 | ⚠️ 行为收紧（有意设计）：编辑医疗记录时**改类型会被 400 拒绝**（`blood/allergy → other` 归一放行）。旧版若在编辑时改类型会看到报错文案 |
| 敏感变更 ②：timeline 医疗摘要文案 | ℹ️ 显示变化：新写入/更新的医疗 timeline 标题从「医疗」变为类型名（儿保/就诊/疫苗），tags 改为「机构+诊断」（疫苗为「疫苗名+机构」）。旧存量行不变 |
| 敏感变更 ③：日记日期输出格式 | ℹ️ 修复：`diary_date` 从 ISO 串（UTC 偏移）改为 `YYYY-MM-DD`，为**跨端回传修复**（旧格式会被服务端 DATE_RE 拒收） |
| config 下发变化（版本 `2026-05-10.1 → 2026-10-09.1`） | ✅ 新增 `scheduleItemTypes` 字段 + `activityType` 增 `bath` 项——旧版忽略未知字段/多一项枚举，不崩 |

### 🔴 部署顺序硬约束（不可调换）

| 迁移 | 硬依赖点 | 若缺失的后果 |
| --- | --- | --- |
| **020** | `medical.service.create` 的 INSERT **无条件包含** 020 全部列；`timeline.service.upsertFromSource` INSERT 无条件含 `record_timeline.medical_visit_type` | 缺列 = 创建医疗记录直接 SQL 报错；所有记录的时间线物化失败（best_effort 兜底：strictWrite 开启时会抛错阻断） |
| **024** | `jwt.guard` 与 `findOrCreateUser` 均 `SELECT token_version` | 缺列 = **所有鉴权接口 500、登录失败**（全局性） |
| 022 / 023 | schedule 新端点用 | 仅影响新功能（旧版不调用），但需在体验版验证前就绪 |
| 021 | KB 表（agent/平台用），与旧版无关 | 无旧版影响 |

> 结论：**必须在部署新代码前完成三库迁移**（SOP-E 顺序：迁移 → 后端 → 前端），本次部署严格执行。
> 迁移全部为纯加法（`ADD COLUMN` / `ADD KEY` / `CREATE TABLE` / `INSERT IGNORE` seed），
> 所以「新 schema + 旧代码」的窗口期（迁移完成、代码未部署）对线上服务无影响。

---

## 1. 评估方法

- **基线定位**：生产当前版本 `minicare-api-production-035`（镜像创建于 2026-09-07 23:28）→ 对应代码基线 `e306385`（09-07 23:21，其后提交均晚于镜像构建，且生产库无 020 表列可交叉印证生产不含 PD-P0 代码）。
- **评估范围**：`git diff e306385..HEAD -- minicare-server/src/`，37 个文件，+2719 / −211。
- **方法**：逐文件审阅 API 行为差异，按「旧版请求 → 新代码路径」判定兼容性；迁移 SQL 全文核查破坏性操作。

---

## 2. 逐模块结论

### 2.1 鉴权与会话（auth）

- `verifyCode` / `tcbLogin`：返回结构 `AuthResult` 与旧版一致（`token/user/isNewUser/activatedFamilyIds`）；`activatedFamilyIds` 新旧版本均恒为空数组（历史缺口，非本次引入）。
- 新增 `markSmsVerified`（UPDATE 024 新列）：**try/catch 兜底，失败仅告警不阻断登录**。
- `jwt.guard`：新增 `tv` 比对（`payload.tv ?? 0`）。存量 token 无 `tv`、存量行 `token_version` 默认 0 → **不会被批量踢下线**；仅在用户「改密」时旧 token 失效（设计如此，旧版无改密入口不触发）。
- `issueToken` 签名变化（携带 tv）：服务端内部，不影响 API。
- 新增端点（`login-by-password` / `password-status` / `password` / `reset-password`）：旧版不调用。

### 2.2 医疗记录（medical）

- `CreateMedicalDto` / `UpdateMedicalDto`：**全部新增字段均 `@IsOptional()`** → 旧版提交（仅基础字段）不受影响；`MedicationItemDto` 增可选 `days`。
- `create`：INSERT 无条件含 020 全部列（**020 硬依赖**，见上表）。
- `update`：新签名 `(id, userId, dto)`（内部用）；新增 `assertVisitTypeChangeAllowed` —— **就诊类型不可变更**（唯一行为收紧点，详见 §3）。
- `findOne` 从指定列 SELECT 改为 `SELECT *` + `mapRow` 归一：日期格式化行为与旧版一致（旧版已 `formatSqlDate`）；`medications/photo_ids` 空值归一为 `[]`；新增 `needsCompletion` 及 020 字段（增量，旧版忽略）。
- 新增端点 `archive` / `vaccine/schedule` / `vaccine/book` / `vaccine/settings`：旧版不调用；静态路由均声明在 `@Get(':id')` 之前（无路由遮蔽）。

### 2.3 记录列表（feed / timeline）

- `feed.service`：差异全部为「新增可选参数 `subtype`」的线程化；`appendSubtypeToWhere` 在 `!subtype` 时 no-op → **旧版请求 SQL 与行完全相同**；`medicalSql(includeVisitType)` 仅带 subtype 时透出列。
- `timeline.service`：`upsertFromSource` INSERT 增 `medical_visit_type` 列（**020 硬依赖**）；医疗 payload 的摘要标题/tags/detail 变化（见 §3 显示变化②）；`loadMedicalPayload` 读 `vaccine_name/vaccine_dose_seq`（020 列）。
- 兜底：物化写入异常在非 strict 模式下仅 warn（best_effort），主记录写入不被阻断；`ER_NO_SUCH_TABLE` 静默返回。

### 2.4 配置下发（app-config）

- `CONFIG_VERSION` 更新 → 旧版会重新拉取 config；新增 `scheduleItemTypes`（旧版不消费）、`activityType` 增 `bath`（后端 DTO 同步已接受该值，新旧版本均可提交）。
- 旧版对 config 的消费为「读取已知字段」，JSON 新增字段不产生解析风险。

### 2.5 其他

- `schedule` / `vaccine-book` 模块：纯新增（PRD-009 / PD-P0），不动既有路由。
- `agent.service`：注释改名 + `diary_date` 格式修复（§3 ③）。
- `device` / `family` / `app.module`：注释级与模块注册（FamilyService 导出供 schedule 复用），无 API 行为变化。
- `records/activity/dto`：`bath` 枚举新增，旧值集合不变。

---

## 3. 旧版可感知的变化清单

| # | 变化 | 性质 | 影响面 | 处置 |
| --- | --- | --- | --- | --- |
| ① | 医疗记录编辑时「改就诊类型」被拒（400，提示删除后新建；legacy `blood/allergy → other` 放行） | 行为收紧（有意） | 仅旧版编辑医疗记录且改类型的操作 | 接受（纵深防御设计，TECH-011 §3.5）；抽验时确认报错文案可读 |
| ② | 医疗 timeline 摘要：标题「医疗」→ 类型名；tags 调整 | 显示改进 | 仅新写入/重刷的行 | 接受 |
| ③ | 日记 `diary_date` 输出 ISO → `YYYY-MM-DD` | 修复（服务端 DATE 收口） | 旧版日记列表展示/回传 | 接受（修复了回传被拒的旧 bug） |
| ④ | config 版本更新与新增字段 | 增量 | 旧版拉取后忽略未知字段 | 接受 |

---

## 4. 部署后回归抽验清单（生产）

按「旧版小程序视角」逐项抽验（优先用正式版小程序或真机）：

- [ ] 登录：真实短信登录 / 测试号验证码登录
- [ ] 首页：config 拉取正常、各卡片（喂奶提醒/日记卡/排敏进度）渲染
- [ ] 记录列表：feed 各类型 tab 切换、分页加载（不重复不丢条）
- [ ] 记录创建：喂养 / 睡眠 / 换尿布 / 活动 / 医疗 / 用药 各 1 条
- [ ] 医疗编辑：老记录打开编辑并保存（**不改类型**→ 保存成功；改类型 → 预期 400 提示）
- [ ] 日记：列表 / 详情 / 生成一篇
- [ ] 聊天：发一条消息（agent 链路）
- [ ] 报告页：图表渲染

---

## 5. 附：本次评估的 git 依据

```
基线 e306385（2026-09-07 23:21）→ HEAD
  675e337 PD-P0-02 医疗 DTO 类型化/校验 + service 新列写入
  888d5e4 PD-P0-03 archive/vaccine 端点 + 疫苗本引擎
  275b93b PD-P0-04 timeline 物化 medical_visit_type + feed subtype 过滤
  59cb18e 日记日期链路贯通 + 生成即落库
  6edcf70 PRD-009 日程表（schedule 模块 + bath 枚举 + config 下发）
  eb91d1b 密码登录（TECH-016）
  d6b5ee4 agent-poc → minicare-agent 更名（注释级）
```
