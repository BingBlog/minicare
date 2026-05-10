import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { HttpException, HttpStatus } from '@nestjs/common'
import { CLOUDBASE_APP, CLOUDBASE_AI_APP } from '../common/cloudbase/cloudbase.module'
import { VoiceParseResult } from './dto/voice.dto'
import { VOICE_NLU_CONFIG, SUPPLEMENT_ITEMS } from '../app-config/app-config.data'

const SUPPORTED_RECORD_TYPES: string[] = VOICE_NLU_CONFIG.recordTypes.map((r) => r.type)

const RECORD_KEY_FIELDS: Record<string, { fields: string[]; requireAny?: boolean }> = {}
for (const rt of VOICE_NLU_CONFIG.recordTypes) {
  const allFields = rt.fields as readonly { name: string; label: string; required?: boolean; enum?: readonly string[] }[]
  const requiredFields = allFields.filter((f) => f.required).map((f) => f.name)
  const optionalFields = allFields.filter((f) => !f.required).map((f) => f.name)
  if (requiredFields.length > 0) {
    RECORD_KEY_FIELDS[rt.type] = { fields: requiredFields }
  } else if (optionalFields.length > 0) {
    RECORD_KEY_FIELDS[rt.type] = { fields: optionalFields, requireAny: true }
  } else {
    RECORD_KEY_FIELDS[rt.type] = { fields: [] }
  }
}

const FIELD_VALIDATORS: Record<string, (v: unknown) => boolean> = {
  formula_ml:          (v) => typeof v === 'number' && v >= 1 && v <= 500,
  duration_min:        (v) => typeof v === 'number' && v >= 1 && v <= 720,
  temperature:         (v) => typeof v === 'number' && v >= 35 && v <= 42,
  diaper_type:         (v) => ['wet', 'dirty', 'mixed', 'dry'].includes(v as string),
  breast_side:         (v) => ['left', 'right', 'both'].includes(v as string),
  mood:                (v) => ['happy', 'calm', 'fussy', 'crying'].includes(v as string),
  spirit:              (v) => ['active', 'normal', 'tired', 'low'].includes(v as string),
  complementary_food:  (v) => typeof v === 'string' && v.trim().length > 0,
  supplement_key:      (v) => typeof v === 'string' && SUPPLEMENT_ITEMS.some((s) => s.key === v),
  supplement_name:     (v) => typeof v === 'string' && v.trim().length > 0,
  dose:                (v) => typeof v === 'string' && v.trim().length > 0,
}

