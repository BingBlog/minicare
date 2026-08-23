# M1 · 对话会话与语音输入（技术方案）

> 模块：M1 ｜ 状态：**P3 页面已落地（2026-08-23）** ｜ 优先级：P0（服务端）/ P3（UI）
>
> **2026-08-23 P3 完成**：`pages/chat` 分包落地——SSE 消费（`api/agent.ts` chatStream：enableChunked + onChunkReceived 手写解析，ArrayBuffer→UTF-8 用 escape/decodeURIComponent，完整响应降级走同一解析器）、气泡/流式光标、语音输入（`useChatVoice` 复用 voiceApi.parse 转写回填，发送前可编辑）、图片发送（`lib/uploadImage.ts` 公共压缩直传）、周报/月报快捷按钮（预置消息触发 analyze）、来源卡片/工具状态、日记草稿保存入口、会话本地恢复（storage 缓存 conversationId + 消息，图片只存 fileID 恢复时拉临时 URL）、停止生成、宝宝切换=新会话、新会话清空、入口守卫、服务未就绪横幅。**实测观察**：DeepSeek 偶发回答完成后再次调用工具致流不结束，前端"停止"兜底；根治（P4）在 agent prompt 约束单轮工具次数。
>
> **2026-08-23 markdown 渲染落地**：`components/MarkdownText`（零依赖自研，支持 ##标题/**加粗**/*斜体*/`行内代码`/-·有序列表/>引用/|表格|/---分隔线，暖色主题对齐 minicare 视觉），assistant 气泡接入，用户消息保持纯文本；流式期间按内容 memo 避免重复解析。
>
> **2026-08-23 工具循环修复**：DeepSeek 偶发"回答完成后再次调用工具"导致流不结束 → `routes/chat.js` 增加工具循环防护（同工具 ≤2 次、总调用 ≤3 次，超限 respondToolUse 返回"已达上限，直接基于已有信息回答"）+ `prompts/system.js` 工具纪律约束；curl 实测三类场景（知识问答/日记生成/数据查询）tool_call 均收敛 1 次、done 正常；前端配套工具名去重 + 停止按钮耗时显示。

## 1. 技术设计概览

```
小程序对话页 ──SSE──▶ minicare-server 代理 ──内部──▶ minicare-agent
                                                      ├─ OAK session（FlexDB 持久化）
                                                      ├─ conversationId = UUID
                                                      └─ SSE 事件协议
语音输入：RecorderManager 录音 ──▶ 后端腾讯云 ASR ──▶ 文字回填输入框（复用 TECH-001）
```

## 2. 会话生命周期

### 2.1 会话创建与恢复

> ⚠️ **2026-08-23 P0 实测修正**：OAK 0.1.1 的 `resume` 机制（新一轮 `send`）在
> DeepSeek Anthropic 端点 + Claude CLI 组合下**不可用**（返回空流，CLI 不 spawn；
> 0.1.2-beta.0 亦复现）。因此**放弃 OAK transcript 恢复**，改为**自管历史**：
> 每次请求新建 session（`conversationId: randomUUID()`），历史由 agent 服务
> 从 FlexDB `agent_chat_history` 集合读取（最近 20 条）并注入 systemPrompt。
> 单轮内 client-tool resume（respondToolUse）不受影响。

```js
// routes/chat.js
const history = await getChatHistory(envId, creds, cid)  // FlexDB agent_chat_history
const agent = buildAgent(config, history)                // 历史注入 systemPrompt
const session = await agent.startSession({ userId: ctx.userId, conversationId: randomUUID() })
for await (const event of session.send(message)) { /* SSE 分发 */ }
// 对话结束后 appendChatHistory(...) 追加本轮问答
```

- `conversationId` 必须是 UUID（Claude CLI 强校验，POC 踩坑 5）；
- 线程标识 = conversationId（历史存取键），前端每次请求携带；
- **历史存储**：FlexDB 集合 `agent_chat_history`（自建，不依赖 OAK transcript）：
  `{ conversationId, userId, familyId, babyId, messages: [{role,content}], updatedAt }`
- **保留策略**：存最近 40 条，注入模型最近 20 条（对齐 M1 tech §2.2 的 limit 20）；

### 2.2 会话列表与最近 20 条

- 自管历史集合：`agent_chat_history`（按 conversationId 一条文档，messages 数组）；
- 会话列表查询（二期 UI，本期接口预留）：agent 内部 `GET /conversations?limit=20`
  按 `userId` 查 `agent_chat_history`（orderBy updatedAt desc limit 20）；
