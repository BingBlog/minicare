# OAK 内部执行链路观测：调研与架构决策（TECH-007 扩展）

> 日期：2026-09-03 ~ 09-04
> 背景：TECH-007 观测埋点（`src/lib/telemetry.js`，chat.js 旁路层）在 Langfuse 中
> LLM generation 的 input 恒为空、工具轮 output 为空、token 只有累计值。本文完整回答：
> 缺口根因是什么 → OAK 内部执行机制在哪层 → 有哪些感知途径 → JSONL 能否作为 trace 源
> → 如何存储展示 → 依赖的 CLI 是否闭源 → 落地路线。
>
> ⚠️ 2026-09-05 更新：§3 的 transcript 目录随直连 SDK 改造（v0.2.0）迁移至
> `~/.minicare-agent/claude-config/projects/`（不再是 ~/.oak/agent/.claude）。P0
> transcript 解析器已落地（scripts/transcript-enrich.mjs + langfuse-import 重建），见 §7。
>
> ⚠️ 2026-09-05 补充：OAK 已于 09-04 移除，agent 循环迁至 lib/runtime.js
> （claude-agent-sdk 直连）。本文 §2 的 OAK 机制图为历史事实；§3/§4/§7 的 transcript
> 结论与落地路线仍然有效（SDK CLI 同样落盘 transcript、同样闭源）。

## 1. 问题根因：Langfuse generation input/output 为空

实测（FlexDB 最近 3 条 trace）+ 代码链路（telemetry.js / chat.js）结论：

1. **input 空**：`startGeneration()` 从未设置 input 字段（所有 gen `has input field: false`）。
   埋点在 chat.js 旁路层，只能看到 OAK 对外吐的流事件（文本 chunk / usage_update /
   client tool_call），拿不到发往 DeepSeek 的完整 prompt。
2. **output 空**：工具调用轮模型输出的是 tool_use 而非文本，无 `agent_message_chunk`，
   `appendGenerationText()` 无内容可拼，`endGeneration()` 时 `'' || null` → 导入端
   `obs.output ?? undefined` 不发送 → Langfuse 显示空。最终回答轮正常（126~394 字）。
3. **usage 归因不准**：OAK `usage_update` 只有累计 total_tokens，且在流收尾才发出，
   需要"回退挂轮"逻辑，轮次归因不可靠。

## 2. OAK 内部执行机制（0.1.1 拆包结论）

```
chat.js ──session.send()──▶ OAK (createAgent/startSession)
                              │  AgentConfig { model: ModelSpec, systemPrompt, tools }
                              ▼
                         @anthropic-ai/claude-agent-sdk  query()   ← runtime/agent-builder.ts
                              │  注入环境变量：
                              │    ANTHROPIC_BASE_URL  = ModelSpec.apiBaseUrl
                              │      （我们配的 https://api.deepseek.com/anthropic）
                              │    ANTHROPIC_AUTH_TOKEN = ModelSpec.apiKey
                              │    CLAUDE_CONFIG_DIR    = ~/.oak/agent/.claude
                              ▼
                         Claude CLI 子进程（v2.1.237，spawn 311MB 编译二进制）
                              │  ★ 完整 prompt 在这里组装：system prompt + 历史 + 工具
                              │    schema + CLI 内部指令段，然后 HTTP 调 DeepSeek
                              ▼
                         api.deepseek.com/anthropic
```

关键事实：

1. **完整 prompt 组装发生在 Claude CLI 子进程内部，OAK 父进程自己也拿不到**——
   隔了两层，不是 OAK 少暴露一个字段的问题。
2. `ModelSpec.apiBaseUrl` 原样变成子进程的 `ANTHROPIC_BASE_URL`，是天然可劫持点。
3. CLI 子进程把完整会话 transcript 以 JSONL 落盘本地（见 §3）。
4. OAK 0.1.2（2026-08-24 发布）与 0.1.1 的 `AgentHooks` 完全一致，无 LLM 级钩子；
   CHANGELOG 自 0.1.0-beta.0 后未逐版本维护。
5. **CLI 闭源实锤**：`@anthropic-ai/claude-agent-sdk@0.3.237` license 为
   `© Anthropic PBC. All rights reserved.`（SEE LICENSE IN README.md）；真正干活的
   `claude-agent-sdk-darwin-x64/claude` 是 **311MB Mach-O 编译二进制**（Bun 编译），
   连 JS 源码都不可读。开源的只有 OAK 本身（Apache-2.0，
   TencentCloudBase/OpenVibeCoding）。→ CLI 内部行为只能靠外围观测
   （transcript / HTTP 代理 / debug 日志），不存在读源码补埋点的路。

