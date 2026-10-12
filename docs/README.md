# 敏宝日记 · 文档索引

> MVP 已完成，微信小程序已发布。按功能模块拆分，便于 AI coding 环节精准引用。
> 开发时直接阅读对应 `features/F0x-*.md` 文件即可，无需翻阅完整 PRD。
>
> **文档管理规范**（2026-08-23 起强制）：新增/移动/删除任何 docs 文档，必须同步更新本索引；命名用英文小写 + 前缀编号；文档头部用 frontmatter 标注 status（active/superseded/archived）。

📋 **开发进度跟踪** → [`DEV-PLAN.md`](DEV-PLAN.md)
📌 **文档管理优化方案** → [`workspace-optimization-plan.md`](workspace-optimization-plan.md)

---

## 目录结构

```
docs/
├── README.md                 ← 总索引（本文件，强制同步更新）
├── DEV-PLAN.md               ← 开发计划与进度跟踪
├── architecture.md           ← 系统架构（NestJS + Taro 小程序 + CloudBase）
├── business/                 ← 商业与战略文档
│   ├── 1-5-year-plan.md      ← 1-5 年成本收益评估（superseded，仅参考）
│   ├── MVP-MRD.md            ← 市场需求文档（参考）
│   └── MVP-PRD.md            ← 完整 PRD 存档（superseded，权威规格见 features/ + prd/）
├── product/                  ← 产品文档
│   ├── overview.md           ← 产品概述（唯一权威，合并自 project-intro + overview）
│   └── design-system.md      ← 视觉/交互设计规范（开发全程参考）
├── prd/                      ← PRD 总集（编号见 PRD_REGISTRY.md）
├── features/                 ← 核心：按模块拆分的功能规格（现行权威）
├── agent/                    ← 养娃智能体「敏宝助手」模块方案（PRD-003 的展开）
│   ├── prd/M0x-*.md          ← 产品方案（M1 对话 / M2 知识 / M3 数据 / M4 分析 / M5 日记 / M6 图片 / M7 护栏 / M8 部署）
│   └── tech/M0x-*.md         ← 技术方案
├── tech/                     ← 技术方案（INFRA-* / DB-* / TECH-NNN / MINIAPP-* / PWA / CHART / ARCH）
├── hardware/                 ← 音箱硬件（ESP32-S3）与摄像头调研
│   ├── hardware-specs.md     ← 硬件规格（权威）
│   ├── speaker-voice-input-research.md
│   ├── xiaozhi-esp32-reuse-analysis.md
│   ├── xiaomi-camera-integration-research.md
│   └── ha-camera-integration-plan.md
├── knowledge/                ← 敏宝知识库资料（源文件 PDF + 调研；管线工程在 minicare-platform/api/）
│   ├── source/               ← 原始资料（国内/国际文献）
│   └── research/             ← 知识库建设调研（KAG / MinerU / 图谱工具 / 召回评测）
├── assets/                   ← 配图（draw.io 源文件 + SVG / PNG 导出，供 README 与文档引用）
├── reviews/                  ← 审查与复盘（过程性文档）
│   ├── cr-mvp.md             ← MVP 发布前代码审查报告
│   └── REVIEW-1.0-issues.md  ← 敏宝日记 1.0 问题分析与解决方案
├── analytics/                ← 数据分析
│   └── wangzai-analysis.md   ← 旺仔健康数据分析
├── wechat-articles/          ← 公众号 CMPA 系列文章（md + 同名子目录放封面/素材）
├── archive/                  ← 已归档（历史快照，仅供追溯）
│   ├── minicare-research.md  ← CMPA 市场调研（被 product/overview 取代）
│   ├── overview.md           ← 产品概述 v1（被 product/overview 取代）
│   └── mock-data-plan-v2.md  ← 跳板文档（已迁至 minicare-server/migrations/mock_data/）
└── workspace-optimization-plan.md ← 目录与文档管理优化方案
```

---

## 功能模块索引（features/，现行权威）

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
| [F14-medication.md](features/F14-medication.md) | 用药记录（独立模块） | 已完成 |
| [UX-quickactions-redesign.md](features/UX-quickactions-redesign.md) | 首页快捷操作设计 | 已落地 |
| [UX-records-list-redesign.md](features/UX-records-list-redesign.md) | 记录列表展示规范 | 已落地 |
| [UX-home-reminders.md](features/UX-home-reminders.md) | 首页提醒区优化 + 提醒设置 | 已实施（2026-10-12） |

