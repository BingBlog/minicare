# 技术方案：语音录入功能

> 关联 PRD：`docs/prd/PRD-001.md`

## 1. 架构总览

### 1.1 整体架构

采用**后端统一处理**架构：前端负责录音和波形展示，后端统一处理语音转文字（STT）和语义解析（NLU）。

```
┌─────────────────────────────────────────────────────────────┐
│  小程序（minicare-mp）                                       │
│                                                             │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────┐  │
│  │ RecorderMgr  │──▶│ VoiceSheet   │──▶│ VoiceResultSheet│  │
│  │ (录音+波形)   │   │ (录音覆盖层)  │   │ (结果确认卡片)  │  │
│  └──────────────┘   └──────────────┘   └───────┬────────┘  │
│                            │                    │            │
│                     语音文件 tempFilePath      确认录入/修改   │
│                            │                    │            │
│                            ▼                    ▼            │
│                   ┌────────────────┐   ┌──────────────┐     │
│                   │ voiceApi.parse │   │ recordsApi.* │     │
│                   │ (上传语音+解析) │   │ (已有记录API) │     │
│                   └───────┬────────┘   └──────────────┘     │
└───────────────────────────┼──────────────────────────────────┘
                            │
                            ▼ multipart/form-data + 语音文件
┌─────────────────────────────────────────────────────────────┐
│  后端（minicare-server）                                     │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ VoiceModule                                          │   │
│  │  ├─ VoiceController  POST /api/family/:fid/voice/parse│   │
│  │  ├─ VoiceService     (STT 腾讯云 ASR + NLU AI)       │   │
│  │  └─ VoiceDto         (ParseVoiceDto / ParseResult)    │   │
│  └──────────────────────────────────────────────────────┘   │
│                            │                                │
│              ┌─────────────┼─────────────┐                 │
│              ▼             ▼             ▼                 │
│     ┌────────────┐  ┌────────────┐  ┌────────────┐        │
│     │ 腾讯云 ASR  │  │ CloudBase  │  │  字段完整  │        │
│     │ 语音转文字  │  │  AI NLU    │  │   性校验   │        │
│     └────────────┘  └────────────┘  └────────────┘        │
│              │             │                               │
│              ▼             ▼                               │
│     转写文字 text   结构化 fields                            │
│              └──────┬───────┘                               │
│                     ▼                                        │
│            VoiceParseResult (transcript + recordType +       │
│             fields + confidence + missingFields)             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 核心设计决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 语音转文字(STT) | 微信 `RecorderManager` 录音 → 后端腾讯云 ASR | 稳定性高，跨机型一致，不依赖小程序基础库版本 |
| 语义解析(NLU) | CloudBase AI `generateText()` + Hunyuan | 项目已集成 CloudBase SDK，AI 能力开箱即用 |
| 录音管理 | `Taro.getRecorderManager()` | 用于波形动画和录音时长控制 |
| 语音上传 | multipart/form-data | 后端直接接收语音文件，无需前端预处理 |
| 记录创建 | 复用现有 `recordsApi.*` | 不新建录入通道，确认后走标准记录创建流程 |
| 数据存储 | 无新增表 | 语音是瞬时输入方式，不需要持久化 |

### 1.3 数据流

```
用户长按说话
    │
    ▼
RecorderManager.start() ──────── 波形动画 + 时长倒计时
    │
用户松开
    │
    ▼
RecorderManager.onStop() ─── 获取 tempFilePath（语音文件路径）
    │
    ▼
POST /api/family/:fid/voice/parse
  Content-Type: multipart/form-data
  body: { audio: <file> }
    │
    ▼
后端接收语音文件
    │
    ▼
腾讯云 ASR (SentenceRecognition) ─── 语音转文字
    │
    ▼ text: "宝宝喝了120毫升奶"
    │
    ▼
CloudBase AI NLU (generateText) ─── 语义解析 + 字段完整性校验
    │
    ▼ 返回
{ recordType: "formula", fields: { formula_ml: 120 }, confidence: "high",
  transcript: "宝宝喝了120毫升奶", missingFields: null }
    │
    ▼
前端展示 VoiceResultSheet（半屏卡片）
    │
    ├─ 确认录入 → recordsApi.feeding.create()
    ├─ 修改     → 跳转表单页 + 预填参数
    └─ 取消     → 关闭卡片
