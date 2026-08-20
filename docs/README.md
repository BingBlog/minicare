# 敏宝日记 · 文档索引

> MVP 已完成，微信小程序已发布。按功能模块拆分，便于 AI coding 环节精准引用。
> 开发时直接阅读对应 `features/F0x-*.md` 文件即可，无需翻阅完整 PRD。

📋 **开发进度跟踪** → [`DEV-PLAN.md`](DEV-PLAN.md)

---

## 目录结构

```
minicare/docs/
├── README.md              ← 总索引（本文件）
├── DEV-PLAN.md            ← 开发计划与进度跟踪
├── overview.md            ← 产品概述、目标用户、已实现功能
├── design-system.md       ← 视觉/交互设计规范（开发全程参考）
├── architecture.md        ← 系统架构（NestJS + Taro 小程序 + CloudBase）
├── tech/                  ← 技术方案
│   ├── INFRA-cloudbase.md ← CloudBase 基建清单（已完成）
│   ├── INFRA-ops-monitoring.md ← 运维监控体系
│   ├── INFRA-env-config.md ← 环境配置与部署
│   ├── INFRA-domain.md    ← 域名绑定
│   ├── INFRA-ci-cd-gray-release.md ← CI/CD 灰度发布方案
│   ├── MINIAPP-ci-preview.md ← 小程序 CI 预览方案（miniprogram-ci）
│   ├── MINIAPP-migration-plan.md ← Web→小程序迁移（已完成，归档）
│   ├── PWA.md             ← Web PWA 实现（维护模式）
│   ├── CHART-analysis.md  ← 图表组件技术规格
│   ├── ARCH-config-api.md ← 统一配置 API
│   ├── DB-01-overview.md  ← 数据表关系图 · 存储策略
│   ├── DB-02-schema.md    ← 完整建表 DDL（权威来源：migration 文件）
│   ├── DB-03-mock-data.md ← Mock 数据 · 用户故事演练
│   └── DB-04-refactor-analysis.md ← Schema 重构分析（已完成，归档）
├── features/              ← 核心：按模块拆分的功能规格
│   ├── F01-auth.md        ← 登录/注册（小程序双模式认证）
│   ├── F02-profile.md     ← 宝宝档案管理
│   ├── F03-feeding.md     ← 饮食记录（4 表拆分：breast/formula/food/supplement）
│   ├── F04-sleep.md       ← 睡眠记录（计时模式+手动补录）
│   ├── F05-activity.md    ← 活动记录
│   ├── F06-diaper.md      ← 尿布记录
│   ├── F07-health.md      ← 健康记录
│   ├── F08-symptom.md     ← 表现记录
│   ├── F09-growth.md      ← 生长发育
│   ├── F10-medical.md     ← 医疗记录
│   ├── F11-report.md      ← 统计报告（ECharts 截图模式）
│   ├── F12-family.md      ← 家庭共享（手机号邀请）
│   ├── UX-quickactions-redesign.md ← 首页快捷操作设计
│   └── UX-records-list-redesign.md ← 记录列表展示规范
└── cr-mvp.md              ← 代码评审报告
```

---

## 功能模块索引

| 文件 | 模块 | 实现状态 |
|------|------|---------|
| [F01-auth.md](features/F01-auth.md) | 登录/注册 | 已完成 |
| [F02-profile.md](features/F02-profile.md) | 宝宝档案管理 | 已完成 |
| [F03-feeding.md](features/F03-feeding.md) | 饮食记录 | 已完成 |
| [F04-sleep.md](features/F04-sleep.md) | 睡眠记录 | 已完成 |
| [F05-activity.md](features/F05-activity.md) | 活动记录 | 已完成 |
| [F06-diaper.md](features/F06-diaper.md) | 尿布记录 | 已完成 |
| [F07-health.md](features/F07-health.md) | 健康记录 | 已完成 |
| [F08-symptom.md](features/F08-symptom.md) | 表现记录 | 已完成 |
| [F09-growth.md](features/F09-growth.md) | 生长发育 | 已完成 |
| [F10-medical.md](features/F10-medical.md) | 医疗记录 | 已完成 |
| [F11-report.md](features/F11-report.md) | 统计报告 | 已完成 |
| [F12-family.md](features/F12-family.md) | 家庭共享 | 已完成 |
| [F13-share.md](features/F13-share.md) | 微信小程序分享功能 | 待开发 |

---

## 技术方案索引

| 文件 | 内容 | 状态 |
|------|------|------|
| [architecture.md](architecture.md) | 系统架构总览（NestJS + Taro + CloudBase） | 已更新 |
| [tech/INFRA-cloudbase.md](tech/INFRA-cloudbase.md) | CloudBase 基建清单 | 已完成 |
| [tech/INFRA-ops-monitoring.md](tech/INFRA-ops-monitoring.md) | 运维监控体系 | 规划中 |
| [tech/INFRA-env-config.md](tech/INFRA-env-config.md) | 环境配置（dev/prod） | 已完成 |
| [tech/MINIAPP-ci-preview.md](tech/MINIAPP-ci-preview.md) | 小程序 CI 预览方案 | 已完成 |
| [tech/MINIAPP-migration-plan.md](tech/MINIAPP-migration-plan.md) | Web→小程序迁移 | 已完成（归档） |
| [tech/PWA.md](tech/PWA.md) | Web PWA 实现 | 维护模式 |
| [tech/CHART-analysis.md](tech/CHART-analysis.md) | 图表组件规格 | 已完成 |
| [tech/DB-01-overview.md](tech/DB-01-overview.md) | 数据表关系图 · 存储策略 | 已更新 |
| [tech/DB-02-schema.md](tech/DB-02-schema.md) | 完整建表 DDL | 权威来源 |
| [tech/DB-03-mock-data.md](tech/DB-03-mock-data.md) | Mock 数据计划 | 已完成 |
| [tech/DB-04-refactor-analysis.md](tech/DB-04-refactor-analysis.md) | Schema 重构分析 | 已完成（归档） |

---

## 开发规范（`.agents/rules/`）

| 文件 | 适用场景 |
|------|---------|
| `api-conventions.mdc` | API 设计、路由、DTOs、认证 |
| `cloudbase-conventions.mdc` | CloudBase 平台、部署工具 |
| `deploy-conventions.mdc` | 构建配置、部署脚本、Dockerfile |
| `frontend-coding.mdc` | 前端编码规范（图标、枚举、对话框） |
| `miniapp-development.mdc` | **小程序开发规范**（主平台，优先参考） |
| `mp-preview.mdc` | 小程序 CI 预览（miniprogram-ci、IP 白名单、代理处理） |

---

## 项目元文档（根目录）

| 文件 | 内容 | 状态 |
|------|------|------|
| `AGENTS.md` | AI Agent 协作上下文 | 已更新 |
| `MVP-PRD.md` | 完整版 PRD 存档 | 已归档 |
| `MVP-MRD.md` | 市场需求文档 | 参考 |
| `minicare-research.md` | CMPA 市场调研 | 参考 |
| `1-5-year-plan.md` | 成本收益评估 | 参考 |

---

## PRD 维护说明

- **开发新功能时**：阅读对应 `features/F0x-*.md` 了解业务规则和验收标准
- **更新需求时**：修改 `features/F0x-*.md`，同步更新本索引的状态列
- **新增功能时**：在 `features/` 目录新建 `F13-*.md`，在本索引添加条目
- **小程序专项**：开发中必读 `.cursor/rules/miniapp-development.mdc`
