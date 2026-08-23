# 小米智能摄像机「母婴看护版」接入 minicare 调研报告

> 调研日期：2026-08-21
> 设备型号：`chuangmi.camera.066a01`（小米智能摄像机 母婴看护版，MIoT-Spec v4）
> 目标：将设备检测到的**图像、睡眠、哭声/咳嗽事件等数据**接入 minicare 小程序

---

## 一、结论摘要

1. **设备本身具备丰富的可观测数据**，且以「事件」为主：`宝宝入睡/宝宝睡醒`（这是天然的睡眠记录来源）、`识别到宝宝哭声`、`识别到咳嗽`、`较大声响`、`画面变动`、`有人进入/离开围栏`、`口鼻遮挡` 等，均有对应的 MIoT 事件定义。
2. **小米不提供面向第三方 App 的官方开放接口来读取他人米家设备数据**。`小米 IoT 控制端 API` 只对「设备制造商」开放（接入的设备须是自己用小米模组/SDK 直连接入的产品）；`Home Assistant 米家集成` 虽有官方云端接口，但**许可证明确限制仅可在 Home Assistant 中非商业使用**，不能直接用于 minicare。
3. **可行且现实的主路径**：通过社区/逆向实现的「米家云 API」（`api.io.mi.com`，与 HA 集成同源的云端通道），在 minicare-server 新增一个「设备接入」模块，定时轮询 `get_user_device_data` 拉取事件历史，映射成 sleep 等记录，并推送实时提醒。
4. **"睡眠数据"的本质**：本设备没有"睡眠质量/时长统计"的成品 API，能拿到的是 `baby-sleep` / `baby-wakeup` 两个事件 → minicare 现有 `sleep_record` 表可无缝承接（入睡/醒来时间、睡眠时长）。
5. **"图像数据"**：AI 事件在米家云端通常关联截图/短视频（云存储或事件媒体），可通过云 API 拿到 CDN 链接，下载到 CloudBase 存储后随事件落库展示。
6. **合规风险需正视**：婴儿画面属敏感个人信息；非官方 API 有被风控/变更/封号风险；token 安全存储要求高。建议先做 PoC 验证接口稳定性，再决定正式功能范围。

---

## 二、设备能力盘点（MIoT-Spec v4）

数据来源：`https://home.miot-spec.com/spec/chuangmi.camera.066a01`（产品说明书页为动态加载，规格以 miot-spec 为准）。

