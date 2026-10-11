/**
 * 敏宝助手 · 对话页（P3，TECH-006 §2.8.3）
 *
 * 能力：文字/语音输入、图片发送（压缩直传 COS）、SSE 流式回答、
 * 宝宝上下文条（多宝宝切换 = 新会话）、周报/月报快捷按钮、
 * 知识来源卡片、工具状态、日记草稿保存入口、会话本地恢复（最近一次）。
 */
import { View, Text, Input, Image, ScrollView, Textarea, type ITouchEvent } from '@tarojs/components'
import Taro, { useDidShow, getCurrentInstance } from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import NavBar from '@/components/NavBar/NavBar'
import ConfirmSheet from '@/components/ConfirmSheet'
import VoiceRecorder from '@/components/VoiceRecorder'
import { babyApi } from '@/api/baby'
import { agentDiaryApi, chatStream, type AgentSourceItem } from '@/api/agent'
import type { Baby } from '@/api/types'
import { getToken, getStoredFamilyId, setCurrentBabyId, getStoredBabyId } from '@/api/http'
import { API_BASE_URL } from '@/api/base'
import { getBabyAge, nowDate, yesterdayStr, toDateOnly } from '@/lib/utils'
import { uploadOne, fetchTempUrls } from '@/lib/uploadImage'
import MarkdownText from '@/components/MarkdownText/MarkdownText'
import { useChatVoice } from './useChatVoice'
import './index.scss'

const ICON_MIC = `data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 24 24" fill="none" stroke="#E8507A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>')}`
const ICON_PLUS = `data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 24 24" fill="none" stroke="#F87098" stroke-width="2" stroke-linecap="round" xmlns="http://www.w3.org/2000/svg"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>')}`

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  images?: { fileId: string; url?: string }[]
  sources?: AgentSourceItem[]
  toolNames?: string[]
  diaryRound?: boolean // 本轮触发过 generate_diary → 回答后可保存为日记
  diaryDate?: string // generate_diary 实际使用的日期（YYYY-MM-DD），保存时以此为准
  diarySaved?: boolean // 本轮日记已自动落库（生成即保存，F1）
  status: 'streaming' | 'done' | 'error' | 'aborted'
  error?: string
  time: string
}

interface PendingImage {
  fileId: string
  url: string // 本地预览路径
}

const TOOL_LABELS: Record<string, string> = {
  search_knowledge: '正在查询知识库…',
  query_baby_data: '正在查询宝宝数据…',
  analyze_baby_data: '正在分析宝宝数据…',
  generate_diary: '正在整理今天的素材…',
}

const LONG_PRESS_MS = 350
const CANCEL_THRESHOLD = -60

/**
 * 从 agent 完整回答中提取日记正文（去掉末尾的"引导补充趣事"话术）：
 * 保存到日记时只需正文，不应包含"今天有没有什么有意思的事想写进去？"这类引导语。
 */
const DIARY_FOLLOWUP_RE =
  /(\n*\s*(?:今天有没有什么|还有什么想记|有什么想写|想写进日记|有意思的事想写|随时告诉我(?:呀|哦)?|对了，?今天)[^]*)$/i

/**
 * 判断一段文本是否"只是准备语/寒暄"（不含日记正文特征）。
 * 用于剥离开场过程话术 —— 线上事故：2026-08-25 那篇把
 * 「好的，我先帮您聚合一下…这是旺仔的日记👇」当正文存进了 baby_diary。
 */
const DIARY_PREAMBLE_ACT_RE =
  /聚合|整理|汇总|统计|看一下|看看|查一下|拉取|读取|调取|准备|动笔|素材|记录和素材|这是.{0,6}的日记/
const DIARY_BODY_HINT_RE = /喂养|睡眠|大便|尿布|奶量|辅食|维生素|月龄|体重|身高|体温/

function looksLikePreamble(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  // 过长（可能是正文）或含正文特征词 → 判为正文，不剥离
  if (t.length > 200) return false
  if (DIARY_BODY_HINT_RE.test(t)) return false
  return DIARY_PREAMBLE_ACT_RE.test(t)
}

/**
 * 剥离模型开场的过程话术。两级策略：
 *  1) 首个 `---` 分隔线之前若只是准备语 → 整体丢弃（8-25 那篇属此类：
 *     准备语与"这是…的日记👇"挤在同一超长行，逐行判定覆盖不到）
 *  2) 逐行剥离开头最多 3 行过程话术（短句形态）
 * 判定从严，任一条件不满足即停止，避免误伤正文首句。
 */
function stripDiaryPreamble(content: string): string {
  let text = content

  const sep = text.search(/\n\s*-{3,}\s*\n/)
  if (sep > 0 && looksLikePreamble(text.slice(0, sep))) {
    text = text.slice(sep).replace(/^\s*-{3,}\s*/, '')
  }

  const lines = text.split('\n')
  let i = 0
  while (i < lines.length && i < 3) {
    const line = lines[i].trim()
    if (!line) {
      i += 1
      continue
    }
    if (!looksLikePreamble(line)) break
    i += 1
  }
  return lines.slice(i).join('\n').trim()
}

