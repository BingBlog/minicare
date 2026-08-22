# agent-poc · OAK 最小 POC（DeepSeek + 知识库工具 + 多用户会话）

> 状态：**核心链路验证通过**（2026-08-20）
> 模型方案：**DeepSeek 官方 API（Anthropic 兼容端点）**——已实测可用
> 关联调研：[TECH-005-oak-source-analysis.md](../docs/tech/TECH-005-oak-source-analysis.md)

## 验证结论

| 项 | 结果 |
|----|------|
| OAK + DeepSeek 出流 | ✅ 通过（deepseek-v4-flash / deepseek-v4-pro，Anthropic 兼容端点） |
| client-tool 协议（模型调用→宿主执行→回传→基于结果作答） | ✅ 通过（FlexDB 持久化启用后） |
| 多用户会话隔离（userId + UUID conversationId） | ✅ 通过 |
| 知识库工具注入（zod schema + execute） | ✅ 通过 |
| 无需 CloudBase AI 资源包 | ✅ **模型调用走 DeepSeek，完全不依赖成长计划/Token Credits** |

## 为什么选 DeepSeek（决策记录）

- 成长计划环境（minicare-hunyuan-d3e7r22b4efc18f）属**微信小程序账号体系**，腾讯云侧（tcb CLI / OAK 部署的 CloudRun）无法获取其服务端凭证（实测 `app id does not match`，api_key 类型暂未开放）
- **放弃成长计划路径**，直接用 DeepSeek API（用户提供 key）——零平台依赖、数据出域可控（DeepSeek 官方直连）
- DeepSeek 提供 **Anthropic 兼容端点** `https://api.deepseek.com/anthropic`，Claude CLI（OAK 底层）无需改造直接对接

## 运行

```bash
# 1. 配置 key（已写入 .env.local，被 .gitignore 保护）
echo "DEEPSEEK_API_KEY=sk-xxx" > .env.local

# 2. 前置：tcb login 已登录（读取 ~/.config/.cloudbase/auth.json 作 FlexDB 凭证）
node src/demo.js
```

## 架构

```
小程序/业务层
  └─ agent-poc/src/demo.js（宿主循环）
       ├─ createAgent(...)          # OAK，模型走 DeepSeek Anthropic 端点
       ├─ session.send(msg)         # 发消息 → ACP 事件流
       ├─ client/<tool> 请求        # 模型要调工具 → 宿主执行
       ├─ respondToolUse(...)       # 回传结果 → 模型基于结果继续
       └─ getHistory()              # 会话历史（FlexDB，主环境）
```

## 关键配置（demo.js）

```js
const agent = createAgent({
  envId: 'minicare-cloud-6gqledlle0132cbe',
  credentials: { secretId, secretKey, sessionToken },  // FlexDB 持久化必需
  model: {
    id: 'claude-sonnet-4-20250514',   // ⚠️ Claude CLI 白名单内模型名（CLI 校验）
    apiBaseUrl: 'https://api.deepseek.com/anthropic',  // DeepSeek Anthropic 端点
    apiKey: process.env.DEEPSEEK_API_KEY,
  },
  tools: [{ name, description, parameters: zodSchema, execute }],
  cwd: process.cwd(),
})
```

## ⚠️ POC 实测踩坑（务必记录）

1. **模型名必须是 Claude CLI 白名单内的**（如 `claude-sonnet-4-20250514`）——传 `deepseek-v4-flash` 等会报 `unrecognized_model`（CLI 校验），但 gateway/DeepSeek 不校验模型名，实际请求仍路由到目标模型
2. **`session: { enabled: false }` 时 client-tool 链路是坏的**——工具回传依赖 `patchSentinelToolResult` 读写持久化 transcript，必须启用 FlexDB（传 credentials）
3. **client-tool 是"暂停-执行-回传"协议**：模型调用工具 → turn pause → 发出 `client/<toolName>` JSON-RPC REQUEST → 宿主执行 → `session.respondToolUse({ toolUseId, output })` → turn 恢复
4. **Tools 的 parameters 必须是 zod schema**（OAK `ToolDefinition.parameters` 直接透传 SDK 的 `tool()`），不是 JSON Schema
5. **conversationId 必须是 UUID 格式**——Claude CLI 校验，非 UUID 报 `Invalid session ID`
6. 凭证：模型走 `DEEPSEEK_API_KEY`；FlexDB 会话走 CloudBase 临时凭证（POC 读 CLI 登录态，生产环境变量注入）
7. 安装：npm install 用 `--registry=https://registry.npmmirror.com`（默认源可能卡死）；Claude CLI 二进制 325MB 随平台包安装

## 生产化待办（P1）

- [ ] HTTP 服务化（Express/SSE），供小程序对话页对接
- [ ] 会话隔离模型落地：userId=family member，conversationId=UUID（threadId）
- [ ] 知识库 MCP server 化（PG pgvector / COS Vector + MCP 协议，替代内存检索）
- [ ] 凭证管理：DeepSeek key + CloudBase 凭证走环境变量/密钥管理，不落代码
- [ ] 模型选择：deepseek-v4-flash（默认，便宜）/ deepseek-v4-pro（复杂任务）按场景路由