```

---

## 2. 前端实现（minicare-mp）

### 2.1 新增文件清单

```
minicare-mp/src/
├── api/
│   └── voice.ts                          # 语音解析 API
├── components/
│   ├── TabBar/
│   │   ├── TabBar.tsx                    # 修改：长按/短按区分
│   │   └── TabBar.scss                  # 修改：语音按钮样式
│   ├── VoiceRecorder/
│   │   ├── index.tsx                     # 新增：录音交互组件
│   │   └── index.scss                   # 新增：录音态样式
│   └── VoiceResultSheet/
│       ├── index.tsx                     # 新增：结果确认/失败卡片
│       └── index.scss                   # 新增：卡片样式
└── hooks/
    └── useVoiceInput.ts                  # 新增：语音输入核心 Hook
```

### 2.2 核心模块设计

#### 2.2.1 `useVoiceInput` Hook

语音输入的核心逻辑封装，管理录音→识别→解析的完整生命周期。

```typescript
// minicare-mp/src/hooks/useVoiceInput.ts

type VoiceState = 'idle' | 'recording' | 'recognizing' | 'success' | 'failure'

interface VoiceParseResult {
  recordType: string
  fields: Record<string, unknown>
  confidence: 'high' | 'low'
  transcript: string
}

interface VoiceFailure {
  type: 'no_match' | 'insufficient' | 'stt_failed' | 'service_error' | 'timeout'
  transcript?: string
  recordType?: string
}

interface UseVoiceInputReturn {
  state: VoiceState
  transcript: string
  parseResult: VoiceParseResult | null
  failure: VoiceFailure | null
  duration: number
  startRecording: () => Promise<void>
  stopRecording: () => void
  cancelRecording: () => void
  reset: () => void
}
```

**关键实现要点**：

1. **录音管理**：使用 `RecorderManager` 负责录音，获取 `tempFilePath` 后上传到后端
2. **RecorderManager 配置**：
   ```typescript
   const recorder = Taro.getRecorderManager()
   recorder.onStart(() => { /* 记录开始时间 */ })
   recorder.onStop((res) => {
     // 获取录音文件 res.tempFilePath
     // 调用 voiceApi.parse(familyId, res.tempFilePath)
   })
   recorder.onFrameRecorded((res) => {
     // 帧数据，用于波形动画
     // res.frameBuffer → 计算 RMS 音量
   })
   ```
3. **超时控制**：30 秒自动停止录音；10 秒后端超时
4. **上传方式**：`voiceApi.parse` 使用 `Taro.uploadFile` 上传语音文件

#### 2.2.2 TabBar 改造

修改 [TabBar.tsx](file:///Users/bing/Documents/minicare/minicare-mp/src/components/TabBar/TabBar.tsx) 中间 FAB 按钮：

- **短按**（< 350ms）：保留原有 FabSheet 菜单行为
- **长按**（>= 350ms）：触发语音录制

```typescript
// TabBar.tsx 改造要点
const LONG_PRESS_MS = 350
const pressTimerRef = useRef<ReturnType<typeof setTimeout>>()
const isLongPressRef = useRef(false)

const handleTouchStart = () => {
  isLongPressRef.current = false
  pressTimerRef.current = setTimeout(() => {
    isLongPressRef.current = true
    startRecording()
  }, LONG_PRESS_MS)
}

const handleTouchEnd = () => {
  clearTimeout(pressTimerRef.current)
  if (isLongPressRef.current) {
    stopRecording()
  } else {
    setFabOpen(true) // 短按打开 FabSheet
  }
}

const handleTouchMove = (e) => {
  // 上滑取消逻辑：计算触摸点 Y 偏移
  if (touchMoveY < -THRESHOLD) {
    cancelRecording()
  }
}
```

FAB 按钮视觉变更：`+` → 🎤 麦克风图标（SVG），长按时放大 + 脉冲动画。

#### 2.2.3 VoiceRecorder 组件

录音中的全屏覆盖层，展示波形动画和状态提示。

```text
Props:
  - state: 'recording' | 'canceling'
  - duration: number（已录音秒数）
  - maxDuration: 30
  - volumeLevels: number[]（音量帧数据，用于波形）
  - onCancel: () => void
```

**波形动画实现**：使用 Canvas 2D 绘制，`RecorderManager.onFrameRecorded` 回调中获取 `frameBuffer`，计算每帧 RMS 音量值，驱动波形高度。

#### 2.2.4 VoiceResultSheet 组件

半屏弹窗卡片，根据解析结果展示不同状态。

```text
Props:
  - mode: 'success' | 'no_match' | 'insufficient' | 'stt_failed' | 'service_error'
  - transcript: string
  - parseResult: { recordType, fields } | null
  - onConfirm: () => void
  - onEdit: () => void
  - onCancel: () => void
  - onRetry: () => void
  - onManualInput: () => void
  - onTypeSelect: (type: string) => void