## 3. CLI transcript JSONL：已经存在的完整执行细节（重大发现）

位置（OAK 时期）：`~/.oak/agent/.claude/projects/<cwd 编码目录>/<cli-session-id>.jsonl`
位置（v0.2.0 直连 SDK 起）：`~/.minicare-agent/claude-config/projects/<cwd 编码目录>/<cli-session-id>.jsonl`
（一行一条 JSON，append-only，每会话一个文件）

实测一次完整对话轮（"旺仔今天喝了多少奶"，14 行）的结构：

```
L1  queue-operation  enqueue    用户原始问题                    ← 请求排队
L3  user             message    用户问题（promptSource: "sdk"）
L4-6 attachment      CLI 注入物：agent_listing_delta（子代理清单）/
                     skill_listing（技能清单）/ total_tokens_reminder（token 预算）
L8  assistant  thinking(795字)   usage: input_tokens=21585      ← LLM 调用 #1
L9  assistant  tool_use(query_baby_data, {metric:"feeding",days:1,aggregate:"sum"})
L10 user       tool_result  {"__OAK_CLIENT_TOOL__":true,...} is_error:true
                     ← OAK client-tool 协议：工具 deferred to client，
                       CLI 视角是 permission denial（toolDenialKind: "permission-rule"）
L12 assistant  thinking(1590字)  usage: input_tokens=299 + cache_read=21760  ← 调用 #2
L13 assistant  text(17字)  最终回答
L14 last-prompt 收尾标记
```

assistant 记录字段价值：

- `message.model`：真实模型名（deepseek-v4-flash）
- `message.usage`：**精确到单次调用**的 input/output/cache_read/cache_creation
  （对比：OAK usage_update 只有累计 total）。实测第二轮 cache 命中 21760 token，
  真实增量输入仅 299 —— 这是成本/延迟优化的核心数据
- `message.content`：完整 blocks（thinking 思维链原文 / text / tool_use 含入参）
- `stop_reason`、消息 id、时间戳

解析注意事项：

- 同一次 LLM 调用按 block 逐行落盘（L8/L9 同 message.id、同 usage 快照），
  解析时按 message.id 去重
- tool_result 被 `__OAK_CLIENT_TOOL__` 信封包装且 `is_error: true`，按信封字段识别
  client tool，不要当真实错误
- attachment 行占体积大（skill_listing 等）但信息低价值，可跳过
- **没有的**：最终发出的 system prompt 原文与完整 messages 数组（CLI 不落 HTTP 层）

## 4. JSONL 能否直接作为 trace 日志？→ 能当细节层，不能当唯一 trace

| 缺口 | 说明 |
|---|---|
| 无业务元数据 | 无 userId/familyId/babyId，无法做数据隔离与按宝宝查询 |
| 生产环境会丢 | 写在容器本地盘，CloudRun 临时 FS 实例回收即失；FlexDB 才是跨环境持久层 |
| 无请求级故障视角 | 看门狗 forceFinished、SSE 断连、业务兜底重试只在 chat.js 层可见 |
| prompt 仍缺失 | 每轮发出的完整 prompt 原文只有 HTTP 代理方案能拿到 |

**架构决策：三层混合，各司其职**

```
FlexDB telemetry  = 业务索引（谁、哪个宝宝、状态、耗时、traceId）   ← 保持现状
CLI transcript    = 执行细节（每轮 LLM 调用 blocks + 精确 usage）    ← P0 接入
Langfuse          = 纯展示 UI（导入时两层关联合并）                  ← 改导入器
```

关联方式：CLI sessionId 与 OAK conversationId 无直接映射，用「时间窗 + 首条
user message 内容匹配」关联（enqueue 行就是原始问题），实测可靠。

## 5. 存储与展示

- **存储：不搬，原地落盘 + 索引 + 清理**
  - JSONL 本身即最佳存储格式（append-only、一行一事件）
  - P0 解析后回填 FlexDB observations（轻量）或直接转 Langfuse 事件
  - 原始文件保留 7-14 天定期清理（当前 `~/.oak/.../projects/` 无界增长）
  - 生产若要持久化，按 traceId 命名上传 COS（注意敏宝数据隔离）
- **展示：首选 Langfuse，不自建 viewer**
  - 解析转 generation-create 事件后，瀑布图 / 单轮 token / thinking 与工具调用展开 /
    全文搜索全部白拿
  - 临时肉眼查看：`jq` 或 VS Code JSONL 插件即可

## 6. 全部感知途径对比