- 历史**永久保留**（不清理），仅展示/恢复最近 20 条；更早条目不可恢复，前端提示"开启新会话"；
- FlexDB 单次 get 上限兜底：limit(20) 恒低于上限，安全。

### 2.3 切换宝宝 = 新会话

- 前端切换上下文条 → 丢弃当前 conversationId → 下次请求不带 conversationId → 服务端生成新 UUID；
- 隔离在"ctx.babyId 注入 + 工具参数约束"层面完成（见 M3 tech），会话 key 结构不变（userId 维度）。

## 3. SSE 事件协议（agent → 代理 → 小程序，帧级透传）

```
event: meta        data: { conversationId, familyId, babyId, model }
event: session     data: { started: true, t_ms }
event: tool_call   data: { name, input }
event: tool_result data: { name, output }
event: text        data: { delta }                    // 流式增量（可能多个）
event: sources     data: { sources: [{ type:'knowledge'|'record', title, source, id }] }
event: diary       data: { draft, date }              // 日记草稿（M5）
event: done        data: { events, ms, model }
event: error       data: { message }
```

- 小程序消费：`wx.request({ enableChunked: true })` + `onChunkReceived` 手写 SSE 解析（模拟器降级为完整响应，同一解析器）；
- 客户端事件处理：text→append 气泡；tool_call→显示"正在查询宝宝数据..."；sources→渲染来源卡片；done→结束；error→提示重试。

## 4. 语音输入链路（复用 TECH-001，不引入新服务）

```
Taro.getRecorderManager() 录音（aac，30s 上限，波形动画）
  → 上传后端语音接口（现有，TECH-001 已实现）
  → 腾讯云 ASR 转文字
  → 转写文字回填输入框（可编辑）→ 按文本消息走 /chat
```

- 对话场景**不做** NLU 结构化（区别于记录场景的语音录入——那是填表，这里是发消息）；
- 权限：麦克风授权失败 → 降级文字输入；
- 转写质量兜底：医疗术语/方言误转由"发送前可编辑"覆盖；
- 复用点：`useVoiceInput` 状态机（录音/停止/取消/超时）可直接从记录场景抽取复用。

## 5. 超时与断连

| 场景 | 处理 |
|---|---|
| 上游 60s 无数据 | 代理 abort，前端提示"服务暂时不可用" |
| 客户端断连 | `res.on('close')` → cancel 上游 reader |
| 模型 429 | agent 侧指数退避重试（工具层），前端降级提示 |
| 上下文超限 | 提示开新会话 / 自动截断保留最近内容（OAK summarization 兜底） |

## 6. 测试与验证

- 冒烟：连续 5 轮对话 → 中途退出 → 重新进入恢复，上下文完整；
- 20 条上限：造 25 条会话 → 列表仅 20 条；
- 切换宝宝：A 会话 → 切 B → 新 UUID，B 上下文不含 A 数据；
- 语音：真机录音 → ASR 回填 → 编辑 → 发送（模拟器用降级路径验证）。

## 7. UI 层组件选型

### 7.1 选型原则

1. **零新增第三方 UI 组件库**：项目现状是 Taro 4.2 + React 18 + 全部自写组件（无 Vant/NutUI/Taro UI）。对话页不引入任何组件库——风格与现有暖黄 design tokens 冲突、主包体积增加、且流式气泡/来源卡片等无现成可用的库组件；
2. **最大化复用现有组件**：录音、弹窗、图表、导航、加载态等均已存在，直接复用；
3. **对话特有交互自写**（消息流式渲染、工具加载态、来源卡片）——这些恰恰是组件库不提供的；
4. 图标统一 SVG（`src/assets/icons/*.svg`），**无 emoji**（项目硬性约定）。

### 7.2 复用清单（现有组件，零新增）

