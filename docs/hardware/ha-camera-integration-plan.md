# Home Assistant + 米家母婴摄像机 → minicare 接入方案

> 版本：v1.0（2026-08-22）
> 前置调研：`docs/xiaomi-camera-integration-research.md`
> 目标：在本机（Mac Pro, x86_64, macOS 26.5）部署 Home Assistant，接入小米智能摄像机母婴看护版（`chuangmi.camera.066a01`），并把宝宝睡眠/哭声等事件与截图同步到 minicare。

---

## 一、方案选型结论

| 决策点 | 选择 | 理由 |
|---|---|---|
| 数据通道 | **官方 `ha_xiaomi_home` 集成（云端 MQTT 订阅）** | 个人自用非商用，官方维护最稳、事件实时推送、无需逆向签名 |
| HA 承载 | **本机 Mac Pro 跑 Docker** | 已有常开电脑，零新增硬件；不占用树莓派/NAS |
| 事件→minicare | 方案 A：HA 自动化 REST → minicare-server 同步接口 | 由 HA 侧主动推，minicare 不需要接触米家云 |
| 架构定位 | **「HA 网关」旁路方案** | minicare 核心不变，HA 只负责把米家事件转成 minicare 记录 |

> 许可证说明：`ha_xiaomi_home` 仅限 Home Assistant 内非商业使用。个人自用场景满足条件；数据在 HA 内部消费，再经 HA 的 REST 接口转出，不把其代码嵌入 minicare。

---

## 二、总体架构

```
┌─────────────────────────── 家庭局域网 ───────────────────────────┐
│  Mac Pro (x86_64, macOS 26.5)                                    │
│  ┌─────────────────────────────┐        ┌─────────────────────┐ │
│  │  Docker                     │        │ 小米智能摄像机       │ │
│  │  ┌───────────────────────┐  │        │ 母婴看护版            │ │
│  │  │ Home Assistant        │  │        │ (chuangmi.camera     │ │
│  │  │  ├ ha_xiaomi_home 集成│◀┼────────┼── .066a01)           │ │
│  │  │  ├ 事件实体(Sensor/   │  │        │                      │ │
│  │  │  │  Event 状态)        │  │        └─────────────────────┘ │
│  │  │  └ 自动化 + REST       │  │          米家云 (MQTT 订阅)      │
│  │  └───────────────────────┘  │        ▲                        │
│  └─────────────────────────────┘        │ 事件: 宝宝入睡/睡醒/哭声 │
└──────────────────────────────────────────────────────────────────┘
        │  POST /api/devices/xiaomi/sync  (事件+截图)
        ▼
┌──────────────────────────────────────────────────────────────────┐
│  minicare-server (CloudRun)                                       │
│  ├ device_binding 表 + sync 接口                                  │
│  ├ 事件→记录映射 (sleep/symptom/提醒)                            │
│  └ CloudBase Storage (截图转存) → WebSocket 推送 → minicare-mp    │
└──────────────────────────────────────────────────────────────────┘
```

**数据流（单向，由 HA 主动推）**：
1. 米家云把摄像机事件实时推给 HA（`ha_xiaomi_home` 云端 MQTT 订阅）
2. HA 内的自动化检测到事件 → 调 minicare-server 的同步接口
3. minicare-server 落库 + 转存截图 + WebSocket 推送小程序

---

## 三、实施步骤

### 阶段 1：本机部署 Home Assistant（今天完成）

1. 创建持久化目录：`~/homeassistant/config`
2. Docker 运行 HA 容器（镜像 `ghcr.io/home-assistant/home-assistant:stable`，国内可用加速源）
3. 浏览器打开 `http://localhost:8123`，创建 HA 管理员账号
4. 安装 `ha_xiaomi_home` 集成（Git clone → `custom_components/xiaomi_home` → 重启）
5. 添加集成 → 小米账号 OAuth2 登录 → 选择家庭 → 导入设备