| 途径 | 能拿到什么 | 成本 | 结论 |
|---|---|---|---|
| A. OAK AgentHooks | 工具 I/O、最终消息 | 零 | 与现有埋点重叠，无 LLM 级钩子，不采用 |
| B. transcript JSONL（P0） | 每轮 LLM 调用：thinking/text/tool_use + 精确 usage 含 cache | 零改动，纯旁路读取 | **推荐，立即可做** |
| C. 本地透明代理（P1） | 100% wire 级完整 prompt | 改 `deepseek.js` ANTHROPIC_ENDPOINT 指本地代理转发，约 60 行 + env 开关 | 唯一能拿 input 的方案，dev 环境启用 |
| D. 上游跟进（P2） | 官方 onModelCall 钩子 | OAK 开源可提 issue/PR | 长期正道 |
| E. patch bundle / loader 劫持 | query() 入参 | 升级即失效 | 不推荐，仅临时实验 |
| F. OAK_DEBUG debug 日志 | spawn/exit 诊断 | env 开关 | 只适合排障，不适合观测 |

## 7. 落地路线

1. **P0（B 方案）—— ✅ 已落地（2026-09-05）**
   - 实现：`scripts/transcript-enrich.mjs` + `scripts/langfuse-import.mjs` 增强
   - 扫描 transcript 按 mtime/时间窗增量解析；按 message.id 合并 blocks → 组装每轮
     LLM 调用（真实 model / 精确 usage 含 cache_read / text·tool_use·thinking / stop_reason）
   - 时间窗 + 首问匹配关联 traceId → 回填 FlexDB：替换 telemetry 模糊 generation
     （id 确定性派生 `${traceId}-cli-${i}`），保留工具 span；置 importedAt=null 触发重建
   - langfuse-import 对 cliEnriched trace 先 DELETE 远端再整体重建（旧 generation 无法
     原地替换 id；Langfuse v3 支持 DELETE /api/public/traces/{id}，级联删 observations）
   - 效果：Langfuse 瀑布中每轮 generation 展示精确 input/output/cache tokens、
     真实模型名、tool_use 摘要与 stop_reason（thinking 已由 wire-proxy 关闭故为空）
   - 幂等：enrich 记录 metadata.cliEnriched{transcriptFile, enrichedAt}，文件 mtime 未变
     即跳过；import 靠 importedAt + DELETE 重建可重跑
   - 使用：`node scripts/transcript-enrich.mjs && node scripts/langfuse-import.mjs`
   - 风险（保留）：CLI 升级可能改 transcript 格式，解析器按 message.id/usage 结构容错
2. **P1（C 方案）**：本地透明代理抓完整 prompt（env 开关 `WIRE_LOG=on`，
   wire-proxy.js 已实现，落 `.wire-logs/wire-<ts>.jsonl`）
   - 解决 input 空；顺带做 prompt 体积分析（单轮 input ~22k token，值得拆 system
     prompt 组成）
   - 仅 dev 启用（生产勿开）；注意本机 Clash 代理环境（`--noproxy`）
   - 待办：wire-log 与 FlexDB trace 按时间窗关联后回填 generation input（仿 enrich 模式）
3. **P2（D 方案）**：向上游提 onModelCall 钩子 issue / 关注 claude-agent-sdk 演进

## 8. 附录：实测记录与代码位置

- transcript 样本：`~/.minicare-agent/claude-config/projects/-Users-bing-Documents-minicare-v1-agent-poc/<sessionId>.jsonl`
  （OAK 时期为 ~/.oak/agent/.claude/projects/...，样本 807dd565-b738-47a1-a208-350813dcf741.jsonl）
- P0 落地代码：`scripts/transcript-enrich.mjs`（解析+匹配+回填）、`scripts/langfuse-import.mjs`
  （cliEnriched 重建 + usage 明细/metadata 透传）、`scripts/check-traces.mjs`（cache/usage 展示）
- OAK bundle 关键位置（0.1.1 dist/index.js）：`buildClaudeQueryOptions`（env 注入）、
  `resolveCredential`（ModelSpec→baseUrl/apiKey）、`deriveAgentConfigDir`（~/.oak 根）、
  `AgentHooks`（6 个钩子，无 LLM 级）
- SDK 事实：`@anthropic-ai/claude-agent-sdk@0.3.237`（闭源）+ 平台二进制包
  `claude-agent-sdk-darwin-x64/claude`（311MB Mach-O，Bun 编译）
- npm 版本时间线：0.1.1（08-13）→ 0.1.2（08-24），AgentHooks 无变化
- 相关文档：`docs/tech/TECH-007-agent-observability-langfuse.md`（观测链路总纲）