function buildSystemPrompt(): string {
  const parts: string[] = []

  parts.push('你是敏宝日记（minicare）的语音录入语义解析器。你的唯一任务是将用户的一句话解析为结构化的宝宝记录数据。')
  parts.push('')

  parts.push('## 支持的记录类型及字段')
  parts.push('')
  for (const rt of VOICE_NLU_CONFIG.recordTypes) {
    const fieldDescs = rt.fields.map((f) => {
      let desc = f.name
      if (f.enum) desc += `（${f.enum.join('/')}）`
      if (f.name === 'formula_ml') desc += '（奶量，单位ml，整数）'
      if (f.name === 'duration_min') desc += '（时长，分钟）'
      if (f.name === 'temperature') desc += '（体温值，如38.5）'
      if (f.name === 'complementary_food') desc += '（食物名称）'
      if (f.name === 'supplement_key') desc += '（营养素代码，从别名映射表获取）'
      if (f.name === 'supplement_name') desc += '（营养素标准名称，从别名映射表获取）'
      if (f.name === 'dose') desc += '（剂量，如"400IU"、"1袋"，可选）'
      return desc
    })
    const fieldStr = fieldDescs.length > 0 ? `：${fieldDescs.join('、')}` : ''
    parts.push(`${VOICE_NLU_CONFIG.recordTypes.indexOf(rt) + 1}. ${rt.type}（${rt.label}）${fieldStr}`)
  }
  parts.push('')

  parts.push('## 关键同义词映射规则（必须严格遵守）')
  parts.push('')
  parts.push('### 记录类型判定')
  for (const rt of VOICE_NLU_CONFIG.recordTypes) {
    if (rt.triggers.length > 0) {
      const triggerStr = rt.triggers.map((t) => `"${t}"`).join('、')
      parts.push(`- ${triggerStr} → ${rt.type}（${rt.label}）`)
    }
  }
  parts.push('')

  for (const rt of VOICE_NLU_CONFIG.recordTypes) {
    if ('synonymMap' in rt && rt.synonymMap) {
      if (rt.type === 'diaper') {
        parts.push('### 尿布类型判定')
        const sm = rt.synonymMap as unknown as Record<string, string[]>
        for (const [val, aliases] of Object.entries(sm)) {
          parts.push(`- ${aliases.map((a) => `"${a}"`).join('、')} → diaper_type: "${val}"`)
        }
      } else if (rt.type === 'symptom') {
        parts.push('### 情绪/精神判定')
        const sm = rt.synonymMap as unknown as Record<string, Record<string, string[]>>
        for (const [field, mapping] of Object.entries(sm)) {
          const entries = Object.entries(mapping).map(([val, aliases]) => `"${aliases.join('/')}"→${val}`)
          parts.push(`- ${field}: ${entries.join(', ')}`)
        }
      }
    }
  }
  parts.push('')

  parts.push('### 营养素别名映射（必须严格遵守）')
  for (const item of SUPPLEMENT_ITEMS) {
    if (item.aliases && item.aliases.length > 0) {
      const aliasStr = item.aliases.map((a) => `"${a}"`).join('/')
      parts.push(`- ${aliasStr} → supplement_name: "${item.label}", supplement_key: "${item.key}"`)
    }
  }
  parts.push('')

  parts.push('### 睡眠类型区分规则')
  parts.push('- 用户说"刚睡了"/"睡了"/"入睡了"/"睡觉了"/"睡着了"/"哄睡了"（无时长） → sleep_start')
  parts.push('- 用户说"刚醒了"/"醒了"/"起来了"/"睡醒了" → sleep_end')
  parts.push('- 用户说了具体时长（如"睡了两个小时"/"午睡了40分钟"） → sleep（补录模式）')
  parts.push('')

  parts.push('## 解析规则')
  parts.push('')
  parts.push(`1. 只支持以上${VOICE_NLU_CONFIG.recordTypes.length}种记录类型，无法匹配时 recordType 为 null`)
  parts.push('2. 尽可能从用户语句中提取字段值，提取不到的字段不输出')
  parts.push('3. 时间默认为当前时间，不需要从语句中解析')
  parts.push('4. 一次只解析一条记录')
  parts.push('5. confidence: 关键字段齐全为 "high"，缺少关键字段为 "low"')
  parts.push('6. 数字提取：中文数字要转换为阿拉伯数字（"两个小时"→120分钟，"半小时"→30分钟）')
  parts.push('7. 体温提取："38度5"→38.5，"38.5度"→38.5')
  parts.push('')

  parts.push('## 输出格式')
  parts.push('')
  parts.push('严格输出一行 JSON，不要输出任何其他内容（不要 markdown 代码块、不要解释文字）：')
  parts.push('{"recordType":"类型或null","fields":{...},"confidence":"high或low","transcript":"原文"}')
  parts.push('')

  parts.push('## 示例')
  parts.push('')
  for (const rt of VOICE_NLU_CONFIG.recordTypes) {
    for (const ex of rt.examples) {
      parts.push(`输入：${ex.input}`)
      parts.push(`输出：${JSON.stringify({ recordType: ex.output.recordType, fields: ex.output.fields, confidence: ex.output.confidence, transcript: ex.input })}`)
      parts.push('')
    }
  }

  return parts.join('\n').trimEnd()
}

const SYSTEM_PROMPT = buildSystemPrompt()

@Injectable()
export class VoiceService implements OnModuleInit {
  private readonly logger = new Logger(VoiceService.name)

  constructor(
    @Inject(CLOUDBASE_APP) private readonly cloudbaseApp: any,
    @Inject(CLOUDBASE_AI_APP) private readonly cloudbaseAiApp: any,
  ) {}