> ⚠️ Mac Docker 网络说明：Docker Desktop 不支持 `--network host`，HA 用 `-p 8123:8123` 端口映射即可；米家集成的**云端控制/事件订阅不依赖局域网**，可用；**本地局域网控制**（需中枢网关）在 Mac 上不可用，不影响本项目（我们只用云端事件）。

### 阶段 2：确认摄像机事件（明天）

1. 在 HA 中确认设备「小米智能摄像机 母婴看护版」已导入
2. 检查实体列表，找 `xiaomi.xxx_event_*` 相关事件实体（`detected-babycry-event` / `baby-sleep` / `baby-wakeup` 等）
3. 手动触发一次宝宝哭声/开关睡眠检测，验证 HA 事件状态变化
4. 确认截图实体（`camera.xxx`）能拿到画面

### 阶段 3：minicare-server 新增同步入口（后续开发）

新增接口（走 `.agents/skills/minicare-dev` 流程）：
- `POST /api/devices/xiaomi/sync`：接收 HA 推送的事件负载
- 事件→记录映射（复用第四节映射表）
- 新增表 `device_binding`；`sleep_record`/`symptom_record` 加 `source` 字段
- 截图下载转存 CloudBase Storage，返回 URL 落库

### 阶段 4：HA 自动化推送（后续配置）

在 HA `configuration.yaml` 或 UI 中配置自动化：
- 触发：事件实体状态变化（入睡/睡醒/哭声/咳嗽）
- 动作：`rest_command` 调 `POST /api/devices/xiaomi/sync`（带 HA 的长期令牌做鉴权）

---

## 四、事件 → minicare 记录映射

| 米家事件 | HA 实体示例 | minicare 落点 |
|---|---|---|
| 宝宝入睡 `baby-sleep` (18.8) | `xiaomi.xxx_baby_sleep` | `sleep_record` ongoing，`source=xiaomi` |
| 宝宝睡醒 `baby-wakeup` (18.9) | `xiaomi.xxx_baby_wakeup` | `sleep_record` end，计算时长 |
| 识别到哭声 `detected-babycry-event` (8.7) | `xiaomi.xxx_detected_babycry_event` | 提醒推送 + 可选 `symptom`（哭闹） |
| 识别到咳嗽 `cough-detected` (8.12) | `xiaomi.xxx_cough_detected` | `symptom`（咳嗽） |
| 较大声响 `louder-sound` (8.11) | `xiaomi.xxx_louder_sound` | 提醒推送 |
| 有人进入/离开围栏 | `xiaomi.xxx_people_fence_in/out` | 提醒推送 |
| 截图 | `camera.xxx` / 事件截图 | CloudBase Storage + 记录 `evidence_url` |

> 说明：HA 的实体命名/是否暴露事件实体需在阶段 2 实测确认；`ha_xiaomi_home` 对事件的暴露形式以实际导入为准。

---

## 五、验证清单

- [ ] HA Web 界面 `http://localhost:8123` 可访问，管理员账号已建
- [ ] `ha_xiaomi_home` 集成添加成功，摄像机设备已导入
- [ ] 摄像机事件实体出现在 HA，且状态随真实事件变化
- [ ] 摄像机截图实体可正常取图
- [ ] HA 自动化能成功调用 minicare 同步接口（阶段 3/4 完成）
- [ ] minicare-mp 能看到来源为「米家摄像机」的睡眠记录与提醒

---

## 六、风险与备注

- **Mac 睡眠**：HA 容器随 Mac 睡眠而暂停 → 需关闭自动睡眠或接电常开
- **Docker 资源**：HA 轻量，1GB 内存足矣；若 Mac 长期跑容器发热明显，再考虑 BE6500 Pro
- **本地控制不可用**：Mac 上无中枢网关局域网链路，但云端事件订阅不受影响
- **事件实体差异**：`ha_xiaomi_home` 对本型号摄像机暴露的事件实体名以实测为准，映射表需微调
- **国内网络**：拉镜像建议用 ghcr 加速或 `docker pull` 代理；HA 更新同理
