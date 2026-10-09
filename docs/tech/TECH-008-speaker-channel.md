# 技术方案：音箱对话渠道「小宝小宝」

> 关联 PRD：`docs/prd/PRD-004.md`
> 上级方案：`docs/tech/TECH-006-minicare-agent-plan.md`（minicare-agent）
> 调研依据：`docs/xiaozhi-esp32-reuse-analysis.md`、`docs/speaker-voice-input-research.md`
> 版本：v0.1 ｜ 日期：2026-08-23

## 1. 架构总览

### 1.1 整体架构

音箱渠道是「敏宝助手」的**语音硬件入口**：ESP32 音箱只承担语音桥（唤醒/录音/播放），全部业务智能由 minicare-agent 承担。

```
┌─────────────────────────────────────────────────────────────────┐
│  家庭环境                                                        │
│                                                                 │
│  ┌─────────────────┐   WebSocket   ┌──────────────────────────┐ │
│  │ ESP32 音箱        │◀────────────▶│ xiaozhi-esp32-server     │ │
│  │ (立创实战派 S3)    │  (Bearer     │  (自建 Docker)            │ │
│  │  ESP-SR 唤醒      │   device_token│  ├─ 唤醒/会话状态机        │ │
│  │  Opus 录音/播放   │              │  ├─ ASR 腾讯云(16k_zh)     │ │
│  └─────────────────┘              │  ├─ TTS 腾讯云             │ │
│     触摸屏/OTA/配网                  │  └─ LLM Adapter ────────┐  │ │
│                                    └──────────────────────────┼──┘ │
└────────────────────────────────────────────────────────────────┼───┘
                                                                 ▼
┌────────────────────────────────────────────────────────────────────┐
│  minicare-server (CloudRun, 复用现有域名 + 鉴权体系)                   │
│                                                                    │
│  ┌──────────────┐   ┌────────────────┐   ┌─────────────────────┐  │
│  │ DeviceModule │   │ DeviceGuard    │   │ device/chat 代理     │  │
│  │ (新增)        │   │ (新增, token)   │   │ (复用 AgentService   │  │
│  │ 绑定码/设备表  │   │ 设备→family    │   │  proxyChat 逻辑)     │  │
│  └──────────────┘   └────────────────┘   └─────────┬───────────┘  │
│                                                    │ x-agent-token │
│                                                    ▼               │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  minicare-agent（不暴露公网）                                    │   │
│  │  知识库检索 / 数据工具(CynosDB) / 风险护栏 / 会话历史            │   │
│  └─────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘
```

**核心链路**（一次语音问答）：

```
用户说"小宝小宝，旺仔今天奶量怎么样"
  → ESP-SR 离线唤醒 → Opus 录音上行
  → xiaozhi-server ASR(腾讯云) 转文字
  → LLM Adapter: 组装 {message, conversationId} → POST minicare-server /api/device/chat
  → DeviceGuard 校验 device token → 解析 familyId/babyId
  → 复用 AgentService.proxyChat → minicare-agent /chat (SSE 流式)
  → agent 检索知识库/查数据/护栏 → 流式文本回传
  → LLM Adapter 把 SSE 流转为 xiaozhi 流式协议
  → xiaozhi-server TTS(腾讯云) 合成语音 → Opus 下行 → 音箱播报
```

### 1.2 核心设计决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 硬件 | 立创·实战派 ESP32-S3（N16R8，xiaozhi 固件） | xiaozhi 官方首推板型，带屏+双麦+摄像头，固件免环境烧录 |
| 语音链路 | xiaozhi-esp32-server 自建（Docker） | 完整唤醒/ASR/TTS/会话状态机，MIT 开源，数据可控 |
| ASR/TTS | 腾讯云（复用 TCB_SECRET_ID/KEY） | 与 minicare 现有语音链路密钥体系一致，零新增成本 |
| 业务对话 | **全部走 minicare-agent**（xiaozhi LLM 换成自定义 Adapter） | 复用知识库/数据/护栏/会话，不建第二套 AI 链路 |
| 闲聊兜底 | 关闭（方案 A） | 边界清晰，非 minicare 问题由 agent 播报引导语 |
| 设备鉴权 | minicare-server 签发长期 device token，握手 Bearer 携带 | xiaozhi 协议天然支持 Authorization header，对齐 JWT 体系 |
| 绑定码 | 6 位数字、永久有效、一次性、可撤销 | 用户拍板（家庭私有设备，长期持有） |
| 绑定粒度 | 绑家庭不绑人，默认所有家庭用户可用 | 用户拍板；声纹识别二期 |
| 会话延续 | 复用 minicare-agent 会话线程（最近 20 条） | 跨唤醒延续，无需音箱侧存历史 |
| 数据存储 | MySQL 新增 device 表 + 绑定码（迁移 019） | 与现有数据库体系一致（017=knowledge_base、018=baby_diary 已占用） |