  onModuleInit() {
    const secretId = process.env.TCB_SECRET_ID
    const secretKey = process.env.TCB_SECRET_KEY
    if (!secretId || !secretKey) {
      this.logger.error('缺少 TCB_SECRET_ID 或 TCB_SECRET_KEY 环境变量，语音识别功能不可用！请在 .env.local 中配置腾讯云 API 密钥。')
    } else {
      this.logger.log('语音识别服务初始化完成，TCB_SECRET_ID 已配置')
    }
    if (this.cloudbaseAiApp) {
      this.logger.log('AI 专用环境已配置，NLU 将使用独立 AI 环境')
    } else {
      this.logger.warn('TCB_AI_ENV_ID 未配置，NLU 将使用主环境（可能缺少 Token 额度）')
    }
    this.logger.log(`NLU 支持的记录类型: ${SUPPORTED_RECORD_TYPES.join(', ')}`)
  }

  async parse(familyId: string, audio: Express.Multer.File): Promise<VoiceParseResult> {
    if (!audio.buffer || audio.buffer.length === 0) {
      this.logger.error('收到空音频文件')
      throw new HttpException('音频文件为空', HttpStatus.BAD_REQUEST)
    }

    this.logger.log(`开始解析语音，文件大小=${audio.buffer.length}bytes, mimetype=${audio.mimetype}`)

    const text = await this.speechToText(audio)

    if (!text || text.trim().length === 0) {
      this.logger.warn('STT 返回空文本，可能是语音内容无法识别')
      return {
        recordType: null,
        fields: {},
        confidence: 'low',
        transcript: '',
        missingFields: null,
      }
    }

    this.logger.log(`STT 转写结果: "${text}"`)

    const aiResult = await this.nluParse(text)
    return this.buildResult(aiResult, text)
  }

