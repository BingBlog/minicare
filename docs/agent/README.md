# 养娃智能体「敏宝助手」· 详细模块方案总索引

> 基于总 PRD（[PRD-003](../prd/PRD-003.md)）与总技术方案（[TECH-006 v2.0](../tech/TECH-006-minicare-agent-plan.md)）拆分的 8 个详细模块，每模块含产品方案（prd/）与技术方案（tech/）。
> 更新时间：2026-08-22

## 模块清单

| 模块 | 产品方案 | 技术方案 | 覆盖故事 | 优先级 |
|---|---|---|---|---|
| M1 对话会话与语音输入 | [prd/M01-chat.md](prd/M01-chat.md) | [tech/M01-chat.md](tech/M01-chat.md) | US-01 / US-10 | P0/P3 |
| M2 知识问答 | [prd/M02-knowledge.md](prd/M02-knowledge.md) | [tech/M02-knowledge.md](tech/M02-knowledge.md) | US-02 | P1 |
| M3 健康数据查询与家庭共享 | [prd/M03-data.md](prd/M03-data.md) | [tech/M03-data.md](tech/M03-data.md) | US-04 / US-05 | P2 |
| M4 总结分析与生长曲线 | [prd/M04-analyze.md](prd/M04-analyze.md) | [tech/M04-analyze.md](tech/M04-analyze.md) | US-06 / US-07 | P2 |
| M5 每日日记 | [prd/M05-diary.md](prd/M05-diary.md) | [tech/M05-diary.md](tech/M05-diary.md) | US-08 / US-09 | P2/P3 |
| M6 图片问诊 | [prd/M06-vision.md](prd/M06-vision.md) | [tech/M06-vision.md](tech/M06-vision.md) | US-03 | P0/P3 |
| M7 安全护栏与反馈闭环 | [prd/M07-safety.md](prd/M07-safety.md) | [tech/M07-safety.md](tech/M07-safety.md) | US-11 / US-12 | P0/P4 |
| M8 接入层与部署 | [prd/M08-ops.md](prd/M08-ops.md) | [tech/M08-ops.md](tech/M08-ops.md) | 横切支撑 | P0 |

## 模块依赖关系

```
M8 接入层与部署（地基）
 ├── M1 对话会话与语音（入口）
 │    ├── M2 知识问答
 │    ├── M3 数据查询 ──▶ M4 总结分析
 │    └── M6 图片问诊
 ├── M5 每日日记（M1 触发 / M3 数据 / M4 内容 / M6 图片素材）
 └── M7 安全护栏与反馈（横切 M1-M6）
```

## 关键决策速查（2026-08-22 已拍板）

- 视觉模型：deepseek-v4-flash-vision-exp（**P0 实测阻塞项**，见 M6 tech 5）
- 语音输入：复用 TECH-001（RecorderManager + 后端腾讯云 ASR），回复为文字
- 会话保留：历史永久，列表/恢复最近 20 条
- 日记：每天一篇、重复触发覆盖需确认、永久保留
- 迁移编号：017 = knowledge_base、018 = baby_diary（014/015 被医疗占用、016 被 timeline_backfill 占用）
- 会话恢复（2026-08-23 P0 实测）：OAK `resume` 不可用，改为自管历史（FlexDB `agent_chat_history`，最近 20 条注入 systemPrompt），见 M1 tech §2.1
- 视觉模型（2026-08-23 P0 实测）：attachments 传图 + 直接传 `deepseek-v4-flash-vision-exp`，白名单映射已废弃，见 M6 tech §3/§4

## 写作约定

- 每模块文档固定章节：产品 = 背景与目标 / 覆盖故事与业务规则 / 页面交互(ASCII) / 验收标准 / 依赖；技术 = 设计概览 / 数据模型 / API / 实现要点 / 测试验证 / 风险降级；
- 与总 PRD/TECH-006 重复的内容只引用不重写；
- 文档状态：`规划中` → 开发后标记 `已实现` 并补更新时间。