| 服务 (siid) | 与 minicare 相关的属性/事件 |
|---|---|
| **ai-detection (#8)** | 属性：`babycry-detection-switch`(哭声开关)、`cough-detection-switch`、`sound-detection-switch`、`human-detection`、`move-detection`、`face-detection-switch`<br>事件：**`detected-babycry-event`(识别到宝宝哭声)**、`cough-detected`(识别到咳嗽)、`louder-sound`(较大声响)、`someone-appeared`、`object-motion`(画面变动) |
| **smart-care (#13)** | 属性：`smart-care-switch`、`smart-care-area`、**`smart-care-mode`(0=Key Areas / 1=Baby Sleep / 2=Long Time No Move)**、`enable-time-period` |
| **virtual-fence (#16)** | 属性：`virtual-fence-switch`、`virtual-fence-area`<br>事件：**`people-fence-in`(有人进入围栏)**、`people-fence-out` |
| **ai-sensitivity (#17)** | 哭声/咳嗽/响声/画面变动/面部遮挡灵敏度（0=Low 1=Medium 2=High） |
| **ai-self (#18)** | 属性：`private-area-switch`、`virtual-fence-dir`、`expression-switch`、`mouth-nose-cover`、**`wake-up-switch`(睡醒检测)**、**`face-cover-mode`(睡眠检测时间: 0=All-Day / 1=Sleep-Only)**<br>事件：**`baby-sleep`(宝宝入睡)**、**`baby-wakeup`(宝宝睡醒)**、`expression`、`mouth-nose-cover` |
| **p2p-stream (#9)** | 动作：`start-p2p-stream`、`stop-stream`、**`upload-video`(录制视频并上传)** — 用于实时视频流/主动录屏 |
| **camera-control (#2)** | 属性：`on`、`night-shot`、`recording-mode`、`hdr-mode` 等 |
| **memory-card-management (#4)** | 存储状态、总/剩余/已用空间、剩余录制时长 |
| **screen-control (#19)** | 看护屏（5 寸屏）的报警开关矩阵：`scrn-alarm-bbcry`、`scrn-alarm-cough`、`scrn-alarm-people`、`alarm-asleep`、`alarm-wake-up` 等（屏端配置，可忽略） |

**要点**：
- 睡眠数据 = `baby-sleep` / `baby-wakeup` 事件（配合 `smart-care-mode=Baby Sleep`、`wake-up-switch`、`face-cover-mode` 开关）。
- 异常提醒 = 哭声/咳嗽/响声/围栏事件。
- 图像 = AI 事件关联的云存储截图/视频（经米家云 API 获取媒体链接）。
- 事件历史存储：小米 IoT 平台 SDS 存储约 60–185 天，单次查询上限 1000 条，粒度 1 秒。

---

## 三、接入路径对比

| 路径 | 说明 | 可行性 | 风险/限制 |
|---|---|---|---|
| **A. 小米 IoT 控制端 API（官方）** | `api.home.mi.com`，需要 App-Id（dev.mi.com 申请） | ❌ 不可行 | 仅限「自己用小米模组/SDK 接入的设备」；`chuangmi.camera.066a01` 是小米自研产品，开发者无法拿到其设备列表与数据 |
| **B. Home Assistant 米家集成（官方 ha_xiaomi_home）** | OAuth2 登录 + MQTT 订阅小米云，实时收事件 | ⚠️ 不可直接用 | 许可证明文限制仅限 HA 内**非商业**使用；不能套用到 minicare。但内部机制（`miot_cloud` 的 HTTP/MQTT 通道）与路径 C 同源，是绝佳参考实现 |
| **C. 米家云 API（社区/逆向，推荐主路径）** | `api.io.mi.com`，签名请求；扫码登录拿 `userId/ssecurity/serviceToken`；`user/get_user_device_data` 拉事件历史、`miot/device_attributes` 读属性 | ✅ 可行 | 非官方，接口可能变更/风控；需加密存 token；社区实现：`mijia-api`(Python)、`xiaomi-cloud-tokens-extractor`、`python-miio` |
| **D. 局域网直连（P2P/RTSP）** | 通过 P2P(TUTK/MISS) 或局域网协议直取视频流/状态 | ⚠️ 条件可行 | minicare 后端跑在 CloudRun（云上），无法触达家庭局域网；需用户侧自备网关/边缘节点（如 NAS、树莓派）。适合「实时视频流」场景，不适合纯云架构 |
| **E. 米家自动化/通知外链** | 米家 App 智能场景仅支持米家生态内联动 | ❌ 不可行 | 无通用 webhook 能力，无法触达微信小程序 |

**结论**：MVP 采用 **路径 C（米家云 API 轮询）**，后续如需实时视频流再评估路径 D 的边缘网关方案。

---

## 四、推荐架构

```
┌─────────────┐  绑定小米账号(扫码/输入)  ┌────────────────────────────────┐
│ minicare-mp │ ◀─── /api/devices/* ──── │      minicare-server           │
│ (微信小程序) │                          │  新增 xiaomi-camera 模块       │
└─────────────┘  记录/提醒展示            │  ┌──────────────────────────┐  │
        ▲                                │  │ XiaomiCloudService      │  │
        │ WebSocket 实时提醒              │  │  - token 加密存储        │  │
        │ (现有 /ws gateway)             │  │  - 签名请求 api.io.mi.com│  │
        │                                │  └──────────────────────────┘  │
        │                                │  ┌──────────────────────────┐  │
        │                                │  │ SyncService (Cron 轮询)   │  │
        │                                │  │  - get_user_device_data  │  │
        │                                │  │  - 事件→记录映射          │  │
        │                                │  └──────────────────────────┘  │
        └────────────────────────────────│  ┌──────────────────────────┐  │
                                         │  │ CloudBase Storage        │  │
                                         │  │  - 事件截图/短视频落库     │  │
                                         │  └──────────────────────────┘  │
                                         └────────────────────────────────┘
                                                    │ 签名请求
                                                    ▼
                                         api.io.mi.com (米家云)
                                                    │
                                               chuangmi.camera.066a01
```

### 关键实现点

1. **绑定流程**（小程序新页面「设备接入」）
   - 引导用户用**米家 App 扫码登录**（社区库生成登录二维码 → 用户用米家 App 扫 → 换取 `userId / ssecurity / serviceToken`）。
   - token 用项目现有的加密方式落库（建议拆独立表 `device_binding`，字段：`user_id, family_id, xiaomi_user_id, service_token, ssecurity, device_did, device_model, status, expires_at`）。
   - 用 `home/devicelist` 拉取用户设备列表，让用户选择要绑定的摄像机（model=`chuangmi.camera.066a01`）。

2. **事件轮询**（复用现有 `scheduler/tasks.service.ts` 的 `@Cron`，建议每 30s~1min）
   - 调用 `user/get_user_device_data`：`{ did, type: 'event', key: '18.8'/'18.9'/..., time_start, time_end, limit }`（key 格式 `siid.eiid`）。
   - 事件 → minicare 记录映射（见下表），写入后复用现有 `timelineService.upsertFromSource` 与 `EventsGateway.broadcast()` 推送到小程序。

3. **数据映射**

| 米家事件 | key (siid.eiid) | minicare 落点 |
|---|---|---|
| `baby-sleep` 宝宝入睡 | `18.8` | `sleep_record`：`status=ongoing`，`source=xiaomi`（需先加 `source` 字段），联动现有「进行中睡眠互斥」逻辑 |
| `baby-wakeup` 宝宝睡醒 | `18.9` | `sleep_record`：`endSleep`，计算时长、`sleep_period` |
| `detected-babycry-event` 哭声 | `8.7` | 提醒推送（WebSocket/订阅消息）+ 可选记入 `symptom`（行为类症状：哭闹） |
| `cough-detected` 咳嗽 | `8.12` | `symptom`（咳嗽） |
| `louder-sound` 较大声响 | `8.11` | 提醒推送 |
| `object-motion` 画面变动 | `8.10` | 提醒推送 |
| `people-fence-in/out` 围栏 | `16.1`/`16.2` | 提醒推送 |

4. **图像抓取**
   - 事件历史接口返回的记录中通常含媒体信息（云存储截图/短视频的 CDN 链接，`*.fds.api.mi-img.com`）。
   - 服务端下载后转存 CloudBase 存储，随提醒/记录展示；注意设置访问签名与过期时间，避免外链泄露。
   - 兜底：触发事件时可调用 `upload-video` 动作或 P2P 截帧（路径 D 能力，MVP 可跳过）。

5. **设置同步**（可选）：读写 `ai-detection` 相关开关、`smart-care-mode`、灵敏度，让用户在 minicare 内直接开关哭声/睡眠检测。

---

## 五、落地步骤（建议按此顺序）

1. **PoC（1~2 周）**：本地 Node 脚本验证
   - 扫码登录拿 token → `home/devicelist` 找到该摄像机 → 拉 3 天 `get_user_device_data`，确认 `18.8/18.9/8.7/8.12` 等 key 能取到真实事件及媒体链接。
   - 输出：可复用的签名请求库 + 事件样例 JSON。
2. **后端模块**：`src/device/xiaomi/`（对应 AGENTS.md 规则，走 `.agents/skills/minicare-dev` 开发流程）
   - `xiaomi-cloud.client.ts`（签名/请求/token 刷新）
   - `device-binding`（绑定表 + 接口）
   - `sync.service.ts`（Cron 轮询 + 事件映射 + 幂等去重）
   - `alert`（WebSocket + 小程序订阅消息推送）
3. **DB 变更**（走 `.agents/skills/database-designer`）：
   - 新增 `device_binding` 表；`sleep_record` 增加 `source` 字段（`manual`/`xiaomi`）；如记症状，`symptom_record` 增加 `source` 与 `evidence_url`。
4. **小程序**：新增「设备接入」设置页 + 首页/睡眠页展示来源标签与最新事件卡片。
5. **合规**：隐私政策补充米家数据授权说明；婴儿图像默认只存事件截图、可一键删除。

---

## 六、风险与注意

- **接口非官方**：`api.io.mi.com` 为逆向实现，接口变更、风控加严（异常频率检测）会导致功能中断。缓解：轮询频率保守（≥30s）、单用户串行、失败退避重试；后端抽象接口层以便切换通道。
- **token 安全**：`ssecurity` 相当于账号级凭证，必须加密存储（建议 KMS/项目现有加密 util），杜绝日志输出；提供「解绑即失效」流程。
- **许可证边界**：不可复制 `ha_xiaomi_home` 源码商用；仅可参考其协议实现思路自研。
- **隐私**：摄像头画面属敏感个人信息，仅同步「事件级」数据，不做实时视频流（MVP）；截图需向用户明示并支持删除。
- **本地模式不可接入**：该设备「本地模式」图像不经过云端，只有「联网模式」数据才在米家云，接入前提是用户开启联网模式。
- **睡眠互斥**：米家自动开始睡眠与用户手动记录的睡眠需统一走现有「进行中睡眠互斥」规则，避免双开。
- **时区**：米家事件时间戳为 Unix 秒（UTC），转北京时间需用 `dayjs` 本地化处理，勿直接 `toISOString()`（见 AGENTS.md 时区铁律）。

---

## 七、社区米家 API 生态盘点（开源状态 / 活跃度 / 影响力）

> 数据截至 2026-08-22，来自 GitHub API。社区米家 API **是开源项目，且分为两条技术路线**：云端逆向 API（对应本报告路径 C）与局域网 miIO/MIoT 协议。

| 项目 | Star | Fork | 最近提交 | 许可证 | 路线 | 说明 |
|---|---|---|---|---|---|---|
| `XiaoMi/ha_xiaomi_home` | **22023** | 1172 | 2026-08-18 | 自定义（仅限 HA 非商用） | 云端 | **小米官方**开源集成，OAuth2 + MQTT 订阅事件，最活跃、最权威的云端通道参考 |
| `al-one/hass-xiaomi-miot` | 6083 | 856 | 2026-07-31 | Apache-2.0 | 云端+局域网 | HA 第三方集成，摄像机类设备支持完善，社区维护活跃 |
| `PiotrMachowski/Xiaomi-cloud-tokens-extractor` | 4710 | 439 | 2025-11-08 | MIT | 云端 | token 提取工具，HA 生态标配 |
| `rytilahti/python-miio` | 4290 | 603 | 2026-07-25 | GPL-3.0 | 局域网 | 老牌 miIO/MIoT 库，被 HA 官方集成依赖；以本地协议为主 |
| `XiaoMi/xiaomi-miloco` | 3259 | 287 | 2026-08-21 | 自定义 | 本地视觉 | 小米官方 Local Copilot，摄像头+端侧大模型，MCP 协议，仍在活跃迭代 |
| `Do1e/mijia-api`（mijiaAPI） | 737 | 97 | 2026-08-19 | GPL-3.0 | 云端 | 纯云端逆向，设备控制/属性 API 封装完整，PyPI 可装 |
| `dairoot/miloco-sdk` | 45 | — | 2026-08-16 | — | 本地视觉 | 社区对 miloco 的 SDK 封装，较新、体量小 |

### 对 minicare 的启示

1. **云端通道未废弃且持续演进**：官方 `ha_xiaomi_home` 月活级维护（22k star），说明 `api.io.mi.com` 云端通道稳定可用；Al-One 集成 6k star 持续跟进新设备，可作为摄像机事件查询的参考实现。
2. **许可证是硬约束，商用需自研实现**：
   - `ha_xiaomi_home`：许可证仅限 **Home Assistant 内非商业** 使用，minicare 不可直接依赖。
   - `mijiaAPI`（Do1e/mijia-api）：**GPL-3.0** 且 README 明确「仅供学习交流，不得用于商业用途」，不可嵌入闭源商用服务。
   - `python-miio`：GPL-3.0，同理。
   - **建议**：参考其**协议与签名逻辑**自行实现 NestJS 版客户端（不拷贝代码），规避 GPL 传染与「非商业」限制；如可接受，`al-one/hass-xiaomi-miot`（Apache-2.0）是相对宽松的参考蓝本，但仍是逆向实现。
3. **摄像机事件数据的针对性参考**：`al-one/hass-xiaomi-miot` 对摄像机（含 AI 事件实体）支持最完善，PoC 阶段优先对照它的请求方式验证 `get_user_device_data` 的 key 与返回结构。
4. **miloco 是备选路线**：若未来要「本地实时视觉分析 + 事件推送」，可考虑用户侧部署 `xiaomi-miloco`，但其要求家庭局域网 PC/算力，与当前纯云架构不匹配。

---

## 八、官方 vs 社区开源路径对比（2026-08-22 更新）

> 背景：minicare 为个人自用非商用，许可证不再构成硬约束。本节省略合规讨论，聚焦「能用什么、差别在哪」。

### 8.0 官方的两种形态（重要澄清）

「官方」在小米生态里其实是**两条不同的路**：

| 官方形态 | 入口 | 本质 |
|---|---|---|
| **官方开放平台（正式授权）** | `dev.mi.com`（小米开放平台）、`open.be.mi.com`（商务开放平台） | 面向**企业合作伙伴**，OAuth scope 6004「第三方服务商访问并控制小米设备」，需企业资质+审核+签协议 |
| **官方开源项目** | `XiaoMi/ha_xiaomi_home`、`XiaoMi/xiaomi-miloco` | 官方开放源码，但定位是「给 Home Assistant / 本地生态」用，许可证限 HA 内非商用 |

**关键事实**：小爱开放平台鉴权文档明确写着 —— **「APP OAuth: 否（米家暂不开放）」**。即普通第三方 App 走官方 OAuth 拿米家设备权限这条路，官方是**收紧的**。scope 6004 虽然存在，实际面向设备厂商/大合作伙伴，且申请需营业执照等资质，摄像机这类敏感数据的开放范围极小。

### 8.1 逐维度对比

| 维度 | 官方开放平台（scope 6004） | 官方开源 `ha_xiaomi_home` | 社区 `al-one/hass-xiaomi-miot` | 社区 `mijia-api`(Do1e) |
|---|---|---|---|---|
| **数据能力** | 官方定义，但摄像机数据基本不放 | 完整（事件订阅+控制） | 完整（事件/截图/视频/属性） | 属性/动作/统计，**无事件历史封装** |
| **母婴版摄像机事件** | 大概率不可用 | ✅ 可用（MQTT 订阅） | ✅ 可用（eventlist+get_user_device_data） | ⚠️ 需自补接口 |
| **图像/视频** | 不放 | 可接视频流 | ✅ 截图+m3u8 | ❌ 未封装 |
| **实时性** | — | MQTT 实时推送 | 轮询为主 | 轮询 |
| **申请门槛** | 企业资质+审核+协议 | 无需（但要跑 HA） | 无需 | 无需 |
| **稳定性** | 官方背书 | 官方维护，最稳 | 社区维护，活跃 | 社区维护，活跃 |
| **风控风险** | 低（合规使用） | 低 | 中（逆向接口） | 中（逆向接口） |
| **运行环境** | 云端服务器 | **必须自建 Home Assistant** | 必须在 HA 内跑 | 任意 Python |
| **个人自用可行性** | ❌ 门槛过高 | ✅ 但需 HA 环境 | ✅ 但需 HA 环境 | ✅ 最直接 |

### 8.2 针对 minicare 的结论

- **官方开放平台**：门槛高、摄像机数据基本不放，**排除**。
- **官方开源 `ha_xiaomi_home`**：数据能力最全、最稳定，但**必须自建 Home Assistant**（家里跑个树莓派/NAS/PC）。个人自用许可证无忧，等于在 minicare 前面架一个 HA 网关，再通过 HA 的 API 把事件转发给 minicare。**适合家里有常驻硬件、想要高稳定性的方案**。
- **社区 `al-one/hass-xiaomi-miot`**：功能与官方开源相当（还多截图/视频），但同样要求 HA 环境；许可证 Apache-2.0 对自用宽松。
- **社区 `mijia-api`**：无需 HA，Python 直连米家云，但对母婴版要自己补 `get_user_device_data` 事件查询（约 20 行）。**适合纯云架构、不想搭 HA 的方案**。

> ⚠️ 补充：`ha_xiaomi_home` 的许可证限「仅限 Home Assistant 内使用」，若走 HA 网关方案，必须在 HA 内部消费其数据、再通过 HA 的开放 API/自动化转出，不要把它当作普通库嵌进 minicare 服务。

### 8.3 简单决策树

```
家里有常驻硬件(NAS/树莓派/PC)?
├─ 有 → 自建 HA + 官方 ha_xiaomi_home（最稳，数据最全）
└─ 无 → 云端直连方案：
        ├─ 路径1：Python 脚本(mijia-api 登录 + 自补事件查询) → POST 到 minicare
        └─ 路径2：Node 自研客户端(NestJS xiaomi-camera 模块)
```

---

## 九、纯技术可行性确认（不含许可证约束）

> 结论先行：**技术完全可行**，且已有 6k+ star 的生产级开源实现（`al-one/hass-xiaomi-miot`）在用同一条链路跑米家摄像机的「事件 + 报警视频 + 截图」。以下为从该仓库源码核对到的具体证据（2026-08-22）。

### 8.1 云端签名与认证（已证可行）

- 登录：`api.io.mi.com` 两步登录 + 可选验证码/2FA，换取 `ssecurity` + `serviceToken`；QR 扫码与账密两种方式均有实现。
- 签名：请求体 `data` 用 ssecurity 派生密钥做 **RC4 加密 + nonce 签名**（`async_request_rc4_api`），每请求独立 nonce。
- token 自动刷新：响应 `code==3` / `SERVICETOKEN_EXPIRED` 时自动重新登录，无需用户干预。
- 多 host 支持：`get_api_by_host()` 可将签名逻辑复用到摄像机专属 host。

### 8.2 摄像机专属云 API（已证可行）

host：`business.smartcamera.api.io.mi.com`，签名方式与主站一致：

| 接口 | 用途 |
|---|---|
| `miot/camera/app/v1/alarm/playlist/limit` | 报警播放列表（`playUnits`，含事件类型 tags、时间） |
| `common/app/get/eventlist` | **事件列表**（`thirdPartPlayUnits`，含 `eventType`、`createTime`、`fileId`） |
| `common/app/m3u8` | 事件/报警视频的 m3u8 拉流地址 |
| `common/app/image` | 事件截图地址（`fileId` + `stoId` 换取） |

### 8.3 事件数据的两条获取通道

1. **通用 MIoT 事件历史**：`user/get_user_device_data`，参数 `{ did, key: 'siid.eiid', type: 'event'|'prop', time_start, time_end, limit }` —— 对应本报告第四节的 `18.8`（宝宝入睡）/`18.9`（睡醒）/`8.7`（哭声）等。
2. **摄像机报警事件**：`common/app/get/eventlist` —— 事件时间、类型 + 视频/图片文件引用，适合做「事件卡片 + 截图」。

> PoC 阶段建议两条都打一遍，看哪条对本设备返回更完整（尤其是 `baby-sleep`/`baby-wakeup` 是否出现在 eventlist 中，还是只走 `get_user_device_data`）。

### 8.4 技术难点排序（工作量与风险）

| 难点 | 风险 | 说明 |
|---|---|---|
| 签名算法逆向（RC4 + nonce） | 中 | 有成熟参考实现，照抄协议逻辑即可；需对照源码逐行移植到 Node |
| 登录风控 / 验证码 | 中 | 每日 2FA 次数限制 3~5 次；**务必用 QR 扫码登录**，服务端保存长有效 token，避免频繁登录 |
| 事件 key 确认 | 低 | 需要实测；备选通道已存在（eventlist） |
| 截图/视频下载 | 低 | 换到地址后直接 HTTP 下载转存 CloudBase |
| 轮询频率与限流 | 低 | 30s~1min 低频轮询、串行请求即可，HA 集成同样低频运行 |
| token 持久化与刷新 | 低 | 结构已明确，异常时自动重登 |

### 8.5 结论

抛开许可证，技术栈完全成立：**认证 → 签名请求 → 事件查询 → 截图拉取** 四个环节都有生产级参考。工程上的主要成本在「把 Python 参考实现翻译成 NestJS/Node 并跑通 PoC」，预计纯技术 PoC 可在 1~2 周内完成。

---

## 十、参考资源
- 设备规格：`https://home.miot-spec.com/spec/chuangmi.camera.066a01`
- 小米 IoT 控制端 API（官方，确认不适用）：`https://iot.mi.com/new/doc/accesses/direct-access/other-platform-access/control-api`
- 属性/事件历史记录 SDS 文档（key 格式与查询约束）：`https://iot.mi.com/v2/new/doc/plugin/other/sds`
- 社区米家云 API：`mijia-api`(Python)、`xiaomi-cloud-tokens-extractor`、`python-miio`、`miloco-sdk`
- 官方 HA 集成（参考协议、勿直接复用）：`https://github.com/XiaoMi/ha_xiaomi_home`
- 产品介绍（IT之家/快科技/CNMO，确认功能与存储方式）
