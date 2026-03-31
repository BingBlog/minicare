# 敏宝日记 · PRD 文档索引

> 按功能模块拆分，便于 AI coding 环节精准引用。
> 开发时直接阅读对应 `features/F0x-*.md` 文件即可，无需翻阅完整 PRD。

📋 **开发进度跟踪** → [`DEV-PLAN.md`](DEV-PLAN.md)（每完成一项任务在此更新）

---

## 目录结构

```
minicare/docs/
├── README.md              ← 总索引（本文件）
├── DEV-PLAN.md            ← 开发计划与进度跟踪（每完成一项更新）
├── overview.md            ← 产品概述、目标用户（只读背景）
├── design-system.md       ← 视觉/交互设计规范（开发全程参考）
├── architecture.md        ← 数据架构摘要（详细方案见 tech/ 目录）
├── tech/                  ← 技术方案（数据库设计、Mock 数据）
│   ├── INFRA-cloudbase.md ← CloudBase 基建清单
│   ├── INFRA-ops-monitoring.md ← 运维监控体系（总方案）
│   ├── INFRA-cls-logging.md ← CLS 日志接入
│   ├── INFRA-env-config.md ← 环境配置与部署
│   ├── DB-01-overview.md  ← 数据表关系图 · 存储策略 · 技术选型
│   ├── DB-02-schema.md    ← 完整建表 DDL（含新增字段）
│   └── DB-03-mock-data.md ← Mock 数据 · 用户故事演练
├── features/              ← 核心：按模块拆分，AI coding 直接使用
│   ├── F01-auth.md        ← 登录/注册
│   ├── F02-profile.md     ← 宝宝档案管理（含引导页、设置）
│   ├── F03-feeding.md     ← 饮食记录
│   ├── F04-sleep.md       ← 睡眠记录
│   ├── F05-activity.md    ← 活动记录
│   ├── F06-diaper.md      ← 尿布记录
│   ├── F07-health.md      ← 健康记录
│   ├── F08-symptom.md     ← 表现记录
│   ├── F09-growth.md      ← 生长发育
│   ├── F10-medical.md     ← 医疗记录
│   ├── F11-report.md      ← 统计报告
│   └── F12-family.md      ← 家庭共享/多成员
└── MVP-PRD.md             ← 保留原文件作为"完整版存档"
```

---

## 功能模块索引

| 文件 | 功能 ID | 模块 | UI 文件 |
|------|---------|------|---------|
| [F01-auth.md](features/F01-auth.md) | — | 登录/注册 | `login.html` |
| [F02-profile.md](features/F02-profile.md) | P0-001 | 宝宝档案管理 | `onboarding.html` `profile.html` |
| [F03-feeding.md](features/F03-feeding.md) | P0-002 | 饮食记录 | `form-feeding.html` |
| [F04-sleep.md](features/F04-sleep.md) | P0-007 | 睡眠记录 | `form-sleep.html` |
| [F05-activity.md](features/F05-activity.md) | P0-003 | 活动记录 | `form-activity.html` |
| [F06-diaper.md](features/F06-diaper.md) | P0-004 | 尿布记录 | `form-diaper.html` |
| [F07-health.md](features/F07-health.md) | P0-005 | 健康记录 | `form-health.html` |
| [F08-symptom.md](features/F08-symptom.md) | P0-006 | 表现记录 | `form-symptom.html` |
| [F09-growth.md](features/F09-growth.md) | P0-008 | 生长发育 | `form-growth.html` |
| [F10-medical.md](features/F10-medical.md) | P0-009 | 医疗记录 | `form-medical.html` |
| [F11-report.md](features/F11-report.md) | P0-010 | 统计报告 | `report.html` |
| [F12-family.md](features/F12-family.md) | P0-011 | 家庭共享/多成员 | `profile.html` |

---

## 技术方案索引

| 文件 | 内容 |
|------|------|
| [tech/INFRA-cloudbase.md](tech/INFRA-cloudbase.md) | CloudBase 基础设施搭建执行清单 |
| [tech/INFRA-ops-monitoring.md](tech/INFRA-ops-monitoring.md) | **运维监控体系总方案**（流量、稳定性告警、CLS、架构/流程、计划与风险） |
| [tech/INFRA-cls-logging.md](tech/INFRA-cls-logging.md) | **CLS 日志接入**（云托管 → CLS、NestJS 结构化日志建议、索引与成本） |
| [tech/INFRA-env-config.md](tech/INFRA-env-config.md) | **开发环境配置方案**（dev / staging / prod 三套环境、认证流程、部署脚本） |
| [tech/DB-01-overview.md](tech/DB-01-overview.md) | ER 图 · 本地/远程存储策略 · 数据库选型 |
| [tech/DB-02-schema.md](tech/DB-02-schema.md) | 完整建表 DDL · 字段变更汇总 |
| [tech/DB-03-mock-data.md](tech/DB-03-mock-data.md) | Mock 数据 · 用户故事演练 · 字段覆盖检查 |

> ⚠️ **重要**：数据库架构已升级为「云端权威 + 本地缓存」混合架构，详见 `tech/DB-01-overview.md`。

---

## 快速导航：按开发优先级

### P0 · 第 1-2 周（基础能力）
- [F01-auth.md](features/F01-auth.md) — 登录注册
- [F02-profile.md](features/F02-profile.md) — 宝宝档案创建
- [F12-family.md](features/F12-family.md) — 家庭群组与成员权限
- [tech/DB-01-overview.md](tech/DB-01-overview.md) — 数据架构总览
- [tech/DB-02-schema.md](tech/DB-02-schema.md) — 建表 DDL

### P0 · 第 3 周（日常记录主流程）
- [F03-feeding.md](features/F03-feeding.md) — 饮食记录
- [F04-sleep.md](features/F04-sleep.md) — 睡眠记录
- [F05-activity.md](features/F05-activity.md) — 活动记录
- [F06-diaper.md](features/F06-diaper.md) — 尿布记录
- [F07-health.md](features/F07-health.md) — 健康记录
- [F08-symptom.md](features/F08-symptom.md) — 表现记录

### P0 · 第 4 周（生长 & 医疗）
- [F09-growth.md](features/F09-growth.md) — 生长发育记录
- [F10-medical.md](features/F10-medical.md) — 医疗记录（含 OCR）

### P0 · 第 5 周（报告 & 导出）
- [F11-report.md](features/F11-report.md) — 统计报告生成与导出

### 通用参考（开发全程）
- [overview.md](overview.md) — 产品概述与导航结构
- [design-system.md](design-system.md) — 视觉规范
- [architecture.md](architecture.md) — 数据架构摘要
- [tech/DB-03-mock-data.md](tech/DB-03-mock-data.md) — Mock 数据示例

---

## PRD 维护说明

- **开发新功能时**：阅读对应 `features/F0x-*.md` 了解业务规则和验收标准
- **更新需求时**：修改 `features/F0x-*.md`，同步更新 `MVP-PRD.md` 对应章节
- **新增功能时**：在 `features/` 目录新建 `F13-*.md`，在本索引添加条目
- **更新数据库时**：修改 `tech/DB-02-schema.md`，同步更新文件顶部的「最后同步」日期