```

**记录类型与表单路由映射**（复用现有 [HOME_RECORD_ROUTES](file:///Users/bing/Documents/minicare/minicare-mp/src/lib/constants.ts#L72-L85)）：

| NLU 返回 recordType | 跳转路由 | 预填参数 |
|---------------------|---------|---------|
| `formula` | `/records/form/feeding?tab=formula` | `formula_ml` |
| `breast` | `/records/form/feeding?tab=breast` | `breast_side`, `duration_min` |
| `food` | `/records/form/feeding?tab=food` | `complementary_food` |
| `diaper` | `/records/form/diaper` | `diaper_type`, `poop_type` |
| `sleep` | `/records/form/sleep` | `duration_min` |
| `temperature` | `/records/form/health?expandTemp=true` | `temperature` |
| `symptom` | `/records/form/symptom` | `mood`, `spirit` |

**预填参数传递方式**：通过 URL query 参数传递，表单页从 `Taro.getCurrentInstance().router.params` 读取并作为初始值。

#### 2.2.5 语音解析 API

```typescript
// minicare-mp/src/api/voice.ts

import Taro from '@tarojs/taro'
import { getToken } from './http'

export interface VoiceParseResult {
  recordType: string | null
  fields: Record<string, unknown>
  confidence: 'high' | 'low'
  transcript: string
  missingFields: string[] | null
}

export const voiceApi = {
  parse: (familyId: string, tempFilePath: string): Promise<VoiceParseResult> => {
    return new Promise((resolve, reject) => {
      Taro.uploadFile({
        url: `${API_BASE_URL}/api/family/${familyId}/voice/parse`,
        filePath: tempFilePath,
        name: 'audio',
        header: {
          'Authorization': `Bearer ${getToken()}`,
        },
        timeout: 12000,
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(res.data))
          } else {
            reject(new Error(JSON.parse(res.data).message || `HTTP ${res.statusCode}`))
          }
        },
        fail: (err) => {
          reject(new Error(err.errMsg || '上传失败'))
        },
      })
    })
  },
}
```

**说明**：使用 `Taro.uploadFile` 以 `multipart/form-data` 格式上传语音文件，字段名为 `audio`。

**超时设置**：前端 `timeout = 12000`（略大于后端 10 秒超时），确保后端超时响应先于前端超时。

### 2.3 确认录入流程

用户点击"确认录入"时，前端根据 `parseResult.recordType` 调用对应的 `recordsApi` 创建方法：

```typescript
const RECORD_CREATE_MAP: Record<string, (familyId: string, fields: Record<string, unknown>) => Promise<{ id: string }>> = {
  formula: (fid, f) => recordsApi.feeding.create(fid, {
    baby_id: currentBabyId,
    feed_type: 'formula',
    record_time: new Date().toISOString(),
    formula_ml: f.formula_ml,
  }),
  breast: (fid, f) => recordsApi.feeding.create(fid, {
    baby_id: currentBabyId,
    feed_type: 'breast',
    record_time: new Date().toISOString(),
    breast_side: f.breast_side,
    duration_min: f.duration_min,
  }),
  diaper: (fid, f) => recordsApi.diaper.create(fid, {
    baby_id: currentBabyId,
    record_time: new Date().toISOString(),
    diaper_type: f.diaper_type,
  }),
  sleep: (fid, f) => recordsApi.sleep.createComplete(fid, {
    baby_id: currentBabyId,
    start_time: calculateSleepStart(f.duration_min),
    duration_min: f.duration_min,
  }),
  temperature: (fid, f) => recordsApi.health.create(fid, {
    baby_id: currentBabyId,
    record_time: new Date().toISOString(),
    temperature: f.temperature,
  }),
  symptom: (fid, f) => recordsApi.symptom.create(fid, {
    baby_id: currentBabyId,
    record_time: new Date().toISOString(),
    symptoms: f.symptoms,
  }),
  food: (fid, f) => recordsApi.feeding.create(fid, {
    baby_id: currentBabyId,
    feed_type: 'complementary',
    record_time: new Date().toISOString(),
    complementary_food: f.complementary_food,
  }),
}
```

### 2.4 麦克风权限处理

```typescript
const requestRecordPermission = async (): Promise<boolean> => {
  try {
    const res = await Taro.authorize({ scope: 'scope.record' })
    return res.errMsg?.includes('ok') ?? false
  } catch {
    // 用户拒绝授权，引导前往设置
    Taro.showModal({
      title: '麦克风权限',
      content: '需要麦克风权限才能使用语音录入，请在设置中开启',
      confirmText: '前往设置',
      success: (modalRes) => {
        if (modalRes.confirm) {
          Taro.openSetting()
        }
      },
    })
    return false
  }
}
```

---

## 3. 后端实现（minicare-server）

### 3.1 新增文件清单

```
minicare-server/src/
└── voice/
    ├── voice.module.ts
    ├── voice.controller.ts
    ├── voice.service.ts
    └── dto/
        └── parse-voice.dto.ts