## PRD 总集（docs/prd/，编号见 PRD_REGISTRY.md）

| 版本 | 标题 | 状态 |
|------|------|------|
| [PRD-001](prd/PRD-001.md) | 语音录入功能 | 已实施 |
| [PRD-002](prd/PRD-002.md) | 辅食记录与排敏管理 | 已实施 |
| [PRD-003](prd/PRD-003.md) | 养娃智能体「敏宝助手」 | 开发中（模块方案见 agent/） |
| [PRD-004](prd/PRD-004.md) | 音箱对话渠道「小宝小宝」 | 规划中（硬件见 hardware/） |

## 技术方案索引（docs/tech/）

| 文件 | 内容 | 状态 |
|------|------|------|
| [architecture.md](architecture.md) | 系统架构总览 | 已更新 |
| [tech/INFRA-cloudbase.md](tech/INFRA-cloudbase.md) | CloudBase 基建清单 | 已完成 |
| [tech/INFRA-ops-monitoring.md](tech/INFRA-ops-monitoring.md) | 运维监控体系 | 规划中 |
| [tech/INFRA-env-config.md](tech/INFRA-env-config.md) | 环境配置（dev/prod） | 已完成 |
| [tech/INFRA-domain.md](tech/INFRA-domain.md) | 域名绑定 | 已完成 |
| [tech/INFRA-ci-cd-gray-release.md](tech/INFRA-ci-cd-gray-release.md) | CI/CD 灰度发布 | 规划中 |
| [tech/MINIAPP-ci-preview.md](tech/MINIAPP-ci-preview.md) | 小程序 CI 预览 | 已完成 |
| [tech/MINIAPP-migration-plan.md](tech/MINIAPP-migration-plan.md) | Web→小程序迁移 | 已完成（归档） |
| [tech/PWA.md](tech/PWA.md) | Web PWA 实现 | 维护模式 |
| [tech/CHART-analysis.md](tech/CHART-analysis.md) | 图表组件规格 | 已完成 |
| [tech/ARCH-config-api.md](tech/ARCH-config-api.md) | 统一配置 API | 已完成 |
| [tech/DB-01-overview.md](tech/DB-01-overview.md) | 数据表关系图 · 存储策略 | 已更新 |
| [tech/DB-02-schema.md](tech/DB-02-schema.md) | 完整建表 DDL | 权威来源 |
| [tech/DB-03-mock-data.md](tech/DB-03-mock-data.md) | Mock 数据计划 | 已完成 |
| [tech/DB-04-refactor-analysis.md](tech/DB-04-refactor-analysis.md) | Schema 重构分析 | 已完成（归档） |
| [tech/TECH-001-voice-input.md](tech/TECH-001-voice-input.md) | 语音输入方案 | 已完成 |
| [tech/TECH-002-unified-record-feed-api.md](tech/TECH-002-unified-record-feed-api.md) | 统一记录流 API | 已完成 |
| [tech/TECH-003-record-list-date-filter.md](tech/TECH-003-record-list-date-filter.md) | 记录列表日期筛选 | 已完成 |
| [tech/TECH-004-cloudbase-ai-sdk.md](tech/TECH-004-cloudbase-ai-sdk.md) | CloudBase AI SDK 调研 | 已完成 |
| [tech/TECH-005-oak-source-analysis.md](tech/TECH-005-oak-source-analysis.md) | OAK 源码分析 | 已完成 |
| [tech/TECH-006-minicare-agent-plan.md](tech/TECH-006-minicare-agent-plan.md) | 智能体总体技术方案 v2.0 | 进行中 |
| [tech/TECH-007-timeline-unification.md](tech/TECH-007-timeline-unification.md) | 时间线统一 | 已完成 |
| [tech/TECH-008-speaker-channel.md](tech/TECH-008-speaker-channel.md) | 音箱渠道技术方案 | 进行中 |
| [tech/TECH-009-wechat-devtools-protocol.md](tech/TECH-009-wechat-devtools-protocol.md) | 微信开发者工具调试协议调研 | 已完成 |
| [tech/TECH-017-kb-desktop-client.md](tech/TECH-017-kb-desktop-client.md) | 知识库平台桌面客户端（Electron + Python sidecar）执行方案 | **规划中（待评审）** |
| [tech/TECH-018-kb-multilingual-research.md](tech/TECH-018-kb-multilingual-research.md) | 多语言语料翻译策略调研（英文语料 × 中文场景） | **调研完成（方案见 TECH-019）** |
| [tech/TECH-019-kb-translate-step.md](tech/TECH-019-kb-translate-step.md) | 知识库「翻译」步骤（块级双语对）实现方案 · 阶段 A | **已实施（2026-10-09）** |
| [tech/TECH-020-agent-eval-platform-research.md](tech/TECH-020-agent-eval-platform-research.md) | Agent 测评平台能力升级 · 行业实践调研（用例/任务/裁判/维度 四对象） | **调研完成（2026-10-09）** |
| [tech/TECH-021-agent-eval-console-v2.md](tech/TECH-021-agent-eval-console-v2.md) | Agent 测评台 2.0 设计（四管理面 + 配置物化执行） | **设计稿 v0.1（待评审）** |
| [tech/TECH-023-kb-retrieval-test-research.md](tech/TECH-023-kb-retrieval-test-research.md) | 知识库「检索测试」功能 · 行业实践调研（Dify/FastGPT/RAGFlow/Coze 召回测试 + 批量评测口径） | **调研完成（2026-10-09），已落地独立页** |
| [tech/TECH-026-agent-eval-report-v2.md](tech/TECH-026-agent-eval-report-v2.md) | Agent 测评 2.0 技术方案（决策化报告 × deepeval 判分引擎）· 全周期 | **v2 合稿（2026-10-11），第 1 期实施中** |
| [tech/TECH-027-agent-eval-framework-reuse-assessment.md](tech/TECH-027-agent-eval-framework-reuse-assessment.md) | Agent 测评开源框架复用评估（deepeval / Langfuse / 相邻方案） | **评估完成（2026-10-11），deepeval 判分引擎定案** |