### 1.3 与既有模块的关系

| 既有模块 | 复用/扩展 |
|---|---|
| `src/agent/agent.service.ts` | **复用** `proxyChat` / `buildCtx` / `verifyBaby`，新增设备通道入口 |
| `src/auth/jwt.guard.ts` | **参考** token 校验模式，新增 DeviceGuard（校验 device token 而非 JWT） |
| `src/common/database` | 复用 DATABASE_POOL |
| `minicare-agent` | **零改动**，device/chat 代理复用同一内部协议（x-agent-token + x-agent-ctx） |
| migrations | 新增 `019_speaker_device.sql`（017/018 已占用） |

---

## 2. 数据模型（迁移 019）

### 2.1 `speaker_device`（音箱设备表）

```sql
CREATE TABLE speaker_device (
  id            CHAR(36)     NOT NULL PRIMARY KEY,          -- UUID
  family_id     CHAR(36)     NOT NULL,                      -- 绑定家庭
  device_name   VARCHAR(64)  NOT NULL DEFAULT '小宝音箱',     -- 设备名称
  device_type   VARCHAR(32)  NOT NULL DEFAULT 'esp32-s3',    -- 硬件型号
  mac_address   VARCHAR(32)  NULL,                           -- 设备 MAC（xiaozhi Device-Id）
  client_id     VARCHAR(64)  NULL,                           -- xiaozhi Client-Id（重装固件重置）
  token_hash    VARCHAR(128) NOT NULL,                       -- device token 哈希（不存明文）
  status        VARCHAR(16)  NOT NULL DEFAULT 'active',      -- active / revoked
  bound_by      CHAR(36)     NOT NULL,                       -- 绑定操作人（管理员 user_id）
  bound_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at  DATETIME     NULL,                           -- 最近一次会话
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at    DATETIME     NULL,
  KEY idx_device_family (family_id, status),
  KEY idx_device_mac (mac_address)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='音箱设备绑定';
```

### 2.2 `speaker_binding_code`（绑定码表）

```sql
CREATE TABLE speaker_binding_code (
  id          CHAR(36)    NOT NULL PRIMARY KEY,
  family_id   CHAR(36)    NOT NULL,
  code        CHAR(6)     NOT NULL,                          -- 6 位数字
  status      VARCHAR(16) NOT NULL DEFAULT 'pending',        -- pending / used / revoked
  created_by  CHAR(36)    NOT NULL,                          -- 管理员 user_id
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  used_at     DATETIME    NULL,
  used_device CHAR(36)    NULL,                              -- 绑定成功的设备 id
  KEY idx_code_family (family_id, status),
  UNIQUE KEY uk_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='音箱绑定码（永久有效）';
```

> 规则：`speaker_binding_code` 每家庭同一时刻仅 1 条 `pending`（生成新码前先撤销旧的）。

### 2.3 token 生成与校验

- **生成**：`device_token = randomBytes(32).toString('hex')`（64 位十六进制），DB 只存 `sha256(token)`。
- **校验**：音箱握手带 `Authorization: Bearer <token>` → DeviceGuard 查 `token_hash = sha256(token)` 且 `status='active'` 且 `deleted_at IS NULL` → 命中返回 `(familyId, deviceId)`。
- **吊销**：解绑 → `status='revoked'` → 校验立即失败。

---

## 3. API 设计

> 遵循现有约定：全局前缀 `/api`、无响应包装、JWT 体系。新增接口分两类：**小程序管理端**（JWT）与**音箱服务端**（DeviceGuard）。

### 3.1 管理端（JwtGuard + FamilyMemberGuard + 管理员校验）

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| POST | `/api/family/:familyId/devices/binding-code` | 生成/刷新绑定码（旧码自动撤销） | 管理员 |
| GET | `/api/family/:familyId/devices` | 已绑设备列表 | 家庭成员 |
| DELETE | `/api/family/:familyId/devices/:deviceId` | 解绑（token 立即失效） | 管理员 |