```

### 3.2 VoiceModule

```typescript
// voice/voice.module.ts

@Module({
  controllers: [VoiceController],
  providers: [VoiceService],
  imports: [AuthModule, FamilyModule, BabyModule],
})
export class VoiceModule {}
```

在 `app.module.ts` 的 `imports` 中注册 `VoiceModule`。

### 3.3 VoiceDto — 接收语音文件

```typescript
// voice/dto/voice.dto.ts

export class ParseVoiceDto {
  @ApiProperty({ description: '语音文件（multipart/form-data）' })
  audio: Express.Multer.File
}

export class VoiceParseResult {
  recordType: string | null
  fields: Record<string, unknown>
  confidence: 'high' | 'low'
  transcript: string
  missingFields: string[] | null
}
```

**说明**：使用 `@nestjs/platform-express` 的 `MulterModule` 接收文件上传，`audio` 字段接收语音文件。

### 3.5 VoiceController — 文件上传接口

```typescript
// voice/voice.controller.ts

import { UseInterceptors, UploadedFile, FileInterceptor } from '@nestjs/platform-express'

@ApiTags('voice')
@Controller('family/:familyId/voice')
@UseGuards(JwtGuard, FamilyMemberGuard, RoleGuard)
@ApiBearerAuth()
export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  @Post('parse')
  @MinRole(FamilyRole.MEMBER)
  @UseInterceptors(FileInterceptor('audio'))
  @ApiOperation({ summary: '上传语音 → STT语音转文字 → NLU语义解析' })
  async parse(
    @Param('familyId') familyId: string,
    @UploadedFile() audio: Express.Multer.File,
  ): Promise<VoiceParseResult> {
    return this.voiceService.parse(familyId, audio)
  }
}
```

**路由**：`POST /api/family/:familyId/voice/parse`

遵循项目 API 约定：
- 在 `/api` 全局前缀下
- 需 `familyId` + JWT + FamilyMemberGuard + RoleGuard
- Content-Type: `multipart/form-data`
- 直接返回裸数据（无全局响应包装）

### 3.6 VoiceService — STT + NLU 核心

```typescript
// voice/voice.service.ts

@Injectable()
export class VoiceService {
  constructor(
    @Inject(CLOUDBASE_APP) private readonly cloudbaseApp: any,
    @Inject(DB_POOL) private readonly db: Pool,
  ) {}

  async parse(familyId: string, audio: Express.Multer.File): Promise<VoiceParseResult> {
    // 1. 腾讯云 ASR 语音转文字
    const text = await this.speechToText(audio)

    if (!text || text.trim().length === 0) {
      return {
        recordType: null,
        fields: {},
        confidence: 'low',
        transcript: '',
        missingFields: null,
      }
    }

    // 2. CloudBase AI NLU 语义解析
    const ai = this.cloudbaseApp.ai()
    const model = ai.createModel('hunyuan-v3')

    const result = await model.generateText({
      model: 'hy3-preview',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      temperature: 0.1,
    })

    // 3. 解析 AI 响应 + 字段完整性校验
    return this.parseAiResponse(result.text, text)
  }
}
```

### 3.7 腾讯云 ASR 集成

#### 3.7.1 集成方式

腾讯云语音识别（ASR）API 调用方式：

```typescript
// voice/voice.service.ts

import tencentcloud from 'tencentcloud-sdk-node-cos'