## 养娃智能体模块索引（docs/agent/，PRD-003 展开）

| 模块 | 产品方案 | 技术方案 | 优先级 |
|------|---------|---------|--------|
| M1 对话会话与语音输入 | [prd/M01-chat.md](agent/prd/M01-chat.md) | [tech/M01-chat.md](agent/tech/M01-chat.md) | P0/P3 |
| M2 知识问答 | [prd/M02-knowledge.md](agent/prd/M02-knowledge.md) | [tech/M02-knowledge.md](agent/tech/M02-knowledge.md) | P1 |
| M3 健康数据查询与家庭共享 | [prd/M03-data.md](agent/prd/M03-data.md) | [tech/M03-data.md](agent/tech/M03-data.md) | P2 |
| M4 总结分析与生长曲线 | [prd/M04-analyze.md](agent/prd/M04-analyze.md) | [tech/M04-analyze.md](agent/tech/M04-analyze.md) | P2 |
| M5 每日日记 | [prd/M05-diary.md](agent/prd/M05-diary.md) | [tech/M05-diary.md](agent/tech/M05-diary.md) | P2/P3 |
| M6 图片问诊 | [prd/M06-vision.md](agent/prd/M06-vision.md) | [tech/M06-vision.md](agent/tech/M06-vision.md) | P0/P3 |
| M7 安全护栏与反馈闭环 | [prd/M07-safety.md](agent/prd/M07-safety.md) | [tech/M07-safety.md](agent/tech/M07-safety.md) | P0/P4 |
| M8 接入层与部署 | [prd/M08-ops.md](agent/prd/M08-ops.md) | [tech/M08-ops.md](agent/tech/M08-ops.md) | P0 |

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

## 文档管理规范（强制）

1. **索引同步**：新增/移动/删除 docs/ 下任何文档，必须同步更新本索引
2. **根目录禁放文档**：根目录只允许 README.md 与 AGENTS.md；新文档一律进 docs/ 对应分类
3. **命名规范**：英文小写 + 前缀编号（TECH-NNN-* / INFRA-* / DB-NN-* / FNN-* / PRD-NNN / REVIEW-*），禁止中文文件名
4. **生命周期**：文档头部 frontmatter 标注 `status: draft | active | superseded | archived`，修改后更新 `updated` 日期
5. **更新需求时**：修改 `features/F0x-*.md`，同步更新本索引状态列
