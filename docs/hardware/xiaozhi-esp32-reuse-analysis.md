# xiaozhi-esp32 深度调研：可复用能力分析

> 调研时间：2026-08-23
> 项目：[78/xiaozhi-esp32](https://github.com/78/xiaozhi-esp32)（固件）+ [xinnan-tech/xiaozhi-esp32-server](https://github.com/xinnan-tech/xiaozhi-esp32-server)（后端服务）
> 目的：评估 minicare 音箱录入方案中可直接复用/参考的能力

---

## 1. 项目概览

**小智 AI（xiaozhi-esp32）** 是一个开源的 ESP32 语音交互智能体项目：

- **固件**（`78/xiaozhi-esp32`）：MIT 协议，ESP-IDF 6.0+，支持 **138 个板卡目录 / 171 个固件变体**
- **后端服务**（`xinnan-tech/xiaozhi-esp32-server`）：MIT 协议，华南理工大学刘思源教授团队主导，Python 实现（另有 Java/Go 版本）
- **定位**：语音交互入口 + 大模型（Qwen/DeepSeek 等）+ MCP 协议实现多端控制

```
用户语音 → ESP32 唤醒 → 录音(Opus) → 后端 ASR → LLM(带工具) → 工具调用 → TTS → 播报
```

---

## 2. 可直接复用的能力（核心结论）

### 2.1 完整语音交互链路（开箱即用）✅

后端服务已实现**全链路组件**，且均支持腾讯云：

| 模块 | 支持平台 | minicare 契合度 |
|---|---|---|
| ASR 语音识别 | **腾讯云**、火山、讯飞、阿里、百度、FunASR(本地)、SherpaASR | ⭐ 已有腾讯云 TCB 密钥，直接复用 |
| TTS 语音合成 | **腾讯云**、火山流式、讯飞、EdgeTTS(免费)、阿里、本地 FishSpeech/GPT-SoVITS | ⭐ 与 ASR 同源密钥 |
| LLM 大模型 | openai 兼容接口：DeepSeek、智谱、阿里百炼、火山、**任何 openai 格式** | 可接 DeepSeek（minicare agent-poc 已在用） |
| VAD 语音活动检测 | SileroVAD（本地免费） | 免第三方 |
| 声纹识别 | 3D-Speaker（本地免费） | ⭐ 多家庭成员自动识别说话人 |
| 意图识别 | function_call（LLM 函数调用）/ intent_llm / nointent | ⭐ 自定义工具入口 |

### 2.2 三种对接 minicare 业务的扩展机制 ⭐

| 机制 | 原理 | 对 minicare 的用法 |
|---|---|---|
| **自定义工具/插件**（function call） | 写一个插件模块，配好参数，LLM 自动识别意图并调用 | 写 `record_feeding` 等工具，内部调 minicare API 写入记录 |
| **MCP 接入点**（MCP Endpoint） | 标准 MCP server 挂到 xiaozhi，LLM 通过 MCP 协议调用工具 | 把 minicare 记录能力封装成 MCP server，动态挂载 |
| **上下文源**（Context Provider） | 唤醒瞬间 GET 一个 API，返回 JSON 自动注入 System Prompt | 唤醒时注入"旺仔今天奶量/睡眠/待记录项"，让 LLM 主动询问补录 |

**上下文源特别适合 minicare**：小智唤醒那一刻自动拉取旺仔健康数据状态，大模型能主动说"旺仔今天还差一次大便记录，要不要记一下"，实现**主动补录提醒**。

### 2.3 固件侧可直接使用 ✅

- **ESP-SR 离线唤醒词**：自定义唤醒词（如"旺仔记录"），断网也能唤醒
- **138 块板卡适配**：立创实战派 ESP32-S3、乐鑫 ESP32-S3-BOX-3、M5Stack CoreS3 等现成成品板
- **WebSocket + MQTT+UDP 双协议**：已标准化，后端无需改协议
- **Opus 音频流**：16kHz 单声道上行 / 24kHz 下行
- **配网**：热点 / BluFi 双方式
- **OTA 升级**：云端远程升级固件
- **显示屏/表情/情绪**：OLED/LCD 支持，体验完整
- 固件默认连 xiaozhi.me 官方服务器（免费），**可改配置连自建服务器**

---

## 3. 通信协议要点（对接自建后端必需）

### 3.1 WebSocket 协议（`docs/websocket_zh.md`）

- **握手**：设备连上后发 `{"type":"hello", "features":{"mcp":true}, "audio_params":{...}}`，服务器回 hello + session_id
- **请求头**：`Authorization: Bearer <token>`、`Device-Id`（MAC）、`Client-Id`（UUID）—— **天然支持设备级鉴权**，与 minicare 需新增的 device token 方案完全对齐
- **音频**：Opus 编码二进制帧，双向
- **消息类型**：`listen`（开始/停止录音）、`stt`（识别文本）、`tts`（合成开始/停止）、`mcp`（工具调用）、`system`（reboot 等）、`custom`（自定义消息，需编译期启用 CONFIG_RECEIVE_CUSTOM_MESSAGE）

### 3.2 MCP 协议（`docs/mcp-protocol_zh.md`）

- MCP 消息封装在 WebSocket/MQTT 的 `type:"mcp"` 消息里，payload 为标准 **JSON-RPC 2.0**
- 流程：hello 通告 `mcp:true` → `initialize` → `tools/list`（发现工具）→ `tools/call`（调用）
- **服务器→设备**方向也可以调（如让设备播报、控制音量）
- 设备端 MCP：控制设备（音量/灯光/GPIO）；**云端 MCP：扩展大模型能力**（对接业务系统）

### 3.3 MQTT+UDP（备选）

- 低带宽场景备选协议，日常 WebSocket 足够

---

## 4. 服务器端架构与部署

### 4.1 功能清单（全模块）

- 核心：MQTT+UDP 网关、WebSocket、HTTP 服务器、控制台认证
- 语音：流式 ASR、流式 TTS、VAD、多语言
- 智能：多 LLM、视觉 VLLM、意图识别、记忆（本地/mem0ai/PowerMem）、RAGFlow 知识库
- **工具调用**：客户端 IOT、客户端 MCP、服务端 MCP、**MCP 接入点**、**自定义工具函数**
- 管理：Web 智控台（用户/系统/设备管理）、插件系统（热加载）

### 4.2 部署要求

| 部署方式 | 配置要求 | 说明 |
|---|---|---|
| 最简化（Docker/源码） | 全 API：2核2G；用本地 FunASR：2核4G | 数据存配置文件，无数据库 |
| 全模块（Docker/源码） | 全 API：2核4G；本地 FunASR：4核8G | 多用户/多智能体 + 智控台 |

> 自 0.5.2 支持流式配置，响应快约 2.5s。官方警告"未通过网络安全测评，请勿直接暴露公网"，部署需加防护。

### 4.3 插件示例（`docs/weather-integration.md`）

以天气插件 `get_weather` 为例，接入外部 API 只需：
1. 写插件模块（调用外部 HTTP API）
2. 在 `data/.config.yaml` 的 `plugins:` 段配 `api_key` / `api_host` 等
3. LLM 识别意图后自动调用，无需改核心代码

**minicare 对照**：写一个 `plugins: record_baby_data` 插件，内部调用 minicare API（POST 记录），配置 device token 即可。

---

## 5. 对 minicare 音箱录入方案的具体映射

### 5.1 推荐架构（基于本次调研更新）

```
ESP32 音箱 (xiaozhi 固件)
  ├─ 自定义唤醒词 "旺仔记录"
  └─ 录音(Opus) → WebSocket (Bearer device_token)
        ↓
xiaozhi-esp32-server (自建, Docker)
  ├─ ASR: 腾讯云 (复用 TCB_SECRET_ID/KEY)
  ├─ LLM: DeepSeek (minicare agent-poc 同款) 或 qwen
  ├─ 工具: 自定义插件 record_baby / 或 MCP 接入点挂 minicare-mcp
  ├─ 上下文源: GET minicare /api/.../daily-summary → 注入"旺仔今日状态"
  └─ TTS: 腾讯云 (同密钥)
        ↓
minicare-server
  ├─ 新增: 设备鉴权 (device token) + 记录写入接口(已有 records API 可复用)
  └─ 新增: 语音 NLU 复用 (现有混元 prompt 逻辑抽成文本接口)
```

### 5.2 与之前调研方案的变化

之前方案 B1 需要自己写"xiaozhi server → minicare parse-text"桥接；**现在确认 xiaozhi-esp32-server 原生支持**：

- **方案升级**：不需要自研文本 NLU 桥接——直接用 xiaozhi 的 LLM + function_call 工具机制，让 DeepSeek 识别"记录奶粉 120 毫升"意图，调用自定义工具写 minicare。混元 NLU 可保留用于手机端。
- **或保留混元**：把 minicare 的混元 NLU prompt 逻辑封装成 MCP 工具/microservice，xiaozhi 通过 MCP 接入点调用，解析结果回填。两种路线二选一。
- **主动补录**：上下文源注入今日状态，大模型主动提醒漏记项。

### 5.3 需要开发的部分（minicare 侧）

| 项目 | 工作量 | 说明 |
|---|---|---|
| 设备鉴权（device token） | 0.5-1 天 | family 下生成长期 token，音箱握手 Bearer 携带 |
| records API 供工具调用 | 已有 ✅ | POST /api/family/:familyId/records/feeding 等，工具内部调用 |
| 今日状态摘要接口（上下文源） | 0.5 天 | GET 返回 {code:0, data:{...}} 格式 |
| （可选）minicare-mcp server | 1-2 天 | 标准 MCP server 封装记录能力，挂到 xiaozhi |
| xiaozhi-server 部署 | 0.5-1 天 | Docker，腾讯云 ASR/TTS 密钥，DeepSeek API |
| 固件烧录 + 自定义唤醒词 | 0.5 天 | xiaozhi 网页端 Assets 生成器在线改 |

---

## 6. 风险与注意

1. **官方警告未过等保**：自建 server 勿直接暴露公网，建议内网 + 反向代理/网关鉴权
2. **LLM 工具误调用**：function_call 依赖大模型判断，关键写入前需 TTS 二次确认（如"确认记录 120 毫升奶粉？"）—— minicare 现有 confidence 机制可参考
3. **数据合规**：腾讯云 ASR/TTS 上传音频，与现状手机链路一致，无新增暴露面
4. **多设备声纹**：3D-Speaker 本地声纹可区分说话人，多成员家庭建议启用（防爸爸误记成旺仔数据）⚠️ **家庭数据隔离是硬需求**
5. **网络依赖**：唤醒离线可用，但 ASR/LLM 需网络；断网可降级本地 FunASR（效果降级）
6. **固件版本**：主线已迁移 ESP-IDF 6.0，旧板卡需查兼容表；官方推荐免开发环境直接烧录预编译固件

---

## 7. 结论

**xiaozhi-esp32 生态成熟度远超预期，minicare 音箱录入的"音箱端 + 语音链路"几乎可以全盘复用**：

1. ✅ **零开发获得**：完整语音交互（唤醒/ASR/LLM/TTS/声纹/OTA）、138 板卡适配、WebSocket 标准化协议
2. ✅ **天然支持腾讯云 ASR/TTS**：与 minicare 现有 TCB 密钥体系一致
3. ✅ **三种对接机制**（插件 / MCP 接入点 / 上下文源）覆盖"写记录、查状态、主动提醒"全部需求
4. ✅ **设备级鉴权天然对齐**：握手 Header 带 Bearer token，正好是 minicare 要新增的 device token 方案
5. ⚠️ 真正要开发的只剩 minicare 侧：设备鉴权 + 今日摘要接口 + 工具封装（合计约 2-4 人日）

**推荐路线**：Docker 部署 xiaozhi-esp32-server（腾讯云 ASR/TTS + DeepSeek）→ 写 minicare 自定义工具插件（或 MCP 接入点）→ minicare 新增设备鉴权 + 今日状态接口 → 立创实战派 ESP32-S3 烧录 + 自定义唤醒词"旺仔记录" → 联调。

---

## 8. 参考链接

- 固件 README：https://github.com/78/xiaozhi-esp32
- 后端服务 README：https://github.com/xinnan-tech/xiaozhi-esp32-server
- WebSocket 协议：https://github.com/78/xiaozhi-esp32/blob/main/docs/websocket_zh.md
- MCP 协议流程：https://github.com/78/xiaozhi-esp32/blob/main/docs/mcp-protocol_zh.md
- MCP 接入点：https://github.com/xinnan-tech/xiaozhi-esp32-server/blob/main/docs/mcp-endpoint-integration.md
- 上下文源：https://github.com/xinnan-tech/xiaozhi-esp32-server/blob/main/docs/context-provider-integration.md
- 天气插件示例：https://github.com/xinnan-tech/xiaozhi-esp32-server/blob/main/docs/weather-integration.md
- 声纹识别：https://github.com/xinnan-tech/xiaozhi-esp32-server/blob/main/docs/voiceprint-integration.md
- 部署文档：https://github.com/xinnan-tech/xiaozhi-esp32-server/blob/main/docs/Deployment.md