private async speechToText(audio: Express.Multer.File): Promise<string> {
  const client = new tencentcloud.asr.v20190614.Client({
    credential: {
      secretId: process.env.TENCENT_SECRET_ID,
      secretKey: process.env.TENCENT_SECRET_KEY,
    },
    region: 'ap-guangzhou',
  })

  // 将音频文件上传到腾讯云临时存储获取 URL，或直接 base64 编码
  const audioBase64 = audio.buffer.toString('base64')

  const params = {
    EngineModelType: '16k_zh',
    ChannelNum: 1,
    SampleRate: 16000,
    ResTextFormat: 0,
    SourceType: 1, // 1 = base64
    Data: audioBase64,
  }

  try {
    const result = await client.SentenceRecognition(params)
    return result.Result || ''
  } catch (err) {
    throw new HttpException('语音识别失败', HttpStatus.SERVICE_UNAVAILABLE)
  }
}
```

#### 3.7.2 录音参数要求

微信小程序 `RecorderManager` 录音参数需与腾讯云 ASR 要求的音频格式匹配：

```typescript
// 前端 RecorderManager 配置
recorderManager.start({
  format: 'mp3',     // 或 'aac'，需与后端 ASR 配置一致
  sampleRate: 16000,  // 16kHz，与 ASR EngineModelType: "16k_zh" 匹配
  encodeBitRate: 48000,
  numberOfChannels: 1,
})
```

> **注意**：微信默认录音格式为 `aac`，后端 ASR 也支持 `aac`。如选择 `mp3`，需在上传后转换为 `pcm` 或使用支持 `mp3` 的引擎模型。

#### 3.7.3 环境变量

```bash
# .env.local / CloudRun EnvParams
TENCENT_SECRET_ID=AKIDxxxxxxxxxxxxx
TENCENT_SECRET_KEY=xxxxxxxxxxxxx
```

### 3.8 关键字段完整性判断规则

**这是语音录入方案的核心逻辑**：如何判断 AI 解析出的字段是否足够完整，允许用户直接确认录入。

#### 3.8.1 判断原则

1. **语音场景特殊性**：用户说话时不会像填表一样完整，因此"关键字段"≠"DTO 必填字段"
2. **最小可录入原则**：只要有一个核心业务字段被识别，就允许确认录入，其他字段用默认值
3. **前端二次确认**：完整性不足时，前端展示"信息不够完整"提示，引导用户去表单页补充

#### 3.8.2 各记录类型关键字段定义

| 记录类型 | 关键字段 | 判断条件 | confidence |
|---------|---------|---------|------------|
| `formula` | `formula_ml` | 存在且为正整数 | 有 → `high`，无 → `low` |
| `breast` | `breast_side` 或 `duration_min` | 至少有一个 | 有任一 → `high`，都无 → `low` |
| `food` | `complementary_food` | 存在且非空字符串 | 有 → `high`，无 → `low` |
| `diaper` | `diaper_type` | 存在且为有效枚举值 | 有 → `high`，无 → `low` |
| `sleep` | `duration_min` | 存在且为正整数 | 有 → `high`，无 → `low` |
| `temperature` | `temperature` | 存在且在 35-42 范围 | 有 → `high`，无 → `low` |
| `symptom` | `mood` 或 `spirit` | 至少有一个 | 有任一 → `high`，都无 → `low` |

#### 3.8.3 后端校验实现

在 `VoiceService` 中增加字段完整性校验方法：

```typescript
// voice/voice.service.ts

const RECORD_KEY_FIELDS: Record<string, { fields: string[]; requireAny?: boolean }> = {
  formula:    { fields: ['formula_ml'] },
  breast:     { fields: ['breast_side', 'duration_min'], requireAny: true },
  food:       { fields: ['complementary_food'] },
  diaper:     { fields: ['diaper_type'] },
  sleep:      { fields: ['duration_min'] },
  temperature:{ fields: ['temperature'] },
  symptom:    { fields: ['mood', 'spirit'], requireAny: true },
}

