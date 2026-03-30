/**
 * 新用户引导页 — 创建家庭 + 添加宝宝
 *
 * 流程（3 步，对齐 ui-draft/onboarding.html）：
 *   Step 0：引导介绍页（产品特性 + 「开始创建宝宝档案」按钮）
 *   Step 1：档案创建表单（姓名/出生日期/性别/过敏类型/过敏程度）
 *   Step 2：创建成功页（动画圆圈 + 宝宝信息卡片 + 进入首页）
 *
 * 必填：家庭名称、宝宝姓名、出生日期、性别、过敏类型（至少 1 项）
 * 可选：过敏程度、出生体重、出生身高
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { familyApi, babyApi } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import type { AllergyType, AllergyLevel } from '@/lib/api'

// ── 配置表 ────────────────────────────────────────────────────────
const allergyTypeOptions: { value: AllergyType; label: string }[] = [
  { value: 'milk',      label: '牛奶蛋白' },
  { value: 'egg',       label: '鸡蛋'     },
  { value: 'wheat',     label: '小麦/麸质' },
  { value: 'peanut',    label: '花生'     },
  { value: 'tree_nut',  label: '坚果'     },
  { value: 'soy',       label: '大豆'     },
  { value: 'fish',      label: '鱼类'     },
  { value: 'shellfish', label: '贝类'     },
  { value: 'other',     label: '其他'     },
]

type AllergyLevelKey = AllergyLevel | ''
const allergyLevelOptions: { value: AllergyLevel; label: string; color: string; activeColor: string }[] = [
  { value: 'mild',     label: '轻度', color: '',       activeColor: '#4CAF82' },
  { value: 'moderate', label: '中度', color: '',       activeColor: '#DDB870' },
  { value: 'severe',   label: '重度', color: '',       activeColor: '#F05060' },
  { value: 'unknown',  label: '未知', color: '',       activeColor: '#9A8090' },
]

const severityLabels: Record<AllergyLevel, string> = {
  mild: '轻度', moderate: '中度', severe: '重度', unknown: '未知程度',
}
const allergyTypeLabels: Record<string, string> = {
  milk: '牛奶蛋白', egg: '鸡蛋', wheat: '小麦/麸质', peanut: '花生',
  tree_nut: '坚果', soy: '大豆', fish: '鱼类', shellfish: '贝类', other: '其他',
}

type Step = 0 | 1 | 2

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { setCurrentFamily, setCurrentBaby } = useAppStore()

  const [step, setStep] = useState<Step>(0)

  // 家庭信息（Step 1 隐藏，自动生成）
  const [familyName] = useState('我们的家')

  // 宝宝基础信息
  const [babyName, setBabyName]   = useState('')
  const [gender, setGender]       = useState<'male' | 'female'>('male')
  const [birthDate, setBirthDate] = useState('')

  // 过敏信息
  const [allergyLevel, setAllergyLevel] = useState<AllergyLevelKey>('unknown')

  // 可选字段
  const [showOptional, setShowOptional] = useState(false)
  const [birthWeightG, setBirthWeightG]   = useState('')
  const [birthHeightCm, setBirthHeightCm] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  // ── Toast ─────────────────────────────────────────────────────────
  const [toast, setToast] = useState('')
  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2200)
  }

  // ── 保存档案 ──────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!babyName.trim()) { showToast('请输入宝宝昵称'); return }
    if (!birthDate)       { showToast('请选择出生日期'); return }

    setLoading(true)
    setError('')
    try {
      const family = await familyApi.create(familyName)
      setCurrentFamily(family)

      const baby = await babyApi.create(family.id, {
        name:            babyName.trim(),
        gender,
        birth_date:      birthDate,
        allergy_types:   ['milk'],
        allergy_level:   allergyLevel || undefined,
        birth_weight_g:  birthWeightG  ? Number(birthWeightG)  : undefined,
        birth_height_cm: birthHeightCm ? Number(birthHeightCm) : undefined,
      })
      setCurrentBaby(baby)

      setStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  // ── 计算月龄 ──────────────────────────────────────────────────────
  const getAge = () => {
    if (!birthDate) return ''
    const birth = new Date(birthDate)
    const now   = new Date()
    const months =
      (now.getFullYear() - birth.getFullYear()) * 12 +
      (now.getMonth() - birth.getMonth())
    return months > 0 ? `${months}个月` : ''
  }

  // ── Step 0：引导页 ────────────────────────────────────────────────
  if (step === 0) {
    return (
      <div
        className="min-h-screen flex flex-col pb-8"
        style={{ background: 'linear-gradient(170deg, #FFF0F4 0%, #fff 50%)' }}
      >
        {/* 核心介绍区 */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 py-6">
          {/* Logo 圆圈 */}
          <div
            className="flex items-center justify-center mb-6"
            style={{
              width: 90, height: 90, borderRadius: '50%',
              background: 'linear-gradient(135deg, #F9A8C0, #F87098)',
              boxShadow: '0 12px 32px rgba(248,112,152,.35)',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 46, height: 46 }}>
              <path d="M12 2a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4"/>
              <path d="M5 20a7 7 0 0 1 14 0"/>
              <circle cx="9" cy="10.5" r="1" fill="#fff"/>
              <circle cx="15" cy="10.5" r="1" fill="#fff"/>
            </svg>
          </div>

          <div className="text-[26px] font-black text-[#4A3035] tracking-tight mb-1.5 text-center">敏宝日记</div>
          <div className="text-sm text-[#9A8090] text-center mb-7">专为牛奶蛋白过敏宝宝家庭设计</div>

          {/* 功能卡片列表 */}
          <div className="w-full flex flex-col gap-3">
            {[
              {
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22, color: '#F87098' }}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                ),
                iconBg: 'var(--color-primary-lt, #FFF0F4)',
                title: '结构化记录',
                desc:  '饮食·睡眠·活动·尿布·生长·健康，一键记录不遗漏',
              },
              {
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22, color: '#DDB870' }}>
                    <line x1="18" y1="20" x2="18" y2="10"/>
                    <line x1="12" y1="20" x2="12" y2="4"/>
                    <line x1="6" y1="20" x2="6" y2="14"/>
                  </svg>
                ),
                iconBg: '#FFF8E6',
                title: '一键生成报告',
                desc:  '综合数据自动汇总，PDF 格式一键分享给医生',
              },
              {
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22, color: '#4CAF82' }}>
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                    <polyline points="9 22 9 12 15 12 15 22"/>
                  </svg>
                ),
                iconBg: '#DCFCE7',
                title: '就医沟通更顺畅',
                desc:  '完整数据记录，门诊时不再遗忘关键信息',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="flex items-center gap-3.5 rounded-2xl px-4 py-3.5"
                style={{ background: '#fff', boxShadow: '0 1px 6px rgba(200,100,120,0.08)' }}
              >
                <div
                  className="flex items-center justify-center rounded-xl flex-shrink-0"
                  style={{ width: 40, height: 40, background: item.iconBg }}
                >
                  {item.icon}
                </div>
                <div>
                  <div className="text-sm font-bold text-[#4A3035]">{item.title}</div>
                  <div className="text-xs text-[#9A8090] mt-0.5">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 底部按钮区 */}
        <div className="px-6">
          <button
            onClick={() => setStep(1)}
            className="w-full py-4 text-white font-bold text-base border-none cursor-pointer transition-all active:scale-[0.97]"
            style={{
              borderRadius: 50,
              background: 'linear-gradient(90deg, #F87098, #F9A8C0)',
              boxShadow: '0 6px 20px rgba(248,112,152,0.4)',
            }}
          >
            开始创建宝宝档案
          </button>
          <div className="text-center mt-3.5 text-xs text-[#9A8090]">
            已有档案？{' '}
            <span
              className="text-[#F87098] font-semibold cursor-pointer"
              onClick={() => navigate('/', { replace: true })}
            >
              直接进入首页
            </span>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-[#4A3035] text-white text-sm px-5 py-2.5 rounded-full z-50 whitespace-nowrap shadow-lg">
            {toast}
          </div>
        )}
      </div>
    )
  }

  // ── Step 2：创建成功 ──────────────────────────────────────────────
  if (step === 2) {
    const genderText = gender === 'male' ? '男宝宝' : '女宝宝'
    const ageText    = getAge()
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-8 py-10"
        style={{ background: 'linear-gradient(170deg, #FFF0F4 0%, #fff 60%)' }}
      >
        {/* 成功动画圆圈 */}
        <div
          className="flex items-center justify-center mb-6"
          style={{
            width: 80, height: 80, borderRadius: '50%',
            background: 'linear-gradient(135deg, #F9A8C0, #F87098)',
            boxShadow: '0 10px 28px rgba(248,112,152,.4)',
            animation: 'ob-scale-in .5s cubic-bezier(.175,.885,.32,1.275) both',
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 40, height: 40 }}>
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>

        <div className="text-[22px] font-black text-[#4A3035] mb-2 text-center">宝宝档案已创建！</div>
        <div className="text-sm text-[#9A8090] text-center leading-relaxed mb-8">
          开始用敏宝日记记录宝宝的<br/>每一天，就医时不再烦恼
        </div>

        {/* 宝宝信息卡片 */}
        <div
          className="w-full flex items-center gap-3.5 rounded-2xl px-5 py-4 mb-7"
          style={{ background: '#fff', boxShadow: '0 4px 20px rgba(200,100,120,0.12)' }}
        >
          <div
            className="flex items-center justify-center rounded-full flex-shrink-0"
            style={{
              width: 52, height: 52,
              background: 'linear-gradient(135deg, #F9A8C0, #F87098)',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 28, height: 28 }}>
              <path d="M12 2a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4"/>
              <path d="M5 20a7 7 0 0 1 14 0"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-lg font-extrabold text-[#4A3035]">{babyName || '小宝'}</div>
            <div className="text-xs text-[#9A8090] mt-0.5">
              {genderText}{ageText ? ` · ${ageText}` : ''}
            </div>
            <div
              className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-lg text-[11px] font-bold"
              style={{ background: '#FFF0F4', color: '#F05060' }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 11, height: 11 }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              牛奶蛋白过敏 · {allergyLevel ? severityLabels[allergyLevel as AllergyLevel] : '未知程度'}
            </div>
          </div>
        </div>

        <button
          onClick={() => navigate('/', { replace: true })}
          className="w-full py-4 text-white font-bold text-base border-none cursor-pointer transition-all active:scale-[0.97]"
          style={{
            borderRadius: 50,
            background: 'linear-gradient(90deg, #F87098, #F9A8C0)',
            boxShadow: '0 6px 20px rgba(248,112,152,0.4)',
          }}
        >
          进入首页，开始记录
        </button>

        <style>{`
          @keyframes ob-scale-in {
            from { transform: scale(0.3); opacity: 0; }
            to   { transform: scale(1);   opacity: 1; }
          }
        `}</style>
      </div>
    )
  }

  // ── Step 1：档案创建表单 ──────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col overflow-hidden bg-bg">
      {/* 顶部导航 */}
      <div className="flex items-center px-4 py-3 flex-shrink-0 bg-white">
        <button
          onClick={() => setStep(0)}
          className="w-9 h-9 rounded-full bg-gray-100 border-none flex items-center justify-center cursor-pointer text-[18px] text-[#4A3035] flex-shrink-0"
        >
          ←
        </button>
        <div className="flex-1 text-center text-[17px] font-bold text-[#4A3035]">创建宝宝档案</div>
        <div className="w-9" />
      </div>

      {/* 步骤进度点 */}
      <div className="flex items-center justify-center gap-1.5 py-3 bg-white">
        {/* dot0：已完成 */}
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#F87098', opacity: 0.4 }} />
        {/* dot1：当前（宽条） */}
        <div style={{ width: 18, height: 6, borderRadius: 4, background: '#F87098' }} />
        {/* dot2：待完成 */}
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#E8E0E4' }} />
      </div>

      {/* 表单滚动区 */}
      <div className="flex-1 overflow-y-auto pb-24">

        {/* 基本信息 */}
        <div
          className="text-xs font-bold text-[#9A8090] px-5 pt-4 pb-1.5"
          style={{ letterSpacing: '.3px' }}
        >
          基本信息
        </div>
        <div className="mx-4 bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.07)' }}>
          {/* 宝宝昵称 */}
          <div className="flex items-center px-4 py-3.5" style={{ borderBottom: '1px solid #F5F0F2' }}>
            <span className="text-sm text-[#4A3035]">
              宝宝昵称 <span className="text-red-400">*</span>
            </span>
            <input
              type="text"
              placeholder="给宝宝起个名字"
              value={babyName}
              onChange={(e) => setBabyName(e.target.value)}
              className="flex-1 text-right border-none outline-none bg-transparent text-sm text-[#4A3035] placeholder:text-[#C0A8AD]"
              maxLength={20}
            />
          </div>
          {/* 出生日期 */}
          <div className="flex items-center px-4 py-3.5" style={{ borderBottom: '1px solid #F5F0F2' }}>
            <span className="text-sm text-[#4A3035]">
              出生日期 <span className="text-red-400">*</span>
            </span>
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              className="flex-1 text-right border-none outline-none bg-transparent text-sm text-[#4A3035]"
            />
            <span className="text-[#C0A8AD] ml-1 text-base">›</span>
          </div>
          {/* 性别 */}
          <div className="flex items-center px-4 py-3.5">
            <span className="text-sm text-[#4A3035]">
              性别 <span className="text-red-400">*</span>
            </span>
            <div className="flex-1 flex gap-2 justify-end">
              <div
                onClick={() => setGender('male')}
                className="cursor-pointer px-4 py-1 rounded-full text-sm font-medium transition-all border"
                style={
                  gender === 'male'
                    ? { background: '#F87098', color: '#fff', borderColor: '#F87098' }
                    : { background: '#fff', color: '#9A8090', borderColor: '#E8E0E4' }
                }
              >
                男
              </div>
              <div
                onClick={() => setGender('female')}
                className="cursor-pointer px-4 py-1 rounded-full text-sm font-medium transition-all border"
                style={
                  gender === 'female'
                    ? { background: '#F87098', color: '#fff', borderColor: '#F87098' }
                    : { background: '#fff', color: '#9A8090', borderColor: '#E8E0E4' }
                }
              >
                女
              </div>
            </div>
          </div>
        </div>

        {/* 过敏信息（固定牛奶蛋白） */}
        <div className="text-xs font-bold text-[#9A8090] px-5 pt-4 pb-1.5" style={{ letterSpacing: '.3px' }}>
          过敏信息
        </div>
        <div className="mx-4 bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.07)' }}>
          <div className="flex items-center px-4 py-3.5">
            <span className="text-sm text-[#4A3035]">
              过敏类型 <span className="text-red-400">*</span>
            </span>
            <span className="flex-1 text-right text-sm text-[#4A3035]">牛奶蛋白过敏</span>
            <span className="text-[#C0A8AD] ml-1 text-base">›</span>
          </div>
        </div>

        {/* 过敏程度 Slider */}
        <div className="text-xs font-bold text-[#9A8090] px-5 pt-4 pb-1.5" style={{ letterSpacing: '.3px' }}>
          过敏程度
        </div>
        <div
          className="mx-4 flex rounded-2xl overflow-hidden p-1"
          style={{ background: '#F5F0F2' }}
        >
          {allergyLevelOptions.map(({ value, label, activeColor }) => (
            <div
              key={value}
              onClick={() => setAllergyLevel(value)}
              className="flex-1 text-center py-2.5 rounded-xl cursor-pointer text-[13px] font-semibold transition-all"
              style={
                allergyLevel === value
                  ? { background: '#fff', color: activeColor, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }
                  : { color: '#9A8090' }
              }
            >
              {label}
            </div>
          ))}
        </div>

        {/* CDC 提示（始终显示，与 ui-draft 一致） */}
        <div
          className="mx-4 mt-2 mb-4 px-3.5 py-3 rounded-xl"
          style={{ background: 'var(--color-primary-lt, #FFF0F4)' }}
        >
          <div className="text-xs text-[#9A8090] leading-relaxed">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13, verticalAlign: -2, color: '#F87098', display: 'inline' }}>
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {' '}不确定过敏程度？{' '}
            <a
              href="https://www.cdc.gov/niosh/topics/emres/allergen.html"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold"
              style={{ color: '#F87098' }}
            >
              [查看 CDC 评分标准]
            </a>
            {' '}— 可先选「未知」，就诊后再更新。
          </div>
        </div>

        {/* 提示说明 */}
        <div
          className="mx-4 mb-5 px-3.5 py-3 rounded-xl border"
          style={{ background: '#FAFAFA', borderColor: '#F0E8EA' }}
        >
          <div className="text-[11px] text-[#9A8090] leading-relaxed">
            身高、体重等生长数据可在档案创建后，通过「生长记录」模块随时补充。
          </div>
        </div>

        {/* 可选字段展开 */}
        <div className="mx-4 mb-4">
          <button
            type="button"
            onClick={() => setShowOptional((v) => !v)}
            className="flex items-center gap-1 text-sm font-medium border-none bg-transparent cursor-pointer"
            style={{ color: '#F87098' }}
          >
            <svg viewBox="0 0 24 24" className={`w-4 h-4 transition-transform ${showOptional ? 'rotate-180' : ''}`} fill="#F87098">
              <path d="M7 10l5 5 5-5z" />
            </svg>
            {showOptional ? '收起' : '填写出生体重 & 身高（可选）'}
          </button>

          {showOptional && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#9A8090] mb-1">出生体重（克）</label>
                <input
                  type="number"
                  placeholder="如：3200"
                  value={birthWeightG}
                  onChange={(e) => setBirthWeightG(e.target.value)}
                  min={500} max={7000}
                  className="w-full h-11 px-3 rounded-xl border text-sm text-[#4A3035] placeholder:text-[#C0A8AD] outline-none focus:border-[#F87098] bg-white transition-colors"
                  style={{ borderColor: '#E8E0E4' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#9A8090] mb-1">出生身高（厘米）</label>
                <input
                  type="number"
                  placeholder="如：50"
                  value={birthHeightCm}
                  onChange={(e) => setBirthHeightCm(e.target.value)}
                  min={30} max={80}
                  className="w-full h-11 px-3 rounded-xl border text-sm text-[#4A3035] placeholder:text-[#C0A8AD] outline-none focus:border-[#F87098] bg-white transition-colors"
                  style={{ borderColor: '#E8E0E4' }}
                />
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mx-4 mb-4 text-sm text-red-500 bg-red-50 px-4 py-2.5 rounded-xl">{error}</div>
        )}
      </div>

      {/* 底部保存按钮 */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] px-4 pb-6 pt-3 bg-bg">
        <button
          onClick={handleCreate}
          disabled={loading}
          className="w-full py-4 text-white font-bold text-base border-none cursor-pointer transition-all active:scale-[0.97] disabled:opacity-60"
          style={{
            borderRadius: 50,
            background: 'linear-gradient(90deg, #F87098, #F9A8C0)',
            boxShadow: '0 6px 20px rgba(248,112,152,0.4)',
          }}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              创建中...
            </span>
          ) : '保存档案'}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 bg-[#4A3035] text-white text-sm px-5 py-2.5 rounded-full z-50 whitespace-nowrap shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