**POST /binding-code 响应**：
```json
{ "code": "483920", "expires": null, "note": "永久有效，绑定成功后自动失效" }
```

### 3.2 设备服务端（DeviceGuard，供 xiaozhi-server 调用）

| 方法 | 路径 | 说明 | 鉴权 |
|---|---|---|---|
| POST | `/api/device/bind` | 绑定码换取 device token（xiaozhi 配网后调用） | 无（凭绑定码） |
| POST | `/api/device/chat` | 音箱对话（SSE，转 minicare-agent） | DeviceGuard |
| GET | `/api/device/health` | 探活 | DeviceGuard |

**POST /api/device/bind 请求**：
```json
{ "code": "483920", "device_name": "客厅音箱", "device_type": "esp32-s3", "mac_address": "AA:BB:..." }
```
**响应**：
```json
{ "device_id": "uuid", "family_id": "uuid", "default_baby_id": "uuid", "device_token": "64位hex" }
```
> `default_baby_id`：家庭第一个宝宝（MVP 单宝宝默认；二期声纹识别后按人归属）。

**POST /api/device/chat 请求**（xiaozhi LLM Adapter 组装）：
```json
{ "conversation_id": "uuid（音箱会话线程，跨唤醒复用）", "message": "旺仔今天奶量怎么样", "model": "flash" }
```
> 鉴权走 Authorization Bearer device_token；`familyId/babyId` 由 DeviceGuard 从 token 解析注入（模型不可见），与 `/api/agent/chat` 的 ctx 机制一致。

### 3.3 DeviceGuard 实现要点

```ts
// 参考 jwt.guard.ts，token 为 64 位 hex 而非 JWT
async canActivate(ctx) {
  const token = extractBearer(req);                    // 复用 JwtGuard.extractToken
  const hash = sha256(token);
  const [rows] = await db.execute(
    `SELECT id, family_id FROM speaker_device
     WHERE token_hash = ? AND status = 'active' AND deleted_at IS NULL`,
    [hash]);
  if (!rows.length) throw new UnauthorizedException('设备凭证无效或已解绑');
  (req as any).deviceContext = { deviceId: rows[0].id, familyId: rows[0].family_id };
  return true;
}
```

---

## 4. xiaozhi-esp32-server 集成（LLM Adapter）

### 4.1 为什么需要 Adapter

xiaozhi-server 的 LLM 组件是 openai 兼容协议（请求 `messages[]`，流式返回 token）；而 minicare-agent 的 `/chat` 是自定义 SSE 协议（x-agent-token + x-agent-ctx + 帧级透传）。两者不能直连，需要一层**协议适配**。

### 4.2 Adapter 方案（两种，推荐 A）

**方案 A：minicare-server 内置 LLM Adapter（推荐）**
- xiaozhi-server 配置 LLM type = openai，base_url 指向 `https://www.minicare.top/api/device/llm`（带 device_token）
- minicare-server 新增 `POST /api/device/llm`（DeviceGuard + openai 兼容入参解析）：
  - 入参：`{ model, messages: [{role, content}...] }`
  - 取出最后一条 user content 作为 message，conversationId 从 `messages` 中系统消息里携带（或 headers）
  - 内部调 minicare-agent `/chat`（复用 proxyChat），把 SSE 流转为 **openai 流式格式**（`data: {"choices":[{"delta":{"content":"..."}}]}`）
- 优点：AgentService 复用度高，鉴权集中 minicare；xiaozhi 侧零改协议
- 缺点：minicare-server 多一个协议转换端点（约 60-100 行）

**方案 B：独立网关（adapter 服务）**
- 单独部署一个转换服务，xiaozhi → adapter → minicare-agent
- 优点：minicare-server 零侵入；缺点：多一个服务要部署运维

> **MVP 采用方案 A**：xiaozhi-server 配 openai 兼容 LLM 指向 minicare 的 `/api/device/llm`，协议转换在 minicare-server 内完成，复用 agent 代理层。

### 4.3 xiaozhi-server 配置要点（config.yaml）