private validateFieldCompleteness(recordType: string, fields: Record<string, unknown>): 'high' | 'low' {
  const config = RECORD_KEY_FIELDS[recordType]
  if (!config) return 'low'

  const { fields: keyFields, requireAny } = config

  if (requireAny) {
    // 至少有一个关键字段
    const hasAny = keyFields.some(f => {
      const val = fields[f]
      return val !== undefined && val !== null && val !== ''
    })
    return hasAny ? 'high' : 'low'
  } else {
    // 所有列出的关键字段都必须有值
    const hasAll = keyFields.every(f => {
      const val = fields[f]
      if (typeof val === 'number') return val > 0
      return val !== undefined && val !== null && val !== ''
    })
    return hasAll ? 'high' : 'low'
  }
}
```

#### 3.8.4 字段值域校验

除了存在性校验，还需对部分字段做值域校验：

| 字段 | 值域 | 校验逻辑 |
|------|------|---------|
| `formula_ml` | 1-500 | `val >= 1 && val <= 500` |
| `duration_min` | 1-720（12小时） | `val >= 1 && val <= 720` |
| `temperature` | 35.0-42.0 | `val >= 35 && val <= 42` |
| `diaper_type` | 枚举 | `['wet', 'dirty', 'mixed'].includes(val)` |
| `breast_side` | 枚举 | `['left', 'right', 'both'].includes(val)` |
| `mood` | 枚举 | `['happy', 'calm', 'fussy', 'crying'].includes(val)` |
| `spirit` | 枚举 | `['active', 'normal', 'tired', 'low'].includes(val)` |

```typescript
private validateFieldValue(fieldName: string, value: unknown): boolean {
  const validators: Record<string, (v: unknown) => boolean> = {
    formula_ml:    (v) => typeof v === 'number' && v >= 1 && v <= 500,
    duration_min:  (v) => typeof v === 'number' && v >= 1 && v <= 720,
    temperature:   (v) => typeof v === 'number' && v >= 35 && v <= 42,
    diaper_type:   (v) => ['wet', 'dirty', 'mixed'].includes(v as string),
    breast_side:   (v) => ['left', 'right', 'both'].includes(v as string),
    mood:          (v) => ['happy', 'calm', 'fussy', 'crying'].includes(v as string),
    spirit:        (v) => ['active', 'normal', 'tired', 'low'].includes(v as string),
    complementary_food: (v) => typeof v === 'string' && v.trim().length > 0,
  }

  const validator = validators[fieldName]
  if (!validator) return true // 未定义校验规则的字段默认通过
  return validator(value)
}
```

#### 3.8.5 完整校验流程

```typescript
private parseAiResponse(aiText: string, originalText: string): VoiceParseResult {
  // ... JSON 解析逻辑 ...

  const { recordType, fields } = parsed

  // 1. 校验 recordType 是否支持
  if (!SUPPORTED_RECORD_TYPES.includes(recordType)) {
    return {
      recordType: null,
      fields: {},
      confidence: 'low',
      transcript: originalText,
      missingFields: null,
    }
  }

  // 2. 过滤无效字段值
  const validFields: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (this.validateFieldValue(key, value)) {
      validFields[key] = value
    }
  }

  // 3. 计算完整性
  const confidence = this.validateFieldCompleteness(recordType, validFields)

  // 4. 计算缺失的关键字段（用于前端提示）
  const config = RECORD_KEY_FIELDS[recordType]
  const missingFields = config.fields.filter(f => !validFields[f])

  return {
    recordType,
    fields: validFields,
    confidence,
    transcript: originalText,
    missingFields: missingFields.length > 0 ? missingFields : null,
  }
}
```

#### 3.8.6 API 响应结构更新

```typescript
interface VoiceParseResult {
  recordType: string | null
  fields: Record<string, unknown>
  confidence: 'high' | 'low'
  transcript: string
  missingFields: string[] | null  // 新增：缺失的关键字段列表
}
```

**示例响应**：

```json
// 完整识别
{
  "recordType": "formula",
  "fields": { "formula_ml": 120 },
  "confidence": "high",
  "transcript": "宝宝喝了120毫升奶",
  "missingFields": null
}

// 字段不完整
{
  "recordType": "food",
  "fields": {},
  "confidence": "low",
  "transcript": "宝宝吃了点东西",
  "missingFields": ["complementary_food"]
}

// 无法识别类型
{
  "recordType": null,
  "fields": {},
  "confidence": "low",
  "transcript": "今天天气真好",
  "missingFields": null
}
```

---

### 3.9 AI Prompt 设计

这是整个方案最关键的部分——通过精心设计的 System Prompt，让大模型将自然语言结构化为可用的记录数据。

```
你是敏宝日记（minicare）的语音录入助手。用户会说一句话描述宝宝的日常记录，你需要将其解析为结构化的记录数据。

## 支持的记录类型及字段

1. formula（配方奶）：formula_ml（奶量，单位ml，整数）
2. breast（母乳）：breast_side（left/right/both）、duration_min（时长，分钟）
3. food（辅食）：complementary_food（食物名称）
4. diaper（尿布）：diaper_type（wet/dirty/mixed/dry）、poop_type（normal/loose/watery/constipated，仅dirty/mixed时）
5. sleep（睡眠）：duration_min（时长，分钟）
6. temperature（体温）：temperature（体温值，如38.5）
7. symptom（表现）：mood（happy/calm/fussy/crying）、spirit（active/normal/tired/low）

## 解析规则

1. 只支持以上7种记录类型，无法匹配时 recordType 为 null
2. 尽可能从用户语句中提取字段值，提取不到的字段不输出
3. 时间默认为当前时间，不需要从语句中解析
4. 一次只解析一条记录
5. confidence: 如果关键字段齐全为 "high"，缺少关键字段为 "low"

## 关键字段判定
- formula: formula_ml 是关键字段
- breast: breast_side 或 duration_min 至少有一个
- food: complementary_food 是关键字段
- diaper: diaper_type 是关键字段
- sleep: duration_min 是关键字段
- temperature: temperature 是关键字段
- symptom: mood 或 spirit 至少有一个

## 输出格式

严格输出 JSON，不要输出任何其他内容：
{"recordType":"类型或null","fields":{...},"confidence":"high或low","transcript":"原文"}

## 示例

输入：宝宝喝了120毫升奶
输出：{"recordType":"formula","fields":{"formula_ml":120},"confidence":"high","transcript":"宝宝喝了120毫升奶"}

