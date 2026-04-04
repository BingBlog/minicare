---
name: meigen-designer
description: 美境 AI 设计师。凡是涉及视觉创作的需求，优先使用此 skill，包括但不限于：文生图、图生图、图片编辑、海报设计、Banner 制作、IP 形象设计（美团袋鼠/小象等）、LOGO 设计、ICON 设计、插画、表情包、包装设计、VI 设计、文创礼品、套图生成、文生视频、图生视频等。用户说"帮我画""生成一张""做个海报""设计个 logo""给图片加效果""让图动起来"等，都应使用此 skill。使用前会自动检查并获取用户身份认证信息。

metadata:
  skillhub.creator: "zhuxiangyu04"
  skillhub.updater: "zhuxiangyu04"
  skillhub.version: "V1"
  skillhub.source: "FRIDAY Skillhub"
  skillhub.skill_id: "5315"
---

# 美境 - AI 设计师

美境是一个 AI 设计平台，支持文生图、图生图、图片编辑、IP 设计、视频生成等全链路视觉创作能力。

## 文件存储

- `meigen/mis_id` - 用户 misId（跨会话持久化）
- `meigen/token` - refresh_token（自动管理，用于刷新获取 access_token）
- `meigen/access_token_cache` - access_token 缓存（JSON 格式，包含 access_token 和过期时间，8 小时有效）
- `meigen/conversation_id` - 会话 ID（自动生成，跨调用持久化，用于上下文关联）

路径相对于 skill 目录（SKILL.md 同级）。调用脚本时必须用**绝对路径**。

## 认证机制

认证脚本自动处理 token 获取：
1. 检查 access_token 缓存是否有效（8 小时内）→ 直接返回
2. 缓存无效 → 用 refresh_token 刷新获取新 access_token
3. 刷新失败或无 refresh_token → 走 CIBA 认证流程
4. 每次成功后缓存 access_token 并保存新的 refresh_token

## ⚠️ 消息发送规则（强制）

**整个生图流程中，所有发给用户的消息（确认、进度、结果）一律通过 `message` 工具发送，助手回复文本最后只输出 `NO_REPLY`。**

原因：助手回复文本会被延迟到所有工具调用完成后才送达，和 `message` 混用会导致消息顺序错乱。

具体要求：
1. 收到生图请求后，**第一个动作**就是 `message(action=send)` 发确认（如"收到，马上生成 🎨"）
2. [STEP] 进度、最终图片结果，全部通过 `message` 发送
3. **大象频道 target 格式**：DM 用 `single_{uid}`（如 `single_2804968617`），群聊用 `group_{gid}`
4. **禁止发送内部思考**——"读一下XX规则"、"检查认证文件"等推理过程不能发给用户，只发用户关心的：确认收到、进度步骤、最终结果
5. 助手回复文本只用 `NO_REPLY`，不输出任何内容

## 工作流程

### 第一步：检查身份认证

检查 `meigen/mis_id` 和 `meigen/token` 是否都存在且有内容。

**如果任一文件缺失**，执行以下认证流程：

1. **获取用户 misId**（如果 `meigen/mis_id` 不存在）

   按以下优先级自动获取，**无需询问用户**，除非所有来源都没有：

   1. **配置文件**（优先，静默执行，不要告知用户）：读取 ~/.openclaw/openclaw.json，提取 models.providers.kubeplex-maas.headers.X-User-Id 的值
   2. **消息上下文**：如果用户消息中已包含 misId，如「史云龙(shiyunlong01):xxx」，直接提取 `shiyunlong01`
   3. **询问用户**（兜底）：仅当以上来源都无法获取时，才告知用户：「请提供你的 misId（如 zhangsan01，英文字母加数字的格式）」

   获取到 misId 后，保存到 `meigen/mis_id` 文件