```yaml
llm:
  type: "openai"
  base_url: "https://www.minicare.top/api/device/llm"   # minicare 设备 LLM 入口
  api_key: "<device_token>"                              # 握手 Bearer
  model: "flash"                                         # minicare-agent 默认模型

asr:
  type: "tencent"                                        # 腾讯云 ASR（复用 TCB_SECRET_ID/KEY）
tts:
  type: "tencent"                                        # 腾讯云 TTS
```

### 4.4 会话线程映射（跨唤醒延续）

| xiaozhi 概念 | minicare 映射 |
|---|---|
| 设备 `Client-Id`（固件 UUID） | DeviceGuard 解析 deviceId |
| 会话 `session_id` | 每次唤醒会话 = agent 对话线程 `conversationId` |
| 跨唤醒延续 | xiaozhi-server 按 deviceId 持久化 `last_conversation_id`，下次唤醒复用 |

> xiaozhi-server 需在 LLM Adapter 回调时带上持久化的 conversationId；MVP 可先用 Redis/内存 Map（单家庭单音箱，Map 足够），多设备后落 DB。

---

## 5. 小程序端（minicare-mp）改动

| 页面 | 改动 | 复用 |
|---|---|---|
| 「家庭管理 → 智能设备」新增 | 设备列表 / 添加音箱（生成绑定码）/ 解绑 | `familyApi` + 新 `deviceApi` |
| 设置页（可选） | 音箱提醒开关（二期主动补录用） | 预留 |

**新增 `src/api/device.ts`**：
```ts
export const deviceApi = {
  list: (familyId) => request(`/api/family/${familyId}/devices`),
  genCode: (familyId) => request(`/api/family/${familyId}/devices/binding-code`, { method: 'POST' }),
  unbind: (familyId, deviceId) => request(`/api/family/${familyId}/devices/${deviceId}`, { method: 'DELETE' }),
}
```

---

## 6. 部署方案

| 组件 | 部署 | 配置要求 | 说明 |
|---|---|---|---|
| xiaozhi-esp32-server | **CloudRun Container 模式（已拍板）** | 2核2G（全 API 模式） | 与 minicare-api / minicare-agent 同环境；WebSocket 长连接需 PUBLIC 访问（音箱从家庭网络接入） |
| minicare-server | CloudRun 现有服务 | 追加 DeviceModule | 新增 env 见下 |
| minicare-agent | CloudRun 现有（TECH-006） | 零改动 | 复用现有内部协议 |

### 6.1 xiaozhi-server → CloudRun 适配点（关键）

CloudRun 是无状态托管，xiaozhi-server 默认内存态需适配：

| 适配点 | 问题 | 方案 |
|---|---|---|
| 会话状态外置 | 设备连接态/`last_conversation_id` 在内存，实例回收即丢 | 落 CloudBase 数据库（`speaker_device` 表加 `last_conversation_id` 字段或新增会话表）；M2 一并实现 |
| 公网暴露 | 音箱从家庭 WiFi 连入必须 PUBLIC | 开放必要路径（`/xiaozhi/v1` WebSocket、`/xiaozhi/ota`）+ 设备 token 握手鉴权兜底；防火墙/网关收口（P2 加固） |
| 冷启动 | 实例缩容后唤醒延迟 5-10s | `MinNum: 1` 保持常驻 |
| 端口 | Container 必须监听平台注入 `PORT` | Dockerfile/入口适配（xiaozhi-server 官方 Dockerfile 监听固定端口，需改为读取 `PORT` 环境变量） |
| UDP 备选协议 | CloudRun 不支持 UDP（MQTT+UDP 备选协议） | 固件配置使用 **WebSocket 协议**（默认即可），不阻塞 |

### 6.2 CloudRun 服务配置（部署参数）

```json
{
  "serverName": "minicare-xiaozhi",
  "serverConfig": {
    "OpenAccessTypes": ["PUBLIC"],
    "Cpu": 2,
    "Mem": 4,
    "MinNum": 1,
    "MaxNum": 2
  }
}
```

**minicare-server 新增 env**：
```
（无新增必填——device token 自签发存储；xiaozhi 调用复用现有 AGENT_BASE_URL/AGENT_INTERNAL_TOKEN）
```

**xiaozhi-server env**：腾讯云 ASR/TTS 密钥、DeepSeek（如 Adapter 需回退）、minicare `/api/device/llm` 地址与 device_token。