function extractDiaryBody(content: string): string {
  if (!content) return ''
  const body = stripDiaryPreamble(content)
  const tail = (() => {
    const m = body.match(DIARY_FOLLOWUP_RE)
    return m && m.index !== undefined ? body.slice(0, m.index) : body
  })()
  return tail
    .replace(/\s+$/, '')
    .replace(/---+\s*$/, '')
    // 日记以纯文本呈现，行首 markdown 标题符是无意义残留（如「## 旺仔小日记」）
    .replace(/^#{1,6}\s+/gm, '')
    .trim()
}

/**
 * 从 generate_diary 的 tool_result 输出里取实际使用的日期。
 * 模型未显式传 date 时 input.date 为空，只有工具返回的 date 才是权威值。
 */
function parseDiaryToolDate(output: string): string {
  if (!output) return ''
  try {
    const parsed = JSON.parse(output) as { date?: unknown }
    const d = typeof parsed.date === 'string' ? parsed.date : ''
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ''
  } catch {
    return ''
  }
}

/** 保存按钮文案：跟随实际日期，避免「存的是 9-18、按钮却写今天」的误导 */
function diarySaveLabel(date?: string): string {
  if (!date || date === nowDate()) return '保存为今天的日记'
  if (date === yesterdayStr()) return '保存为昨天的日记'
  const [, mm, dd] = date.split('-')
  return `保存为 ${Number(mm)}月${Number(dd)}日 的日记`
}

/**
 * 判断助手回答是否「就是一篇日记」——自动落库前的最后一道校验。
 *
 * 依据 prompt 规则 17 的日记结构（标题 → 日期+月龄行 → …），要求正文足够长
 * 且含日期行。不满足时**不自动保存**，保留手动保存按钮：宁可少存一篇，不可把
 * 「今天记录很少，要不要我先看看？」这类答复当成日记写进库。
 */
const DIARY_DATE_LINE_RE =
  /(\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日)|(\d{4}\s*[./-]\s*\d{1,2})|(\d{1,2}\s*月\s*\d{1,2}\s*日)/

function looksLikeDiary(body: string): boolean {
  return body.length >= 40 && DIARY_DATE_LINE_RE.test(body)
}

/** markdown 转纯文本（复制分享用）：去标题/加粗/列表/表格/引用符号 */
function stripMarkdown(content: string): string {
  if (!content) return ''
  return content
    .replace(/```[\s\S]*?```/g, (c) => c.replace(/^```[^\n]*\n|\n```$/g, ''))
    .replace(/\|/g, ' ')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*---+\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function nowTime(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function newMsgId(): string {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** 过敏摘要（如：轻度牛奶过敏） */
function allergySummary(baby: Baby): string {
  const level = baby.allergy_level
  const types = baby.allergy_types ?? []
  if (types.length === 0) return ''
  const typeText = types.join('/')
  const levelText =
    level === 'mild' ? '轻度' : level === 'moderate' ? '中度' : level === 'severe' ? '重度' : ''
  return `${levelText}${typeText}过敏`
}

export default function ChatPage() {
  const [familyId, setFamilyId] = useState('')
  const [babies, setBabies] = useState<Baby[]>([])
  const [baby, setBaby] = useState<Baby | null>(null)
  const [loading, setLoading] = useState(true)
  const [guard, setGuard] = useState<'guest' | 'onboarding' | ''>('')

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState('')
  const [inputText, setInputText] = useState('')
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([])
  const [sending, setSending] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [serviceDown, setServiceDown] = useState(false)
  const [keyboardHeight, setKeyboardHeight] = useState(0)

  // 日记草稿面板
  const [draftOpen, setDraftOpen] = useState(false)
  const [draftText, setDraftText] = useState('')
  const [draftSaving, setDraftSaving] = useState(false)
  const [overwriteConfirm, setOverwriteConfirm] = useState(false)
  const [savingDiaryDate, setSavingDiaryDate] = useState('')

  // 滚动到底：用累加的 scrollTop 而非 scrollIntoView。
  // 原实现绑定 useRef（scrollIntoView={scrollIdRef.current}），effect 改 ref 不触发重渲染，
  // 首屏一次性 setMessages(restored) 后再无渲染 → 永远停在顶部；
  // 流式期间也只是"恰好"追赶。累加值保证每次内容变化都超出可滚动高度 → 稳定滚底。
  const [scrollTop, setScrollTop] = useState(0)
  const scrollTopRef = useRef(0)
  const chatHandleRef = useRef<{ abort: () => void } | null>(null)
  const streamingMsgIdRef = useRef('')
  const isLongPressRef = useRef(false)
  const touchStartYRef = useRef(0)
  const isCancelingRef = useRef(false)
  const pressedRef = useRef(false)
  const presetDiarySentRef = useRef(false)
  const initedRef = useRef(false)
  const messagesRef = useRef<ChatMessage[]>([])
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const voice = useChatVoice(familyId)

  const storageKey = useCallback(
    (kind: 'conv' | 'msgs') => `agent_${kind}_${familyId}_${baby?.id ?? ''}`,
    [familyId, baby?.id],
  )

  // ── 进入守卫：登录 / 家庭 / 宝宝 ─────────────────────────────────
  useDidShow(() => {
    if (initedRef.current) return
    if (!getToken()) {
      setGuard('guest')
      setLoading(false)
      return
    }
    const fid = getStoredFamilyId()
    if (!fid) {
      setGuard('onboarding')
      setLoading(false)
      return
    }
    initedRef.current = true
    setFamilyId(fid)
    loadChat(fid)
  })

  const loadChat = useCallback(async (fid: string) => {
    setLoading(true)
    try {
      const list = await babyApi.list(fid)
      if (list.length === 0) {
        setGuard('onboarding')
        setLoading(false)
        return
      }
      setBabies(list)
      const storedId = getStoredBabyId()
      const current = list.find((b) => b.id === storedId) ?? list[0]
      setBaby(current)
      setCurrentBabyId(current.id)

      // 恢复本地会话（conversationId + 消息，最近一次）
      const convKey = `agent_conv_${fid}_${current.id}`
      const msgsKey = `agent_msgs_${fid}_${current.id}`
      setConversationId(Taro.getStorageSync(convKey) || '')
      const cached = Taro.getStorageSync(msgsKey)
      const restored = Array.isArray(cached)
        ? cached.filter((m) => m && m.role && m.content !== undefined)
        : []
      setMessages(restored)

      // 缓存的本地图片路径已失效 → 按 fileID 批量拉临时 URL
      const fileIds = restored.flatMap((m) => (m.images ?? []).map((i) => i.fileId).filter(Boolean))
      if (fileIds.length > 0) {
        fetchTempUrls(fileIds).then((urlMap) => {
          setMessages((prev) =>
            prev.map((m) => ({
              ...m,
              images: m.images?.map((img) =>
                img.fileId && urlMap.has(img.fileId) ? { ...img, url: urlMap.get(img.fileId) } : img,
              ),
            })),
          )
        })
      }
      setGuard('')
    } catch {
      setGuard('onboarding')
    } finally {
      setLoading(false)
    }
  }, [])

  // 键盘高度监听（键盘弹起时输入区上移，消息区自动收缩）
  useEffect(() => {
    const taroAny = Taro as unknown as {
      onKeyboardHeightChange?: (cb: (res: { height: number }) => void) => void | (() => void)
    }
    const off = taroAny.onKeyboardHeightChange?.((res) => {
      setKeyboardHeight(res.height || 0)
    })
    return () => {
      if (typeof off === 'function') off()
    }
  }, [])

  // 生成计时（发送中显示，让用户感知流式仍在进行）
  useEffect(() => {
    if (!sending) {
      setElapsed(0)
      return
    }
    const start = Date.now()
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [sending])

  // 服务健康探测（非阻塞，仅提示；带登录态以便真正透传到 agent /health）
  useEffect(() => {
    if (!familyId) return
    let cancelled = false
    const token = getToken()
    Taro.request({
      url: `${API_BASE_URL}/api/agent/health`,
      method: 'GET',
      timeout: 5000,
      header: token ? { Authorization: `Bearer ${token}` } : {},
      success: (res) => {
        // 200 = agent 健康（server 透传）；400（agent 不可达）/ 其它 → 视为服务异常
        if (!cancelled) setServiceDown(res.statusCode !== 200)
      },
      fail: () => {
        if (!cancelled) setServiceDown(true)
      },
    })
    return () => {
      cancelled = true
    }
  }, [familyId])

  // 预置消息（首页卡片 / 日记列表「写日记」/ 日记详情「重新生成」跳转）
  useEffect(() => {
    if (!baby || loading || presetDiarySentRef.current) return
    const params = getCurrentInstance()?.router?.params ?? {}
    if (params.preset === 'diary') {
      presetDiarySentRef.current = true
      // 详情页「重新生成」带该篇自身日期；首页卡片与列表页带昨天日期；
      // 都没带（旧版入口）同样退化为昨天 —— 日记是回顾式总结，当天数据还不全。
      // 一律发「显式日期」消息，因此不依赖 prompt 的日期规则也能拿到正确日期。
      const d = toDateOnly(params.date) || yesterdayStr()
      const [, mm, dd] = d.split('-')
      void sendMessage(`帮我写 ${Number(mm)}月${Number(dd)}日 的日记`, [])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baby?.id, loading])

  // 消息变化即滚底（首屏恢复 / 新消息 / 流式增长三种场景统一）
  useEffect(() => {
    if (messages.length === 0) return
    // 步长远大于任何会话高度，微信侧会 clamp 到可滚动底部
    scrollTopRef.current += 100000
    setScrollTop(scrollTopRef.current)
  }, [messages])

  // 语音转写完成 → 回填输入框
  useEffect(() => {
    if (voice.state === 'done' && voice.transcript) {
      setInputText(voice.transcript)
      voice.reset()
    } else if (voice.state === 'error') {
      Taro.showToast({ title: voice.errorMsg || '语音识别失败', icon: 'none', duration: 2500 })
      voice.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.state])

  /**
   * 持久化消息列表（供再次进入恢复）。
   *
   * 必须把本轮状态显式 patch 进去：messagesRef 由 useEffect 同步，晚于 setMessages
   * 一拍，直接读它会丢掉刚写入的 diaryRound/diarySaved，刷新后按钮就消失了。
   * patch 返回 null 表示该条不变；值为 undefined 的键会被剔除（避免覆盖已有值）。
   */
  const persistMessages = useCallback(
    (patch: (m: ChatMessage) => Partial<ChatMessage> | null) => {
      const list = messagesRef.current
        .map((m) => {
          const p = patch(m)
          if (!p) return m
          const cleaned = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined))
          return { ...m, ...cleaned }
        })
        .map((m) => ({
          ...m,
          status: m.status === 'streaming' ? ('done' as const) : m.status,
          images: m.images?.map((img) => ({ fileId: img.fileId })),
        }))
      Taro.setStorageSync(storageKey('msgs'), list.slice(-40))
    },
    [storageKey],
  )

  /**
   * 生成即落库（F1 日记自动保存闭环）。
   *
   * 两种结果：
   *  - 该日期没有日记 → 直接保存，并把消息标记为「已保存」（消息下方出现「查看」）；
   *  - 该日期已有日记 → **不覆盖**，打开预填的草稿层交给家长确认（风险 R4）。
   * 失败静默：保留手动保存按钮兜底，不打断对话。
   */
  const autoSaveDiary = useCallback(
    async (msgId: string, rawText: string, date: string) => {
      if (!familyId || !baby) return
      const body = extractDiaryBody(rawText)
      if (!looksLikeDiary(body)) return
      try {
        const exist = await agentDiaryApi.detail(familyId, baby.id, date)
        if (exist) {
          setDraftText(body)
          setSavingDiaryDate(date)
          setDraftOpen(true)
          return
        }
        await agentDiaryApi.save({
          family_id: familyId,
          baby_id: baby.id,
          diary_date: date,
          content: body,
          photo_ids: [],
        })
        setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, diarySaved: true } : m)))
        persistMessages((m) => (m.id === msgId ? { diarySaved: true } : null))
        Taro.eventCenter.trigger('diary:changed')
      } catch {
        /* 自动保存失败：保留手动保存入口，不打扰家长 */
      }
    },
    [familyId, baby, persistMessages],
  )

  // ── 发送消息 ────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string, images: PendingImage[]) => {
      const content = text.trim()
      if (!content && images.length === 0) return
      if (sending) return
      if (!familyId || !baby) {
        Taro.showToast({ title: '请先完成宝宝建档', icon: 'none' })
        return
      }

      const userMsg: ChatMessage = {
        id: newMsgId(),
        role: 'user',
        content,
        images: images.map((img) => ({ fileId: img.fileId, url: img.url })),
        status: 'done',
        time: nowTime(),
      }
      const asstMsg: ChatMessage = {
        id: newMsgId(),
        role: 'assistant',
        content: '',
        toolNames: [],
        status: 'streaming',
        time: nowTime(),
      }
      // ⚠️ 闭包捕获本条消息 id（2026-08-23 修复）：不能用 streamingMsgIdRef 全局 ref，
      // 连续发送两条消息时 ref 会被第二条覆盖，导致第一条 done 后 status 永远更新不上
      const msgId = asstMsg.id
      const nextMessages = [...messagesRef.current, userMsg, asstMsg]
      setMessages(nextMessages)
      setInputText('')
      setPendingImages([])
      setSending(true)
      streamingMsgIdRef.current = asstMsg.id

      // 本轮累积（本地变量，避免 React 异步更新导致判断丢失/时序错位）
      const roundToolNames: string[] = []
      let answerText = '' // 本轮助手正文（自动落库用，不依赖 state 时序）
      let roundDiaryDate = '' // generate_diary 实际使用的日期

      const handle = chatStream({
        familyId,
        babyId: baby.id,
        message: content,
        conversationId: conversationId || undefined,
        images: images.map((img) => ({ fileId: img.fileId, mimeType: 'image/jpeg' })),
        onEvent: (ev) => {
          if (ev.event === 'meta') {
            setConversationId(ev.data.conversationId)
          } else if (ev.event === 'tool_call') {
            roundToolNames.push(ev.data.name)
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== msgId) return m
                // 同工具名去重（循环调用时状态不重复闪现）
                const names = m.toolNames ?? []
                return names.includes(ev.data.name)
                  ? m
                  : { ...m, toolNames: [...names, ev.data.name] }
              }),
            )
          } else if (ev.event === 'text') {
            answerText += ev.data.delta
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msgId ? { ...m, content: m.content + ev.data.delta } : m,
              ),
            )
          } else if (ev.event === 'tool_result') {
            // 以工具实际返回的 date 为准（模型未显式传 date 时 input.date 为空，只有 output 权威）
            if (ev.data.name === 'generate_diary') {
              const usedDate = parseDiaryToolDate(ev.data.output)
              if (usedDate) {
                roundDiaryDate = usedDate
                setMessages((prev) =>
                  prev.map((m) => (m.id === msgId ? { ...m, diaryDate: usedDate } : m)),
                )
              }
            }
          } else if (ev.event === 'sources') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msgId ? { ...m, sources: ev.data.sources } : m,
              ),
            )
          }
        },
      })
      chatHandleRef.current = handle

      try {
        const result = await handle.promise
        const wasDiaryRound = roundToolNames.includes('generate_diary')
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? {
                  ...m,
                  status: result.aborted ? 'aborted' : 'done',
                  diaryRound: wasDiaryRound,
                }
              : m,
          ),
        )
        // 持久化会话（conversationId + 消息），供再次进入恢复；本地图片路径失效，只存 fileID
        if (result.conversationId) {
          setConversationId(result.conversationId)
          Taro.setStorageSync(storageKey('conv'), result.conversationId)
        }
        persistMessages((m) =>
          m.id === msgId
            ? {
                status: result.aborted ? 'aborted' : 'done',
                diaryRound: wasDiaryRound,
                diaryDate: roundDiaryDate || undefined,
              }
            : null,
        )
        // 生成即落库（F1）：本轮生成过日记且正文像日记 → 直接保存，家长无需再点。
        // 中断（用户手动停止）不自动保存，避免存下半截正文。
        if (wasDiaryRound && !result.aborted) {
          await autoSaveDiary(msgId, answerText, roundDiaryDate || yesterdayStr())
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : '请求失败'
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamingMsgIdRef.current ? { ...m, status: 'error', error: msg } : m,
          ),
        )
        if (msg.includes('网络请求失败') || msg.includes('超时') || msg.includes('无法连接')) {
          setServiceDown(true)
        }
      } finally {
        setSending(false)
        chatHandleRef.current = null
        streamingMsgIdRef.current = ''
      }
    },
    [sending, familyId, baby, conversationId, storageKey, persistMessages, autoSaveDiary],
  )

  // ── 停止生成 ────────────────────────────────────────────────────
  const stopGenerating = useCallback(() => {
    chatHandleRef.current?.abort()
  }, [])

  // ── 图片选择（压缩直传 COS，随消息发送）────────────────────────
  const handlePickImage = useCallback(async () => {
    if (sending) return
    if (pendingImages.length >= 3) {
      Taro.showToast({ title: '每条消息最多 3 张图片', icon: 'none' })
      return
    }
    try {
      const remain = 3 - pendingImages.length
      const res = await Taro.chooseImage({
        count: remain,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
      })
      const picked = res.tempFilePaths.map((path) => ({ fileId: '', url: path }))
      setPendingImages((prev) => [...prev, ...picked].slice(0, 3))
      // 逐张压缩直传 COS，fileId 就绪后替换占位（失败项保留本地路径，发送时剔除）
      for (const file of picked) {
        try {
          const fileId = await uploadOne('chat', baby?.id ?? 'pending', file.url)
          setPendingImages((prev) => prev.map((p) => (p.url === file.url ? { ...p, fileId } : p)))
        } catch {
          /* 单张失败不阻塞其他图片 */
        }
      }
    } catch {
      Taro.showToast({ title: '图片选择失败，请重试', icon: 'none' })
    }
  }, [sending, pendingImages, baby?.id])

  // ── 语音长按（350ms 触发录音，上滑取消）────────────────────────
  const handleVoiceStart = useCallback(
    (e: ITouchEvent) => {
      const touch = e.touches?.[0]
      if (touch) touchStartYRef.current = touch.clientY
      pressedRef.current = true
      isLongPressRef.current = false
      isCancelingRef.current = false
      setTimeout(() => {
        if (pressedRef.current && !isLongPressRef.current) {
          isLongPressRef.current = true
          voice.setPressed(true)
          voice.start()
        }
      }, LONG_PRESS_MS)
    },
    [voice],
  )

  const handleVoiceMove = useCallback(
    (e: ITouchEvent) => {
      if (!isLongPressRef.current || isCancelingRef.current) return
      const touch = e.touches?.[0]
      if (!touch) return
      if (touch.clientY - touchStartYRef.current < CANCEL_THRESHOLD) {
        isCancelingRef.current = true
        voice.cancel()
      }
    },
    [voice],
  )

  const handleVoiceEnd = useCallback(() => {
    pressedRef.current = false
    if (isLongPressRef.current && !isCancelingRef.current) {
      voice.setPressed(false)
      voice.stop()
    }
  }, [voice])

  // ── 发送（键盘/发送按钮）────────────────────────────────────────
  const handleSend = useCallback(() => {
    if (sending) return
    void sendMessage(inputText, pendingImages.filter((img) => img.fileId))
  }, [sending, inputText, pendingImages, sendMessage])

  // ── 宝宝切换（切换 = 新会话）───────────────────────────────────
  const handleSwitchBaby = useCallback(() => {
    if (babies.length <= 1) return
    Taro.showActionSheet({
      itemList: babies.map((b) => `${b.name}${allergySummary(b) ? `（${allergySummary(b)}）` : ''}`),
      success: (res) => {
        const next = babies[res.tapIndex]
        if (!next || next.id === baby?.id) return
        Taro.showModal({
          title: '切换宝宝',
          content: `切换到「${next.name}」将开启新的会话（当前对话不保留）`,
          confirmText: '切换',
          success: (modalRes) => {
            if (!modalRes.confirm) return
            setBaby(next)
            setCurrentBabyId(next.id)
            setMessages([])
            setConversationId('')
            setInputText('')
            setPendingImages([])
            setSavingDiaryDate('')
            const convKey = `agent_conv_${familyId}_${next.id}`
            const msgsKey = `agent_msgs_${familyId}_${next.id}`
            setConversationId(Taro.getStorageSync(convKey) || '')
            const cached = Taro.getStorageSync(msgsKey)
            setMessages(Array.isArray(cached) ? cached.filter((m) => m && m.role) : [])
          },
        })
      },
    })
  }, [babies, baby, familyId])

  // ── 新会话（清空本地会话）──────────────────────────────────────
  const handleNewSession = useCallback(() => {
    Taro.showModal({
      title: '开始新会话',
      content: '将清空当前对话记录（服务器历史保留，仅最近 20 条可恢复）',
      confirmText: '新会话',
      success: (res) => {
        if (!res.confirm) return
        setMessages([])
        setConversationId('')
        Taro.removeStorageSync(storageKey('conv'))
        Taro.removeStorageSync(storageKey('msgs'))
      },
    })
  }, [storageKey])

  // ── 日记保存流程 ────────────────────────────────────────────────
  const openDraft = useCallback((content: string, date?: string) => {
    setDraftText(content)
    // 保存日期跟随本轮 generate_diary 实际使用的日期。
    // 原实现硬编码 nowDate()，线上已造成「正文写 9-18、diary_date 落 9-19」的错位数据。
    setSavingDiaryDate(date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : nowDate())
    setDraftOpen(true)
  }, [])

  const handleSaveDraft = useCallback(async () => {
    const content = draftText.trim()
    if (!content || !familyId || !baby) return
    setDraftSaving(true)
    try {
      await agentDiaryApi.save({
        family_id: familyId,
        baby_id: baby.id,
        diary_date: savingDiaryDate,
        content,
        photo_ids: [],
      })
      setDraftOpen(false)
      Taro.showToast({ title: '日记已保存', icon: 'success' })
      // 手动保存后同样标记「已保存」：否则按钮仍停在「保存为…」，诱导重复保存
      const markSaved = (m: ChatMessage) =>
        m.role === 'assistant' && m.diaryRound && (m.diaryDate || '') === savingDiaryDate
          ? { diarySaved: true }
          : null
      setMessages((prev) => prev.map((m) => (markSaved(m) ? { ...m, diarySaved: true } : m)))
      persistMessages(markSaved)
      Taro.eventCenter.trigger('diary:changed')
    } catch (err) {
      Taro.showToast({ title: err instanceof Error ? err.message : '保存失败', icon: 'none' })
    } finally {
      setDraftSaving(false)
    }
  }, [draftText, familyId, baby, savingDiaryDate, persistMessages])

  const handleDraftSaveClick = useCallback(async () => {
    if (!familyId || !baby) return
    // 当天已有日记 → 覆盖确认
    try {
      const exist = await agentDiaryApi.detail(familyId, baby.id, savingDiaryDate)
      if (exist) {
        setOverwriteConfirm(true)
        return
      }
    } catch {
      /* 查询失败不阻塞，直接保存 */
    }
    void handleSaveDraft()
  }, [familyId, baby, savingDiaryDate, handleSaveDraft])

  // ── 渲染辅助 ────────────────────────────────────────────────────

  const renderToolStatus = (m: ChatMessage) => {
    // 仅流式期间显示工具状态；完成/出错/中止后必须消失（2026-08-23 修复残留转圈）
    if (m.status !== 'streaming') return null
    const tools = m.toolNames ?? []
    if (tools.length === 0) return null
    const active = tools[tools.length - 1]
    return (
      <View className='chat-msg__tool'>
        <View className='chat-msg__tool-spinner' />
        <Text className='chat-msg__tool-text'>{TOOL_LABELS[active] ?? `正在${active}…`}</Text>
      </View>
    )
  }

  const renderSources = (m: ChatMessage) => {
    if (!m.sources || m.sources.length === 0) return null
    return (
      <View className='chat-sources'>
        <Text className='chat-sources__title'>参考来源</Text>
        {m.sources.map((s) => (
          <View key={s.id || s.kbId} className='chat-sources__item'>
            <Text className='chat-sources__name'>{s.title}</Text>
            <Text className='chat-sources__src'>{s.source}</Text>
          </View>
        ))}
      </View>
    )
  }

  const renderAssistantFooter = (m: ChatMessage) => {
    if (m.status !== 'done') return null
    const targetDate = m.diaryDate || yesterdayStr()
    return (
      <View className='chat-msg__footer'>
        {m.diarySaved ? (
          <View
            className='chat-msg__diary-btn chat-msg__diary-btn--saved'
            onClick={() => Taro.navigateTo({ url: `/pages/diary/detail?date=${targetDate}` })}
          >
            <Text className='chat-msg__diary-btn-text'>已保存到日记 · 查看</Text>
          </View>
        ) : m.diaryRound ? (
          <View className='chat-msg__diary-btn' onClick={() => openDraft(extractDiaryBody(m.content), m.diaryDate)}>
            <Text className='chat-msg__diary-btn-text'>{diarySaveLabel(m.diaryDate)}</Text>
          </View>
        ) : null}
        <Text className='chat-msg__disclaimer'>本回答仅供参考，不能替代专业医疗建议</Text>
      </View>
    )
  }

  if (loading) {
    return (
      <View className='chat-page'>
        <NavBar title='敏宝助手' showBack />
        <View className='chat-loading'>
          <View className='chat-loading__spinner' />
          <Text className='chat-loading__text'>加载中...</Text>
        </View>
      </View>
    )
  }

  if (guard === 'guest') {
    return (
      <View className='chat-page'>
        <NavBar title='敏宝助手' showBack />
        <View className='chat-guard'>
          <Text className='chat-guard__title'>登录后即可对话</Text>
          <Text className='chat-guard__desc'>敏宝助手会结合知识库与宝宝记录回答你的问题</Text>
          <View className='chat-guard__btn' onClick={() => Taro.reLaunch({ url: '/pages/login/index' })}>
            <Text className='chat-guard__btn-text'>立即登录</Text>
          </View>
        </View>
      </View>
    )
  }

  if (guard === 'onboarding' || !baby) {
    return (
      <View className='chat-page'>
        <NavBar title='敏宝助手' showBack />
        <View className='chat-guard'>
          <Text className='chat-guard__title'>请先创建宝宝档案</Text>
          <Text className='chat-guard__desc'>创建宝宝档案后即可与敏宝助手对话</Text>
          <View className='chat-guard__btn' onClick={() => Taro.navigateTo({ url: '/pages/onboarding/index' })}>
            <Text className='chat-guard__btn-text'>创建宝宝档案</Text>
          </View>
        </View>
      </View>
    )
  }

  const isRecording = voice.state === 'recording'

  return (
    <View className='chat-page'>
      <NavBar title='敏宝助手' showBack />

      {/* 宝宝上下文条 */}
      <View className='chat-baby' onClick={handleSwitchBaby}>
        <View className='chat-baby__avatar'>
          <Text className='chat-baby__avatar-text'>{(baby.name || '宝')[0]}</Text>
        </View>
        <View className='chat-baby__info'>
          <Text className='chat-baby__name'>
            {baby.name}
            {baby.birth_date ? ` · ${getBabyAge(baby.birth_date)}` : ''}
          </Text>
          <Text className='chat-baby__sub'>
            {allergySummary(baby) || `出生 ${baby.birth_date || '—'}`}
          </Text>
        </View>
        {babies.length > 1 ? (
          <View className='chat-baby__switch'>
            <Text className='chat-baby__switch-text'>切换 ▾</Text>
          </View>
        ) : null}
      </View>

      {serviceDown ? (
        <View className='chat-banner'>
          <Text className='chat-banner__text'>服务升级中，暂时无法回答，请稍后再试</Text>
        </View>
      ) : null}

      {/* 快捷按钮 */}
      <View className='chat-quick'>
        <View className='chat-quick__btn' onClick={() => void sendMessage('生成最近 7 天总结', [])}>
          <Text className='chat-quick__text'>周报</Text>
        </View>
        <View className='chat-quick__btn' onClick={() => void sendMessage('生成最近 30 天总结', [])}>
          <Text className='chat-quick__text'>月报</Text>
        </View>
        <View className='chat-quick__spacer' />
        <View className='chat-quick__btn chat-quick__btn--muted' onClick={handleNewSession}>
          <Text className='chat-quick__text'>新会话</Text>
        </View>
      </View>

      {/* 消息列表 */}
      <ScrollView className='chat-scroll' scrollY scrollWithAnimation scrollTop={scrollTop}>
        <View className='chat-scroll__inner'>
          {messages.length === 0 ? (
            <View className='chat-empty'>
              <View className='chat-empty__icon'>
                <Text className='chat-empty__icon-text'>敏</Text>
              </View>
              <Text className='chat-empty__title'>你好，我是敏宝助手</Text>
              <Text className='chat-empty__desc'>
                可以问我过敏知识、宝宝的记录数据，也可以说「帮我写今天的日记」
              </Text>
              <View
                className='chat-empty__suggest'
                onClick={() => void sendMessage('深度水解和氨基酸配方有什么区别？', [])}
              >
                <Text className='chat-empty__suggest-text'>深度水解和氨基酸配方有什么区别？</Text>
              </View>
            </View>
          ) : null}

          {messages.map((m) => (
            <View key={m.id} id={`msg-${m.id}`} className={`chat-msg chat-msg--${m.role}`}>
              {m.role === 'assistant' ? (
                <View className='chat-msg__avatar chat-msg__avatar--ai'>
                  <Text className='chat-msg__avatar-text'>敏</Text>
                </View>
              ) : null}
              <View className={`chat-msg__body chat-msg__body--${m.role}`}>
                {m.images && m.images.length > 0 ? (
                  <View className='chat-msg__images'>
                    {m.images.map((img, idx) => (
                      <Image
                        key={`${img.fileId}-${idx}`}
                        className='chat-msg__img'
                        src={img.url || img.fileId}
                        mode='aspectFill'
                        onClick={() =>
                          Taro.previewImage({
                            urls: (m.images ?? []).map((i) => i.url || i.fileId),
                            current: img.url || img.fileId,
                          })
                        }
                      />
                    ))}
                  </View>
                ) : null}
                {m.content ? (
                  <View
                    className={`chat-msg__bubble chat-msg__bubble--${m.role}`}
                    onLongPress={() => {
                      if (m.role !== 'assistant' || !m.content) return
                      Taro.showActionSheet({
                        itemList: ['复制全文', '复制纯文本'],
                        success: (r) => {
                          const plain = r.tapIndex === 1
                          Taro.setClipboardData({
                            data: plain ? stripMarkdown(m.content) : m.content,
                            success: () => Taro.showToast({ title: '已复制', icon: 'success' }),
                          })
                        },
                      })
                    }}
                  >
                    {m.role === 'assistant' ? (
                      <>
                        <MarkdownText content={m.content} />
                        {m.status === 'streaming' ? <Text className='chat-msg__cursor'>▍</Text> : null}
                      </>
                    ) : (
                      <Text className='chat-msg__text'>
                        {m.content}
                        {m.status === 'streaming' ? <Text className='chat-msg__cursor'>▍</Text> : null}
                      </Text>
                    )}
                  </View>
                ) : m.role === 'assistant' && m.status === 'streaming' ? (
                  // ⚠️ 思考中占位：模型推理阶段（发送后到首个事件前）content 为空，
                  // 展示"正在思考…"避免用户以为没反应（配合右上角 elapsed 计时）
                  <View className='chat-msg__bubble chat-msg__bubble--assistant chat-msg__thinking'>
                    <View className='chat-msg__thinking-dots'>
                      <View className='chat-msg__thinking-dot' />
                      <View className='chat-msg__thinking-dot' />
                      <View className='chat-msg__thinking-dot' />
                    </View>
                    <Text className='chat-msg__thinking-text'>正在思考{elapsed >= 5 ? ` ${elapsed}s` : ''}…</Text>
                  </View>
                ) : null}
                {renderToolStatus(m)}
                {renderSources(m)}
                {renderAssistantFooter(m)}
                {m.status === 'error' ? (
                  <View className='chat-msg__error'>
                    <Text className='chat-msg__error-text'>{m.error || '回答失败，请重试'}</Text>
                  </View>
                ) : null}
                {m.status === 'aborted' ? (
                  <View className='chat-msg__error'>
                    <Text className='chat-msg__error-text'>已停止生成</Text>
                  </View>
                ) : null}
                <Text className='chat-msg__time'>{m.time}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* 输入区 */}
      <View className='chat-input-wrap' style={{ paddingBottom: keyboardHeight }}>
        <View className='chat-input'>
          <View className='chat-input__attach' onClick={handlePickImage}>
            <Image className='chat-input__attach-icon' src={ICON_PLUS} mode='aspectFit' />
          </View>

          <View className='chat-input__main'>
            {pendingImages.length > 0 ? (
              <View className='chat-input__thumbs'>
                {pendingImages.map((img, idx) => (
                  <View key={`${img.url}-${idx}`} className='chat-input__thumb-wrap'>
                    <Image className='chat-input__thumb' src={img.url} mode='aspectFill' />
                    <View
                      className='chat-input__thumb-del'
                      onClick={() => setPendingImages((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <Text className='chat-input__thumb-del-text'>×</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
            <Input
              className='chat-input__field'
              value={inputText}
              placeholder='输入你的问题…'
              placeholderClass='chat-input__placeholder'
              confirmType='send'
              adjustPosition={false}
              cursorSpacing={20}
              onInput={(e) => setInputText(e.detail.value)}
              onConfirm={() => handleSend()}
              disabled={sending}
            />
          </View>

          <View
            className={`chat-input__voice${isRecording ? ' is-recording' : ''}`}
            onTouchStart={handleVoiceStart}
            onTouchMove={handleVoiceMove}
            onTouchEnd={handleVoiceEnd}
          >
            <Image className='chat-input__voice-icon' src={ICON_MIC} mode='aspectFit' />
          </View>

          {sending ? (
            <View className='chat-input__stop' onClick={stopGenerating}>
              <Text className='chat-input__stop-text'>
                {elapsed >= 15 ? `停止 ${elapsed}s` : '停止'}
              </Text>
            </View>
          ) : inputText.trim() || pendingImages.length > 0 ? (
            <View className='chat-input__send' onClick={handleSend}>
              <Text className='chat-input__send-text'>发送</Text>
            </View>
          ) : null}
        </View>
        <View className='chat-input__footer'>
          <Text className='chat-input__footer-text'>AI 回答仅供参考，不能替代专业医疗建议</Text>
        </View>
      </View>

      {/* 录音覆盖层 */}
      {isRecording ? (
        <VoiceRecorder
          state={isCancelingRef.current ? 'canceling' : 'recording'}
          duration={voice.duration}
          maxDuration={30}
          volumeLevels={voice.volumeLevels}
          onCancel={voice.cancel}
        />
      ) : null}

      {/* 日记草稿面板 */}
      {draftOpen ? (
        <View className='chat-draft-mask' onClick={() => setDraftOpen(false)}>
          <View
            className='chat-draft'
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: keyboardHeight }}
          >
            <View className='chat-draft__handle' />
            <Text className='chat-draft__title'>日记草稿 · {savingDiaryDate}</Text>
            <Textarea
              className='chat-draft__area'
              value={draftText}
              maxlength={2000}
              autoHeight
              placeholder='可以修改润色后保存…'
              placeholderClass='chat-draft__placeholder'
              onInput={(e) => setDraftText(e.detail.value)}
            />
            <Text className='chat-draft__hint'>保存后可在「宝宝日记」中查看、编辑与配图</Text>
            <View className='chat-draft__actions'>
              <View className='chat-draft__btn chat-draft__btn--cancel' onClick={() => setDraftOpen(false)}>
                <Text>取消</Text>
              </View>
              <View className='chat-draft__btn chat-draft__btn--save' onClick={handleDraftSaveClick}>
                <Text>{draftSaving ? '保存中…' : '保存日记'}</Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}

      <ConfirmSheet
        open={overwriteConfirm}
        title='当天已有日记'
        desc='保存将覆盖当天已有日记，确定继续吗？'
        confirmText='覆盖保存'
        danger={false}
        onConfirm={() => {
          setOverwriteConfirm(false)
          void handleSaveDraft()
        }}
        onCancel={() => setOverwriteConfirm(false)}
      />
    </View>
  )
}