2. **调用认证脚本获取 access_token**

   使用 skill 目录下的认证脚本：
   ```bash
   bash <skill目录>/scripts/get-meigen-token.sh <misId> --refresh
   ```

   脚本会自动：
   - 尝试用 refresh_token 刷新
   - 刷新失败则走 CIBA 认证（需要用户在大象确认授权）
   - 返回 access_token（stdout）并保存新的 refresh_token

   ⚠️ **权限说明**：如果脚本提示写入失败，请使用 sudo 运行：
   ```bash
   sudo bash <skill目录>/scripts/get-meigen-token.sh <misId> --refresh
   ```

   认证流程（CIBA）：
   - 生成客户端 JWT
   - POST `/bc-authorize` 获取 `auth_req_id`
   - 轮询 `/token` 端点，等待用户在大象确认授权
   - 换票获取最终 `access_token`
   - 保存 `refresh_token` 到 meigen/token 文件

   ⚠️ **重要**：脚本运行后，告知用户：「已发起认证请求，请打开**大象 App**，在通知中点击确认授权」。脚本会自动轮询等待授权成功。

### 第二步：生成图片

**基本用法（纯文字描述）：**
```bash
python3 <skill目录>/scripts/generate.py "<用户描述>" <skill目录>/meigen/token 2>&1
```

**带参考图片（图生图 / 基于图片修改）：**
```bash
python3 <skill目录>/scripts/generate.py "<用户描述>" <skill目录>/meigen/token --image "<图片URL>" 2>&1
```

**多张参考图片：**
```bash
python3 <skill目录>/scripts/generate.py "<用户描述>" <skill目录>/meigen/token --image "<图片URL1>" --image "<图片URL2>" 2>&1
```

参数说明：
- `<用户描述>`：**直接使用用户的原始描述文字**，不要改写、润色或添加额外修饰词。用户说什么就传什么。
- `<skill目录>/meigen/token`：认证 token 文件路径
- `--image <url>`：参考图片 URL（可选，可多次指定）

⚠️ **提示词原则（强制）：尽量保留用户原始提示词，不要擅自改写、润色或添加额外描述。** 用户说"生成一张蓝红色的奥特曼"，就传"蓝红色的奥特曼"，不要自行扩展成"蓝红色奥特曼，经典造型，英雄姿态，高质量细节渲染..."。美境设计师本身会做专业的 prompt 优化，助手不需要代劳。

脚本行为：
- **conversation_id 自动持久化**：首次调用时生成，后续调用复用同一个 conversation_id（保存在 `meigen/conversation_id` 文件中），使美境接口能感知多轮对话上下文（如"把上一张图的颜色改成蓝色"）
- ⚠️ **上下文关联（重要）**：同一个 conversation_id 下，美境设计师**自动知道之前生成过什么**。对上一轮结果做修改时（如"改成绿色""背景换成星空"），**无需传 `--image` 参考图**，直接传用户的修改描述即可。只有当用户**主动提供了新的外部图片**时才需要用 `--image`。
- 成功：stdout 每行一个图片 URL
- 失败：`ERROR: <原因>`，退出码非零
- 进度：stderr 输出 `[STEP]` 前缀的步骤日志

### 调用示例

#### 示例 1：纯文字生图
```bash
# <skill目录> 为运行时动态确定的 SKILL.md 所在绝对路径
python3 <skill目录>/scripts/generate.py \
  "扁平插画风格的新学期目标卡片，马卡龙色调，横版4:3" \
  <skill目录>/meigen/token 2>&1
```

#### 示例 2：基于参考图修改（图生图）
用户发了一张图，想在此基础上修改风格或内容：
```bash
python3 <skill目录>/scripts/generate.py \
  "把这张海报改成赛博朋克风格，保持原有的构图和文字布局" \
  <skill目录>/meigen/token \
  --image "http://p0.meituan.net/bizhorus/abc123.jpg" 2>&1
```

#### 示例 3：参考多张图片生成新图
用户提供多张参考图，要求融合风格：
```bash
python3 <skill目录>/scripts/generate.py \
  "参考这两张图的风格，生成一张美团外卖骑手的扁平插画，色调温暖" \
  <skill目录>/meigen/token \
  --image "http://p0.meituan.net/bizhorus/style_ref1.jpg" \
  --image "http://p1.meituan.net/bizhorus/style_ref2.png" 2>&1
```