  private detectAudioFormat(buffer: Buffer): 'mp3' | 'wav' | 'webm' | 'm4a' | 'ogg' | 'unknown' {
    if (buffer.length < 4) return 'unknown'
    const header = buffer.toString('hex', 0, 12)
    if (header.startsWith('1a45dfa3')) return 'webm'
    if (header.startsWith('52494646')) return 'wav'
    if (header.startsWith('fff3') || header.startsWith('fff2') || header.startsWith('49443303')) return 'mp3'
    if (header.startsWith('4f676753')) return 'ogg'
    if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) return 'm4a'
    return 'unknown'
  }

  private async speechToText(audio: Express.Multer.File): Promise<string> {
    const secretId = process.env.TCB_SECRET_ID
    const secretKey = process.env.TCB_SECRET_KEY

    if (!secretId || !secretKey) {
      this.logger.error('TCB_SECRET_ID 或 TCB_SECRET_KEY 未配置，无法调用 ASR')
      throw new HttpException('语音识别服务未配置，请联系管理员', HttpStatus.SERVICE_UNAVAILABLE)
    }

    try {
      const tencentcloud = require('tencentcloud-sdk-nodejs')
      const AsrClient = tencentcloud.asr.v20190614.Client

      const client = new AsrClient({
        credential: { secretId, secretKey },
        region: 'ap-guangzhou',
      })

      const detectedFormat = this.detectAudioFormat(audio.buffer)
      this.logger.log(`音频格式检测: mimetype=${audio.mimetype}, 实际格式=${detectedFormat}, size=${audio.buffer.length}`)

      if (detectedFormat === 'webm') {
        this.logger.error('收到 WebM 格式音频（模拟器环境），ASR 不支持此格式')
        throw new HttpException('模拟器不支持语音录入，请在真机上使用', HttpStatus.BAD_REQUEST)
      }

      const voiceFormat = ['mp3', 'wav', 'm4a', 'ogg'].includes(detectedFormat)
        ? detectedFormat
        : (audio.mimetype?.includes('mp3') ? 'mp3' : 'wav')

      const audioBase64 = audio.buffer.toString('base64')

      this.logger.log(`ASR 请求: engine=16k_zh, format=${voiceFormat}, audioSize=${audio.buffer.length}, base64Len=${audioBase64.length}`)

      const params = {
        EngSerViceType: '16k_zh',
        VoiceFormat: voiceFormat,
        SourceType: 1,
        Data: audioBase64,
        DataLen: audio.buffer.length,
        ConvertNumMode: 1,
      }

      const result = await client.SentenceRecognition(params)
      this.logger.log(`ASR 返回: ${JSON.stringify(result)}`)
      return result.Result || ''
    } catch (err) {
      if (err instanceof HttpException) throw err
      const errMsg = (err as Error).message
      this.logger.error(`ASR 调用失败: ${errMsg}`)
      throw new HttpException('语音转写失败，请重试', HttpStatus.BAD_GATEWAY)
    }
  }

  private isRetryableError(err: unknown): boolean {
    const msg = (err as Error).message || ''
    if (msg.includes('429') || msg.includes('rate') || msg.includes('Rate')) return true
    if (msg.includes('503') || msg.includes('Service Unavailable')) return true
    if (msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT') || msg.includes('timeout')) return true
    return false
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private async nluParse(text: string): Promise<{ recordType: string | null; fields: Record<string, unknown>; confidence: string; transcript: string }> {
    const provider = 'hunyuan-exp'
    const modelName = 'hunyuan-turbos-latest'
    const label = 'hunyuan-turbos'

    try {
      const ai = (this.cloudbaseAiApp || this.cloudbaseApp).ai()
      const model = ai.createModel(provider)

      const result = await model.generateText({
        model: modelName,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
        temperature: 0.1,
        maxTokens: 200,
      })

      this.logger.log(`[${label}] AI 原始响应: ${result.text}`)
      const parsed = this.parseAiResponse(result.text, text)

      if (parsed.recordType) {
        return parsed
      }

      this.logger.warn(`[${label}] 返回 recordType=null`)
      return { recordType: null, fields: {}, confidence: 'low', transcript: text }
    } catch (err) {
      const errMsg = (err as Error).message
      this.logger.error(`[${label}] NLU 解析失败: ${errMsg}`)
      return { recordType: null, fields: {}, confidence: 'low', transcript: text }
    }
  }

  private parseAiResponse(aiText: string, originalText: string): { recordType: string | null; fields: Record<string, unknown>; confidence: string; transcript: string } {
    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        this.logger.warn(`AI 响应无法解析为 JSON: ${aiText.substring(0, 200)}`)
        return { recordType: null, fields: {}, confidence: 'low', transcript: originalText }
      }

      const parsed = JSON.parse(jsonMatch[0])
      const recordType = SUPPORTED_RECORD_TYPES.includes(parsed.recordType) ? parsed.recordType : null

      return {
        recordType,
        fields: parsed.fields ?? {},
        confidence: parsed.confidence ?? 'low',
        transcript: parsed.transcript ?? originalText,
      }
    } catch (err) {
      this.logger.warn(`AI 响应 JSON 解析异常: ${(err as Error).message}`)
      return { recordType: null, fields: {}, confidence: 'low', transcript: originalText }
    }
  }

  private buildResult(aiResult: { recordType: string | null; fields: Record<string, unknown>; confidence: string; transcript: string }, originalText: string): VoiceParseResult {
    const { recordType, fields } = aiResult

    if (!recordType || !SUPPORTED_RECORD_TYPES.includes(recordType)) {
      return {
        recordType: null,
        fields: {},
        confidence: 'low',
        transcript: originalText,
        missingFields: null,
      }
    }

    const validFields: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(fields)) {
      const validator = FIELD_VALIDATORS[key]
      if (!validator || validator(value)) {
        validFields[key] = value
      }
    }

    const confidence = this.validateFieldCompleteness(recordType, validFields)

    const config = RECORD_KEY_FIELDS[recordType]
    const missingFields = config
      ? config.fields.filter((f) => {
          const val = validFields[f]
          return val === undefined || val === null || val === ''
        })
      : []

    return {
      recordType,
      fields: validFields,
      confidence,
      transcript: originalText,
      missingFields: missingFields.length > 0 ? missingFields : null,
    }
  }

  private validateFieldCompleteness(recordType: string, fields: Record<string, unknown>): 'high' | 'low' {
    const config = RECORD_KEY_FIELDS[recordType]
    if (!config) return 'high'
    if (config.fields.length === 0) return 'high'

    const { fields: keyFields, requireAny } = config

    if (requireAny) {
      const hasAny = keyFields.some((f) => {
        const val = fields[f]
        return val !== undefined && val !== null && val !== ''
      })
      return hasAny ? 'high' : 'low'
    }

    const hasAll = keyFields.every((f) => {
      const val = fields[f]
      if (typeof val === 'number') return val > 0
      return val !== undefined && val !== null && val !== ''
    })
    return hasAll ? 'high' : 'low'
  }
}
