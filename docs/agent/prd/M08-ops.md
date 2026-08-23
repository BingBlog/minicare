# M8 · 接入层与部署（产品方案）

> 模块：M8 ｜ 对应故事：横切支撑（US-01/03/08 等服务端接入部分）
> 上级文档：[PRD-003](../prd/PRD-003.md) ｜ [TECH-006 v2.0](../tech/TECH-006-minicare-agent-plan.md)
> 状态：规划中

## 1. 模块背景与目标

「敏宝助手」整体以**独立服务 + 薄代理**形态落地：对外只暴露 minicare-server 的既有域名与 JWT 体系，agent 服务（minicare-agent）不暴露公网。本模块承载这条接入链路的全部服务端工程：代理层、鉴权、内部通信、部署与可观测性。

**目标**：
1. 小程序零新增域名、复用现有登录态即可对话；
2. 鉴权单点（NestJS），agent 服务零业务鉴权；
3. 可部署、可回滚、可观测。

## 2. 无独立产品面说明

本模块**没有独立的用户可见功能**，产品要求全部来自总 PRD 的非功能需求与其他 7 个模块的接入前提。用户可见效果 = 对话/日记/图片等能力"能稳定使用"。

## 3. 非功能需求（引用总 PRD 第 5 节）

| 维度 | 要求 |
|---|---|
| 安全-鉴权 | JWT → 家庭成员资格 → 宝宝归属三层校验；agent 内部 token 校验；ctx 只含 userId/familyId/babyId |
| 安全-密钥 | DEEPSEEK_API_KEY / JWT_SECRET / DB_PASS / TCB 凭证 / AGENT_INTERNAL_TOKEN 全部 CloudRun env 注入，不落代码/镜像 |
| 性能 | SSE 首字 <3s；代理层帧级透传不缓冲；REST 透传 <100ms 额外开销 |
| 可用性 | /health 探活；agent 缺 key 时容器不崩溃（ready=false）；断连 abort 上游 |
| 可观测 | chat 打点（ms/事件数/token）；工具执行打点；stdout JSON 日志；/diag 诊断 |

## 4. 验收标准

- **GIVEN** 小程序带合法 JWT **WHEN** 调 `/api/agent/chat` **THEN** SSE 流式完整回答，首字 <3s；
- **GIVEN** 请求 body 中 familyId/babyId 不属于该用户家庭 **WHEN** 发起对话 **THEN** 403 拒绝，不泄露数据存在性；
- **GIVEN** 无 `AGENT_INTERNAL_TOKEN` 直连 agent 服务 **WHEN** 调 `/chat` **THEN** 401；
- **GIVEN** agent 服务 DEEPSEEK_API_KEY 缺失 **WHEN** 容器启动 **THEN** 不崩溃，/health 返回 ready=false；
- **GIVEN** 用户中途退出 **WHEN** 代理层收到断连 **THEN** abort 上游请求，无悬挂连接。

## 5. 依赖

- 其他模块全部依赖本模块的接入通道；
- 前置（用户侧）：CynosDB 只读账号、AGENT_INTERNAL_TOKEN、TCR 仓库密码（P4）。
