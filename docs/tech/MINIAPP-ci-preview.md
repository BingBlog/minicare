# 小程序 CI 预览方案

> minicare-mp 使用 miniprogram-ci 实现无需微信开发者工具的远程预览，支持通过 WorkBuddy 助理从手机端触发构建并获取二维码。

---

## 一、方案概述

传统小程序预览需要微信开发者工具 GUI，而手机端无法安装开发者工具。本方案使用微信官方的 `miniprogram-ci` CLI 工具，实现：

- **本地预览**：在终端执行一条命令即可构建 + 生成预览二维码
- **远程预览**：通过 WorkBuddy 助理（微信/企业微信等 IM）从手机远程触发，二维码回传手机扫码预览

### 核心流程

```
手机 IM → WorkBuddy 助理 → 电脑端执行 npm run preview
                              ↓
                        Taro build:weapp
                              ↓
                        miniprogram-ci preview
                              ↓
                    生成 QR 码图片 (.preview/)
                              ↓
                    回传到手机 → 微信扫码预览
```

---

## 二、前置配置

### 2.1 下载代码上传密钥

1. 登录 [微信公众平台](https://mp.weixin.qq.com)（管理员微信扫码）
2. 左侧菜单 → **管理 → 开发管理 → 开发设置**
3. 找到 **「小程序代码上传」** 区域 → 点击「生成」下载密钥
4. 将密钥文件保存为 `minicare-mp/private.wxac792556967d5838.key`

### 2.2 配置 IP 白名单

在同一页面 → **IP 白名单** → 点击「修改」，加入电脑的公网 IPv4 地址。

获取当前公网 IP（**注意：必须先关闭代理**）：

```bash
# 关闭 Clash 系统代理后执行
unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy
curl -4 -s https://api.ipify.org
```

**已配置的白名单 IP：**

| IP | 来源 | 说明 |
|---|---|---|
| `222.130.223.121` | 直连 | 不走代理时的真实 IPv4（**主用**） |
| `103.169.92.107` | Clash 代理 | 走代理时的出口 IPv4（备用） |

> ⚠️ **重要**：微信公众平台**不支持 IPv6 格式**的白名单。如果 miniprogram-ci 报 `invalid ip` 且 IP 是 IPv6 格式，说明请求走了 IPv6，需要强制 IPv4 DNS 解析（脚本已内置处理）。

> ⚠️ **动态 IP 注意**：如果公网 IP 是动态分配的（家用宽带常见），IP 可能随时变化。预览报 IP 错误时需重新查看 IP 并更新白名单。

### 2.3 安装依赖

```bash
cd minicare-mp
npm install miniprogram-ci --save-dev
```

> `miniprogram-ci` 依赖量大，安装可能需要 3-5 分钟。

### 2.4 .gitignore 配置

密钥文件和预览产物不应提交到 git，已配置排除：

```gitignore
private.*.key    # CI 上传密钥（敏感）
.preview/        # 预览二维码图片（临时产物）
```

---

## 三、使用方式

### 3.1 npm 快捷命令

```bash
cd minicare-mp

# production 模式预览（默认）
npm run preview

# staging 模式预览
npm run preview:staging
```

对应的 package.json scripts：

```json
{
  "preview": "NODE_OPTIONS=\"--dns-result-order=ipv4first\" node scripts/mp-preview.js",
  "preview:staging": "NODE_OPTIONS=\"--dns-result-order=ipv4first\" node scripts/mp-preview.js --staging"
}
```

### 3.2 直接调用脚本（更多参数）

```bash
cd minicare-mp
node scripts/mp-preview.js [--staging] [--robot N] [--page path] [--pkp keypath]
```

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--staging` | 使用 staging 环境构建 | production |
| `--robot N` | 指定 CI robot 编号（1-30） | 1 |
| `--page path` | 指定预览落地页路径 | 空（首页） |
| `--pkp keypath` | 指定密钥文件路径 | `private.{appid}.key` |

### 3.3 预览产物

- 二维码图片保存到 `minicare-mp/.preview/preview-<timestamp>.jpg`
- 文件名格式：`preview-2026-07-05T12-04-26.jpg`
- 用微信扫描该二维码即可在手机上预览开发版

---

## 四、代理与 IPv6 踩坑记录

### 4.1 问题根因

| 场景 | 报错 IP | 原因 |
|------|---------|------|
| Clash 系统代理开启 | `2408:8207:...`（IPv6） | 代理优先使用 IPv6 连接 `servicewechat.com` |
| Clash 系统代理开启 + ipv4first | `222.130.223.121` | 虽强制 IPv4，但请求仍走代理，代理出口 IP 与白名单不符 |
| Clash 系统代理关闭 + ipv4first | `222.130.223.121` | 直连 IPv4，需将此 IP 加入白名单 |

### 4.2 脚本内置的防护机制

`mp-preview.js` 在启动时自动执行：

1. **强制 IPv4 DNS 解析**：检查 `NODE_OPTIONS` 是否包含 `--dns-result-order=ipv4first`，若无则自动重启动自身并带上该参数
2. **清除代理环境变量**：删除 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY` 及其小写变体
3. **二次保险**：在调用 miniprogram-ci 前再次清除代理变量

### 4.3 使用建议

- **预览前关闭 Clash 系统代理**（只关系统代理即可，无需退出 Clash 应用）
- 或在白名单中同时保留直连 IP 和代理出口 IP
- 如果公网 IP 是动态的，报 IP 错误时需重新获取并更新白名单

---

## 五、远程操作（WorkBuddy 助理）

### 5.1 连接 WorkBuddy 助理

1. 打开 WorkBuddy 桌面端
2. 左侧栏 → **「助理」**（或设置中找到「助理连接」）
3. 选择 IM 平台（微信 / 企业微信 / QQ / 钉钉 / 飞书）
4. 按指引扫码绑定

### 5.2 远程触发预览

在手机 IM 中发送：

```
帮我预览小程序，运行 npm run preview
```

WorkBuddy 在电脑端执行脚本，二维码图片回传到手机，直接扫码即可。

---

## 六、常见问题排查

| 问题 | 原因 | 解决方法 |
|------|------|----------|
| `invalid ip: xxx.xxx.xxx.xxx` | 请求 IP 不在白名单 | 查看报错中的 IP，加入白名单；确保 Clash 代理已关闭 |
| `invalid ip: 2408:xxxx:xxxx` | IPv6 格式，白名单不支持 | 关闭代理 + 脚本自动启用 ipv4first |
| 密钥文件不存在 | `private.*.key` 未放到正确位置 | 从微信公众平台重新下载密钥，放到 `minicare-mp/` 根目录 |
| `npm run preview` 卡住 | Clash 代理仍在影响网络 | 关闭 Clash 系统代理后重试 |
| 构建超时 | Taro 编译耗时较长 | 正常现象，production 构建约 20-30 秒 |
| 公网 IP 变化 | 家用宽带动态 IP | 重新 `curl -4 api.ipify.org` 获取并更新白名单 |

---

## 七、相关文件

| 文件 | 说明 |
|------|------|
| `minicare-mp/scripts/mp-preview.js` | 预览脚本（核心） |
| `minicare-mp/private.wxac792556967d5838.key` | CI 上传密钥（不入 git） |
| `minicare-mp/.preview/` | 二维码图片输出目录（不入 git） |
| `minicare-mp/package.json` → `preview` / `preview:staging` | npm 快捷命令 |