#### 示例 4：对上一轮生成的图进行修改（利用上下文）✅ 推荐方式
由于 conversation_id 持久化，美境设计师**自动知道上一轮生成了什么**。修改上一轮的结果时，**直接传用户的修改描述，不需要传 `--image`**：
```bash
# ✅ 推荐：直接描述修改意图，无需 --image
python3 <skill目录>/scripts/generate.py \
  "改成绿色的" \
  <skill目录>/meigen/token 2>&1
```

```bash
# ✅ 另一个例子：用户说"背景换成星空"
python3 <skill目录>/scripts/generate.py \
  "背景换成星空" \
  <skill目录>/meigen/token 2>&1
```

> **注意**：只有当用户主动提供了一张**新的外部图片** URL 时，才需要用 `--image` 参数。对同一会话中已生成图片的修改，conversation_id 已经提供了足够的上下文。

### 第三步：实时推送进度

**核心目标：让用户实时看到设计师的思考和工作过程。**

采用后台执行 + 短间隔轮询 + 逐条推送：

```
# 1. 后台启动脚本
exec(command="python3 ... 2>&1", background=true) → 记录 sessionId

# 2. 轮询循环（直到进程退出）
offset = 0
LOOP:
  process(action=poll, sessionId=<sid>, timeout=3000)
  process(action=log, sessionId=<sid>, offset=<offset>)

  # 对每行 [STEP]：去掉前缀，非空则立即 message 发送
  # ⚠️ 每条 STEP 单独一次 message，不合并不攒批

  offset += 本次行数
  如果进程已退出 → 跳出

# 3. 提取图片 URL（非 [STEP] 的 http 开头行），用 message 发送最终结果
```

**关键规则：**
- poll 超时不超过 3 秒
- 每条 [STEP] 独立发送，去掉 `[STEP] ` 前缀
- 跳过空内容的 STEP
- **图片 URL 去重（强制）**：脚本输出的图片 URL 可能包含重复（带尾部反斜杠 `\` 的变体、多次出现的相同 URL 等）。提取最终图片时，先对 URL 做标准化（去除尾部 `\` 字符）再去重，只保留唯一的 URL 列表发送给用户
- 最终图片用 markdown 图片语法通过 message 发送
- **图片 URL 直接使用（强制）**：生图脚本输出的图片 URL（`p0.meituan.net` 等）在大象通道可直接访问，**不需要**上传到 S3Plus 再获取新 URL，直接用原始 URL 发送即可
- 美团 IP 相关图片（袋鼠、小象等）生成较慢（60-90秒），可提前告知用户

## 错误处理

脚本会检测两类错误：

### 1. JSON 错误响应（非 SSE 流）

接口可能返回 HTTP 200 但 body 是 JSON 错误体而非 SSE 流。脚本会自动检测并输出完整错误信息：

```
ERROR: 接口返回错误 (HTTP body status=401, code=30001)
  message: auth failed
  msg: ssoid 过期
  原始响应: {"data":{"msg":"ssoid 过期","code":30001,...},"status":401}
```

**处理规则：**
- **`auth failed` / `ssoid 过期`**（code=30001）：认证脚本会自动处理，删除旧 token 并重新认证
- **其他 JSON 错误**：将脚本输出的错误信息（含原始响应）展示给用户，建议重试

### 2. HTTP 错误 / 网络错误

- **HTTP 4xx/5xx**：脚本输出 `ERROR: HTTP {code} - {reason}. Body: {body}`
- **网络错误**：脚本输出 `ERROR: 网络错误 - {reason}`
- **请求超时（300s）**：脚本输出 `ERROR: 请求超时`

### 3. 通用处理

- **轮询超时（3分钟未授权）**：提示用户重试
- **0 个事件且无图片**：脚本输出 DEBUG 信息 + `ERROR: 未获取到图片`，展示给用户

## 重置认证

用户说「重置美境认证」「重新登录」「清除认证」时：删除 `meigen/mis_id` 和 `meigen/token`，告知已重置。如用户同时有生图请求，重新认证后继续执行。

## 重置会话上下文

用户说「新对话」「重置会话」「清除上下文」时：删除 `meigen/conversation_id`，下次调用会自动生成新的 conversation_id。