输入：左边喂了15分钟
输出：{"recordType":"breast","fields":{"breast_side":"left","duration_min":15},"confidence":"high","transcript":"左边喂了15分钟"}

输入：换了个大便尿布
输出：{"recordType":"diaper","fields":{"diaper_type":"dirty"},"confidence":"high","transcript":"换了个大便尿布"}

输入：宝宝睡了两个小时
输出：{"recordType":"sleep","fields":{"duration_min":120},"confidence":"high","transcript":"宝宝睡了两个小时"}

输入：体温38度5
输出：{"recordType":"temperature","fields":{"temperature":38.5},"confidence":"high","transcript":"体温38度5"}

输入：宝宝今天很开心
输出：{"recordType":"symptom","fields":{"mood":"happy"},"confidence":"high","transcript":"宝宝今天很开心"}

输入：宝宝吃了点东西
输出：{"recordType":"food","fields":{},"confidence":"low","transcript":"宝宝吃了点东西"}

输入：今天天气真好
输出：{"recordType":null,"fields":{},"confidence":"low","transcript":"今天天气真好"}
```

### 3.10 AI 响应解析与容错

```typescript
private parseAiResponse(aiText: string, originalText: string): VoiceParseResult {
  try {
    // 尝试从 AI 输出中提取 JSON
    const jsonMatch = aiText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return {
        recordType: null,
        fields: {},
        confidence: 'low',
        transcript: originalText,
      }
    }

    const parsed = JSON.parse(jsonMatch[0])

    // 校验 recordType 是否在支持范围内
    const supportedTypes = ['formula', 'breast', 'food', 'diaper', 'sleep', 'temperature', 'symptom']
    const recordType = supportedTypes.includes(parsed.recordType) ? parsed.recordType : null

    return {
      recordType,
      fields: parsed.fields ?? {},
      confidence: parsed.confidence ?? 'low',
      transcript: parsed.transcript ?? originalText,
    }
  } catch {
    return {
      recordType: null,
      fields: {},
      confidence: 'low',
      transcript: originalText,
    }
  }
}
```

### 3.11 超时与降级

**整体超时**：10 秒（STT + NLU），超过则返回 504。

```typescript
async parse(familyId: string, audio: Express.Multer.File): Promise<VoiceParseResult> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('PARSE_TIMEOUT')), 10000)
  )

  try {
    return await Promise.race([
      this.doParse(familyId, audio),
      timeoutPromise,
    ])
  } catch (err) {
    if (err.message === 'PARSE_TIMEOUT') {
      throw new HttpException('识别超时，请重试', HttpStatus.GATEWAY_TIMEOUT)
    }
    throw new HttpException('服务暂时不可用', HttpStatus.SERVICE_UNAVAILABLE)
  }
}

