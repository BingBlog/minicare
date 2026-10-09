# M6 · 图片问诊（技术方案）

> 模块：M6 ｜ 状态：规划中 ｜ 优先级：P0（视觉链路实测，**阻塞项**）/ P3（UI）

## 1. 技术设计概览

```
用户选图 → Taro.compressImage(quality80/1280) → COS 直传(复用 storage/upload-url)
  → chat 请求 images:[{fileId,mimeType}] + message
  → minicare-server 透传 → minicare-agent
  → lib/vision.js：download-urls 取图 → base64 → Anthropic image block
  → MODEL_ROUTE 白名单映射 → deepseek-v4-flash-vision-exp 解读
  → 分级回答（走 M7）
```

## 2. 前端图片链路（复用 2026-08-22 已验证的 COS 直传）

```ts
// src/api/sse.ts 图片发送扩展
async function sendImage(imagePath: string, question: string) {
  const compressed = await Taro.compressImage({ src: imagePath, quality: 80, compressedWidth: 1280 })
  const buf = await getFileSystemManager().readFile({ filePath: compressed.tempFilePath })  // ArrayBuffer
  const { fileID } = await storageApi.getUploadUrl({ ... })          // 复用 storage/upload-url
  await Taro.request({ url: uploadUrl, method: 'PUT', data: buf,
    header: { Signature, authorization, 'x-cos-security-token': token,
              'x-cos-meta-fileid': cosFileId, key: encodeURIComponent(cloudPath) } })
  return { fileId: fileID, mimeType: 'image/jpeg' }
}
```

- ⚠️ 必须 PUT ArrayBuffer 直传（Taro.uploadFile multipart 会污染 COS 内容，2026-08-22 踩坑）；
- 5 个签名 header 缺一不可（403 SignatureDoesNotMatch）；
- 限制：每轮 ≤3 张、单张 ≤10MB（压缩后通常 200-400KB）。

## 3. 服务端 image attachment 组装（lib/vision.js）

> ⚠️ **2026-08-23 P0 实测修正**：OAK `session.send` 原生支持 `attachments`
> （`file`/`url`/`cos` 三种类型），DeepSeek 端点直接接受 base64 图片并正确解读，
> **无需自组 Anthropic image block**。

```js
// lib/vision.js
export async function buildImageAttachments(envId, credentials, images) {
  // images: [{ fileId, mimeType }]
  // 1) getTempFileURL 拿临时 URL（仅服务端持有，不进 SSE）
  // 2) fetch 拉取 → Uint8Array（10MB 上限，超限/失败 → {type:'text', text:'[image_error]'}）
  // 3) 返回 { type:'file', source: Uint8Array, mimeType }
}
// send：session.send({ type:'message', content: message, attachments })
```

- 图片经 agent 服务端拉取，**模型不直接访问 COS**（避免临时 URL 泄漏）；
- 单图大小保护：>10MB 拒绝；拉取失败 → 该图标记 `image_error` 并降级文字。

## 4. 模型名（2026-08-23 P0 实测：白名单映射废弃）

```js
// lib/deepseek.js —— 直接传真实模型名，无需 MODEL_ROUTE 白名单映射
export const MODEL_DEFAULT = 'deepseek-v4-flash'
export const MODEL_PRO = 'deepseek-v4-pro'
export const MODEL_VISION = 'deepseek-v4-flash-vision-exp'
// buildModelSpec(apiKey, id) → { id, apiBaseUrl: ANTHROPIC_ENDPOINT, apiKey }
```

- ⚠️ 旧方案（`claude-sonnet-4-20250514` 等白名单 id 映射）已废弃；
  当前 SDK（claude-agent-sdk 0.3.x）直接传真实模型名即可路由。

## 5. P0 实测结论（2026-08-23 已完成）

| # | 实测项 | 结果 |
|---|---|---|
| 1 | Anthropic 兼容端点支持图片输入 | ✅ **通过**：attachments（file 类型 → base64）被接受并正确解读 |
| 2 | vision-exp 模型路由 | ✅ **通过**：直接传 `deepseek-v4-flash-vision-exp` 即可（无需白名单映射） |
| 3 | 图片解读质量 | ✅ **高**：测试图（母婴变化 App 界面）准确定位 Tab/选中态/卡片内容 |
| 4 | 延迟 | ⚠️ 首字约 4-7s（含思考）、总耗时 13-14s——略超"首字 <5s"目标，UI 层用加载态缓解；可优化 systemPrompt 减少思考或路由 pro |

**测试脚本**：`minicare-agent/scripts/test-vision.mjs`（保留作回归）。

## 6. 错误处理与降级矩阵

| 场景 | 行为 |
|---|---|
| 上传失败（前端） | 气泡重试按钮，文字可单独发送 |
| 拉图失败（服务端） | 该图 `image_error`，模型仅基于文字回答并提示 |
| vision 模型 429/超时 | 重试 1 次 → 降级纯文字回答 |
| 图片内容不可解读 | 模型明示"图片无法判断" + 引导补充文字描述 |

## 7. 测试与验证

- 冒烟：curl 直传 → /chat 带 images → SSE 返回分级回答；
- 降级：mock vision 失败 → 纯文字回答 + 提示；
- 越权：图片 fileID 属其他家庭 → 拉取失败/拒绝（fileID 归属校验）；
- 隐私：图片临时 URL 仅服务端持有，不进入 SSE 事件内容。