| UI 元素 | 复用组件 | 说明 |
|---|---|---|
| 录音波形覆盖层 | `VoiceRecorder`（state/duration/maxDuration/volumeLevels/onCancel） | 已具备，对话页直接复用；取消上滑手势在调用方实现 |
| 语音状态机 | `src/lib/useVoiceInput.ts` | 录音/停止/取消/超时状态机，抽取复用 |
| 语音转写 API | `src/api/voice.ts` | 后端腾讯云 ASR（TECH-001 链路） |
| 底部确认弹窗 | `ConfirmSheet`（open/title/desc/confirmText/danger/onConfirm/onCancel） | 日记覆盖确认、反馈确认、清空会话确认 |
| 图表（总结卡片/生长曲线） | `EcChart`（ECharts canvas 离屏渲染 + 截图，无层级问题） | 总结卡片可选折线图，生长曲线百分位图 |
| 导航栏 | `NavBar` / `RecordNavBar` | 对话页/日记页导航 |
| 加载态 | `PageLoading` | 首屏加载 |
| 登录引导 | `LoginGuide` | 游客/未登录拦截 |
| 自定义 TabBar | `TabBar`（含中心 FAB） | FAB 弹出菜单加「问敏宝助手」入口 |
| 底部操作栏 | `SubmitBar` | 可参考输入栏布局 |

### 7.3 对话页新增组件（自写，`pages/chat/components/`）

| 组件 | 职责 | 要点 |
|---|---|---|
| `MessageList` | 消息气泡列表（用户/助手左右布局） | `ScrollView scroll-y` + 触底自动滚动；**流式渲染**：text 事件增量 append 到当前气泡，不用重新渲染整列表（React 状态下仅更新最后一条） |
| `ChatInputBar` | 输入栏：[图片][输入框][语音][发送] | 键盘高度适配（`adjust-position`）；语音态切换输入框为录音按钮；周报/月报快捷按钮放在输入栏上方 |
| `SourceCard` | 知识来源卡片（可展开） | 渲染 sources 事件；展开显示来源详情（文章/指南名+证据级别） |
| `DataSourceBar` | 数据来源说明条 | 渲染 tool_result 后的数据口径 |
| `GuardrailCard` | 就医引导卡片 | emergency 时置顶高亮（红系），不走普通气泡 |
| `DiaryDraftCard` | 日记草稿卡片（M5） | 展示 diary 事件草稿 + [编辑][保存] |
| `ToolStatusTip` | 工具调用加载态 | "正在查询宝宝数据..."等，tool_call/tool_result 事件驱动 |

### 7.4 交互能力选型

| 能力 | 选型 | 理由/要点 |
|---|---|---|
| 流式 SSE | **手写解析器**（`src/api/sse.ts`），`wx.request({ enableChunked:true })` + `onChunkReceived` | 微信无 EventSource；不引第三方（体积）；同一解析器兼容模拟器完整响应降级 |
| 图片选择 | `Taro.chooseMedia`（拍照/相册）→ `Taro.compressImage`（quality80/1280）→ COS 直传 | 复用 2026-08-22 已验证直传链路；`Taro.previewImage` 放大预览 |
| 语音输入 | 复用 `VoiceRecorder` + `useVoiceInput` + `api/voice.ts` | 对话场景不做 NLU 结构化（与记录场景区别） |
| 宝宝切换 | 顶部上下文条自写（下拉选择宝宝）→ 重置 conversationId | 切换=新会话，无需服务端配合 |
| 虚拟列表 | 暂不需要 | 消息量小（单会话几十条）；不做 react-window 类库 |

### 7.5 样式与图标

- 样式：SCSS + 现有 design tokens（暖黄主色、圆角卡片、`src/styles/_ipad-adapt-mixins.scss` 大屏适配）；新增 `pages/chat/index.scss` 遵循现有规范；
- 图标：新增 `mic.svg` / `photo.svg` / `send.svg` / `diary.svg` 等放 `src/assets/icons/`，复用现有图标组件渲染；
- 无障碍/可点区：输入区按钮热区 ≥44px（现有规范）。

### 7.6 数据流与状态管理

```ts
// pages/chat/useChat.ts（对话页核心 hook）
interface ChatState {
  messages: Message[]            // { role, type:'text'|'image', text?, images?, sources?, guardrail? }
  streaming: boolean             // 是否流式输出中
  toolStatus: string | null      // 工具加载态文案
  conversationId: string | null
}
// 事件 → 状态映射：
//  text → append last message.text（增量）
//  tool_call/tool_result → toolStatus / DataSourceBar 数据
//  sources → 附到当前消息
//  diary → DiaryDraftCard
//  done/error → streaming=false
```

- 状态仅存页面级（React useState/useReducer），不引入全局状态库（redux/zustand 均不需要——对话状态生命周期 = 页面生命周期）；
- 会话恢复：进入页面时读 Storage 的 `conversationId`，首次消息携带；切换宝宝清空。