private async doParse(familyId: string, audio: Express.Multer.File): Promise<VoiceParseResult> {
  // STT + NLU + 校验...
}
```

**分阶段超时**（可选更精细控制）：
- STT 阶段：5 秒
- NLU 阶段：5 秒

---

## 4. 接口设计

### 4.1 语音解析接口

```
POST /api/family/:familyId/voice/parse
Content-Type: multipart/form-data
```

**请求体**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `audio` | file | 语音文件（mp3/aac），由微信 `RecorderManager` 录制 |

**成功响应（200）**：

```json
{
  "recordType": "formula",
  "fields": { "formula_ml": 120 },
  "confidence": "high",
  "transcript": "宝宝喝了120毫升奶",
  "missingFields": null
}
```

**无法识别记录类型（200）**：`recordType: null`，前端展示"未识别到记录类型"卡片

**字段不完整（200）**：`confidence: "low"`，前端展示"信息不够完整"卡片

**超时（504）**：`识别超时，请重试`

**服务异常（503）**：`服务暂时不可用`

> **设计说明**：`recordType` 为 `null` 或 `confidence` 为 `low` 时，HTTP 状态码仍为 200，由前端根据这两个字段决定展示哪种失败卡片。只有服务级故障才返回 5xx。

### 4.2 记录创建接口

复用现有接口，无变更：

| 记录类型 | 接口 | 方法 |
|---------|------|------|
| 配方奶 | `/api/family/:fid/records/feeding` | POST |
| 母乳 | `/api/family/:fid/records/feeding` | POST |
| 辅食 | `/api/family/:fid/records/feeding` | POST |
| 尿布 | `/api/family/:fid/records/diaper` | POST |
| 睡眠 | `/api/family/:fid/records/sleep/complete` | POST |
| 体温 | `/api/family/:fid/records/health` | POST |
| 表现 | `/api/family/:fid/records/symptom` | POST |

---

## 5. 数据库变更

**无新增表，无 DDL 变更。**

语音是瞬时输入方式，不需要持久化语音记录或解析结果。用户确认录入后，数据直接写入现有记录表。

---

## 6. 环境变量

### 6.1 后端（CloudRun EnvParams）

无需新增环境变量。CloudBase AI SDK 通过 `CloudbaseModule` 已有的 `CLOUDBASE_APP` 注入，使用 CloudRun 内网凭证自动鉴权。

### 6.2 前端（Taro 构建变量）

无需新增。语音解析 API 走现有 `TARO_APP_API_BASE_URL`。

---

## 7. 关键技术风险与应对

### 7.1 RecognizerContext 兼容性

| 风险 | 应对 |
|------|------|
| `wx.createRecognizerContext` 基础库版本要求 2.22.0+ | 在 `useVoiceInput` 中做 API 可用性检测，不支持时降级为纯录音上传模式 |
| Taro 未封装 `createRecognizerContext` | 直接使用 `wx.createRecognizerContext()`，Taro 编译后为原生调用 |
| 部分安卓机型识别率低 | MVP 先验证主流机型，记录失败率数据，后续可切换为后端 ASR |

### 7.2 AI 解析准确率

| 风险 | 应对 |
|------|------|
| Prompt 注入攻击 | 后端对 `text` 做长度限制（<= 200 字符）+ 敏感词过滤 |
| AI 输出格式不稳定 | JSON 提取 + 校验 + 兜底返回 `recordType: null` |
| 方言/口语化表达识别差 | MVP 先验证普通话场景，收集失败语料迭代 Prompt |
| AI 调用成本 | 单次调用约 0.01-0.03 元，MVP 阶段可接受 |

### 7.3 性能

| 环节 | 预估耗时 | 优化 |
|------|---------|------|
| 微信 STT | 1-3 秒（实时，松开后即出结果） | 无需优化 |
| 后端 NLU | 2-5 秒（AI generateText） | temperature=0.1 降低随机性，减少 token 消耗 |
| 记录创建 | < 500ms | 无需优化 |
| **端到端** | **3-8 秒** | 10 秒超时限制 |

---

## 8. 测试策略

### 8.1 后端单元测试

- `VoiceService.parseAiResponse()`：覆盖各种 AI 输出格式（正常 JSON / 包裹在 markdown 中 / 格式错误 / 空值）
- Prompt 测试：准备 50+ 条语料，验证 AI 解析准确率 >= 85%

### 8.2 前端组件测试

- `useVoiceInput` Hook：模拟录音开始/停止/取消/超时各状态转换
- `VoiceResultSheet`：覆盖 5 种模式（success / no_match / insufficient / stt_failed / service_error）

### 8.3 集成测试

- 端到端流程：长按 → 说话 → 松开 → 识别 → 确认 → 记录创建成功
- 失败路径：网络断开 → 服务超时 → 麦克风权限拒绝 → 手动录入兜底

### 8.4 语料测试集

| 语句 | 期望 recordType | 期望 fields |
|------|----------------|-------------|
| 宝宝喝了120毫升奶 | formula | { formula_ml: 120 } |
| 喝了90ml奶 | formula | { formula_ml: 90 } |
| 左边喂了15分钟 | breast | { breast_side: "left", duration_min: 15 } |
| 右边吃了10分钟母乳 | breast | { breast_side: "right", duration_min: 10 } |
| 吃了苹果泥和香蕉 | food | { complementary_food: "苹果泥、香蕉" } |
| 换了个大便尿布 | diaper | { diaper_type: "dirty" } |
| 尿了 | diaper | { diaper_type: "wet" } |
| 睡了两个小时 | sleep | { duration_min: 120 } |
| 体温38度5 | temperature | { temperature: 38.5 } |
| 发烧39度 | temperature | { temperature: 39.0 } |
| 宝宝很开心 | symptom | { mood: "happy" } |
| 有点烦躁 | symptom | { mood: "fussy" } |
| 今天天气真好 | null | {} |
| 宝宝吃了点东西 | food | {} (confidence: low) |

---

## 9. 实现优先级与里程碑

| 阶段 | 内容 | 依赖 |
|------|------|------|
| P0-1 | 后端 VoiceModule + AI Prompt + 接口 | CloudBase AI SDK |
| P0-2 | 前端 useVoiceInput Hook + 语音录制 | 微信 RecorderManager + RecognizerContext |
| P0-3 | 前端 VoiceResultSheet + 确认录入流程 | P0-1 + P0-2 |
| P0-4 | TabBar 改造（长按/短按） | P0-2 |
| P1-1 | 语料测试 + Prompt 调优 | P0-1 |
| P1-2 | 表单页预填参数支持 | P0-3 |