> ⚠️ 沿用既有约束：minicare-server 部署不得在 `serverConfig.EnvParams` 传 env（会整体替换致 JWT_SECRET 失效）；xiaozhi-server 未过等保，PUBLIC 暴露靠 device token + 路径收口缓解。

---

## 7. 测试验证

### 7.1 分层测试

| 层 | 内容 | 方式 |
|---|---|---|
| 单测 | DeviceGuard、binding-code 生成/撤销、token 哈希 | Jest（minicare-server 既有测试） |
| 集成 | bind → 生成 token → device/chat 鉴权 → 越权拒绝 | Nest e2e |
| 模拟设备联调 | py-xiaozhi（Mac）连 xiaozhi-server → LLM Adapter → minicare-agent | 本地全链路（M1 里程碑） |
| 真机验证 | 立创实战派 S3 烧录 → 配网 → 绑定 → 对话/录入 | 硬件到货后（M3 里程碑） |

### 7.2 关键验收用例

1. **绑定**：生成码 → bind → 返回 token；重复使用同码 → 拒绝（已 used）
2. **鉴权**：无 token / 错误 token / revoked token 调 /api/device/chat → 401
3. **对话**：有效 token 调 /api/device/chat → SSE 流式回答；断连 abort 上游
4. **越权**：A 家庭 token 访问 B 家庭数据 → 403（ctx 注入 familyId 隔离）
5. **解绑**：DELETE 后 → 原 token 立即 401
6. **语音链路**（py-xiaozhi）：唤醒 → 提问 → 播报回答；"喝了120ml" → 写库 + 回读确认

### 7.3 模拟设备联调命令（M1）

```bash
# 1. 启动 xiaozhi-esp32-server（Docker，配置见 4.3）
# 2. Mac 上启动 py-xiaozhi 模拟设备
git clone https://github.com/huangjunsen0406/py-xiaozhi && cd py-xiaozhi
pip install -e .
python main.py --protocol websocket   # 连自建 xiaozhi-server
# 3. 说唤醒词 + 问题，验证全链路
```

---

## 8. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| xiaozhi-server 未过等保 + CloudRun PUBLIC 暴露 | 公网暴露风险 | 仅开放必要路径（/xiaozhi/v1、/xiaozhi/ota）+ 设备 token 握手鉴权兜底 + P2 防火墙收口；minicare /api/device/llm 有 DeviceGuard 兜底 |
| CloudRun 实例回收丢会话 | 跨唤醒延续失效 | 会话状态外置（speaker_device 表持久化 last_conversation_id）+ MinNum:1 常驻 |
| CloudRun 不支持 UDP | MQTT+UDP 备选协议不可用 | 固件走 WebSocket 协议（默认） |
| LLM Adapter 协议转换 bug | 音箱无回答 | 方案 A 转换层单测覆盖 openai 流式格式；保留 xiaozhi 原生 LLM 回退配置 |
| 模拟麦适配（ZTS6216 模拟输出） | 真机录音异常 | xiaozhi 固件需适配 ES7210 ADC 通道；如遇阻换 I2S 数字麦板型或调固件 codec |
| 设备 token 泄露 | 家庭数据风险 | 64 位随机 + 只存哈希；解绑即吊销；定期轮换（P2） |
| 单家庭单音箱限制 | 扩展性 | MVP 明确单家庭；多设备时 conversationId 落 DB + 设备维度隔离 |
| 会话延续依赖 agent | agent 不可用时无历史 | minicare-agent 已有会话持久化（FlexDB），音箱侧仅存 last_conversation_id |

---

## 9. 里程碑拆分（对齐 PRD-004）

| 里程碑 | 内容 | 验收 |
|---|---|---|
| M1 本地模拟 | xiaozhi-server Docker + py-xiaozhi + 腾讯云 ASR/TTS | 模拟设备唤醒→提问→播报全链路 |
| M2 后端接入 | DeviceModule（迁移 019）+ DeviceGuard + /api/device/llm Adapter + 小程序设备页 | 模拟设备完成"问奶量/录奶量" |
| M3 硬件联调 | 立创 S3 烧录固件 + 配网绑定 + 真机全流程 | 真机通过 PRD-004 全部验收 |
| M4 打磨 | 异常降级、话术、性能（端到端 <5s） | 验收标准全绿 |
