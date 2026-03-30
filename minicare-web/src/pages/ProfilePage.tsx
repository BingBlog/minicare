/**
 * 我的页面
 * UI 严格对齐 minicare/ui-draft/profile.html
 *
 * 结构：
 *   - 页面标题「我的」
 *   - Profile Hero（宝宝头像 + 名字 + 过敏信息 + 编辑按钮）
 *   - Baby Mini Stats（4格：身高/体重/头围/稳定期）
 *   - 设置菜单组（家庭 / 关于）
 *   - 退出登录按钮
 *   - 编辑宝宝档案底部弹层（edit sheet）
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@/lib/store'
import { removeToken } from '@/lib/api'
import type { AllergyLevel } from '@/lib/api'

// ── 工具函数 ──────────────────────────────────────────────────────
function getBabyAge(birthDate: string): string {
  const birth = new Date(birthDate)
  const now = new Date()
  const months =
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth())
  const totalDays = Math.floor((now.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24))
  const days = totalDays % 30
  if (months < 1) return `${totalDays}天`
  if (months < 12) return `${months}个月 ${days}天`
  const years = Math.floor(months / 12)
  const remMonths = months % 12
  return `${years}岁${remMonths > 0 ? remMonths + '个月' : ''}`
}

const allergyLevelLabels: Record<AllergyLevel, string> = {
  mild: '轻度', moderate: '中度', severe: '重度', unknown: '未知程度',
}

const allergyTypeLabels: Record<string, string> = {
  milk: '牛奶蛋白', egg: '鸡蛋', wheat: '小麦/麸质', peanut: '花生',
  tree_nut: '坚果', soy: '大豆', fish: '鱼类', shellfish: '贝类', other: '其他',
}

// ── SVG 图标 ──────────────────────────────────────────────────────
const IconUsers = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
)
const IconUserPlus = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18, color: '#4CAF82' }}>
    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </svg>
)
const IconPhone = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18, color: '#F0B8C8' }}>
    <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
  </svg>
)
const IconHeart = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18, color: '#F87098' }}>
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>
)
const IconFileText = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18, color: '#9A8090' }}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
  </svg>
)
const IconChevronRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#C0A8AD" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, flexShrink: 0 }}>
    <polyline points="9 18 15 12 9 6"/>
  </svg>
)
const IconPencil = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
)
const IconLogOut = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#F05060" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
)

// ── 过敏程度选项 ──────────────────────────────────────────────────
const allergyLevelOptions: { value: AllergyLevel; label: string; activeColor: string }[] = [
  { value: 'mild',     label: '轻度', activeColor: '#4CAF82' },
  { value: 'moderate', label: '中度', activeColor: '#DDB870' },
  { value: 'severe',   label: '重度', activeColor: '#F05060' },
  { value: 'unknown',  label: '未知', activeColor: '#9A8090' },
]

// ── 设置菜单组 ────────────────────────────────────────────────────
const settingsGroups = [
  {
    title: '家庭',
    items: [
      {
        key: 'family',
        icon: <IconUsers />,
        iconBg: '#FFF0F4',
        label: '家庭成员管理',
        value: '',
        hasArrow: true,
      },
      {
        key: 'invite',
        icon: <IconUserPlus />,
        iconBg: '#DCFCE7',
        label: '邀请家庭成员',
        value: '',
        hasArrow: true,
      },
    ],
  },
  {
    title: '关于',
    items: [
      {
        key: 'version',
        icon: <IconPhone />,
        iconBg: '#FFF0F4',
        label: '版本号',
        value: 'v1.0.0（MVP）',
        hasArrow: false,
      },
      {
        key: 'about',
        icon: <IconHeart />,
        iconBg: '#FFF1F4',
        label: '关于敏宝日记',
        value: '',
        hasArrow: true,
      },
      {
        key: 'privacy',
        icon: <IconFileText />,
        iconBg: '#F5F5F5',
        label: '隐私政策',
        value: '',
        hasArrow: true,
      },
    ],
  },
]

export default function ProfilePage() {
  const navigate = useNavigate()
  const { user, currentBaby, logout } = useAppStore()

  // 编辑弹层状态
  const [editOpen, setEditOpen] = useState(false)
  const [editAllergyLevel, setEditAllergyLevel] = useState<AllergyLevel>(
    (currentBaby?.allergy_level as AllergyLevel) ?? 'unknown'
  )

  // Toast
  const [toast, setToast] = useState('')
  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2200)
  }

  const handleLogout = () => {
    if (window.confirm('确定要退出登录吗？')) {
      removeToken()
      logout()
      navigate('/login', { replace: true })
    }
  }

  const handleMenuClick = (key: string) => {
    if (key === 'family')  { showToast('家庭成员管理 — 功能开发中'); return }
    if (key === 'invite')  { showToast('邀请功能 — 功能开发中'); return }
    if (key === 'about')   { showToast('敏宝日记 · 专为敏感宝宝家庭打造'); return }
    if (key === 'privacy') { showToast('隐私政策与用户协议'); return }
  }

  return (
    <div className="min-h-full bg-bg">

      {/* ── 页面标题 ── */}
      <div className="px-5 pt-12 pb-0 bg-bg flex-shrink-0">
        <div className="text-[22px] font-extrabold text-[#4A3035] tracking-tight">我的</div>
      </div>

      <div className="overflow-y-auto pb-24">

        {/* ── Profile Hero ── */}
        <div
          className="flex items-center gap-4 px-5 py-4 cursor-pointer"
          onClick={() => setEditOpen(true)}
        >
          {/* 头像 */}
          <div
            className="flex items-center justify-center flex-shrink-0"
            style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'linear-gradient(135deg, #F9A8C0, #F87098)',
              boxShadow: '0 4px 14px rgba(248,112,152,.3)',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 42, height: 42 }}>
              <path d="M12 2a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4"/>
              <path d="M5 20a7 7 0 0 1 14 0"/>
              <circle cx="9" cy="10.5" r="1" fill="#fff"/>
              <circle cx="15" cy="10.5" r="1" fill="#fff"/>
            </svg>
          </div>

          {/* 宝宝信息 */}
          <div className="flex-1 min-w-0">
            <div className="text-[20px] font-extrabold text-[#4A3035] tracking-tight">
              {currentBaby?.name ?? (user?.nickname ?? '未设置昵称')}
            </div>
            {currentBaby && (
              <div className="text-[13px] text-[#9A8090] mt-0.5">
                {getBabyAge(currentBaby.birth_date)} · {currentBaby.gender === 'male' ? '男宝' : '女宝'}
                {' · '}
                {new Date(currentBaby.birth_date).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}出生
              </div>
            )}
            {currentBaby && (
              <div
                className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-lg text-[11px] font-bold"
                style={{ background: '#FFF0F4', color: '#F05060' }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 11, height: 11 }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                {currentBaby.allergy_types?.map(t => allergyTypeLabels[t] ?? t).join('、') || '牛奶蛋白'}过敏
                {currentBaby.allergy_level && ` · ${allergyLevelLabels[currentBaby.allergy_level as AllergyLevel]}`}
              </div>
            )}
          </div>

          {/* 编辑按钮 */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setEditOpen(true) }}
            className="flex items-center gap-1 px-3.5 py-2 rounded-full text-[13px] font-semibold border-none cursor-pointer flex-shrink-0"
            style={{ background: '#FFF0F4', color: '#F87098' }}
          >
            <IconPencil />
            编辑
          </button>
        </div>

        {/* ── Baby Mini Stats ── */}
        <div
          className="mx-4 rounded-2xl grid grid-cols-4 overflow-hidden"
          style={{ background: '#fff', boxShadow: '0 2px 10px rgba(200,100,120,0.08)', padding: 14 }}
        >
          {[
            { val: currentBaby ? '—' : '—', unit: 'cm', name: '身高' },
            { val: currentBaby ? '—' : '—', unit: 'kg', name: '体重' },
            { val: currentBaby ? '—' : '—', unit: 'cm', name: '头围' },
            { val: currentBaby ? '—' : '—', unit: '天', name: '稳定期' },
          ].map((stat, i) => (
            <div
              key={i}
              className="text-center"
              style={i < 3 ? { borderRight: '.5px solid #F5F0F2' } : {}}
            >
              <div className="text-[16px] font-extrabold text-[#4A3035] leading-none">
                {stat.val}
                <span className="text-[11px] font-medium text-[#9A8090]">{stat.unit}</span>
              </div>
              <div className="text-[10px] text-[#9A8090] mt-1">{stat.name}</div>
            </div>
          ))}
        </div>

        {/* ── 设置菜单组 ── */}
        {settingsGroups.map((group) => (
          <div key={group.title}>
            <div className="text-[12px] font-semibold text-[#9A8090] px-5 py-3.5 pb-1 tracking-[.5px]">
              {group.title}
            </div>
            <div
              className="mx-4 bg-white rounded-2xl overflow-hidden"
              style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.07)' }}
            >
              {group.items.map((item, i) => (
                <div
                  key={item.key}
                  className="flex items-center gap-3 px-4 py-3.5 cursor-pointer active:bg-gray-50 transition-colors"
                  style={i > 0 ? { borderTop: '.5px solid #F5F0F2' } : {}}
                  onClick={() => handleMenuClick(item.key)}
                >
                  {/* 图标 */}
                  <div
                    className="flex items-center justify-center rounded-xl flex-shrink-0"
                    style={{ width: 34, height: 34, background: item.iconBg }}
                  >
                    {item.icon}
                  </div>
                  {/* 标签 */}
                  <span className="flex-1 text-[14px] font-medium text-[#4A3035]">{item.label}</span>
                  {/* 值 */}
                  {item.value && (
                    <span className="text-[13px] text-[#9A8090] mr-1">{item.value}</span>
                  )}
                  {item.hasArrow && <IconChevronRight />}
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* ── 退出登录 ── */}
        <div className="mx-4 mt-4">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-[14px] font-semibold border-none cursor-pointer transition-all active:scale-[0.98]"
            style={{ background: '#FFF0F4', color: '#F05060' }}
          >
            <IconLogOut />
            退出登录
          </button>
        </div>

        <div className="h-8" />
      </div>

      {/* ══ 编辑宝宝档案 底部弹层 ══ */}
      {editOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setEditOpen(false) }}
        >
          <div
            className="w-full bg-white rounded-t-3xl overflow-hidden"
            style={{
              maxWidth: 430,
              margin: '0 auto',
              maxHeight: '90%',
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
              overflowY: 'auto',
            }}
          >
            {/* 把手 */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>
            <div className="text-center text-[17px] font-bold text-[#4A3035] py-3">编辑宝宝档案</div>

            {/* 基本信息 */}
            <div
              className="mx-4 bg-white rounded-2xl overflow-hidden mb-4"
              style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.07)' }}
            >
              <div className="flex items-center px-4 py-3.5" style={{ borderBottom: '1px solid #F5F0F2' }}>
                <span className="text-sm text-[#4A3035] flex-shrink-0">宝宝昵称</span>
                <input
                  type="text"
                  defaultValue={currentBaby?.name ?? ''}
                  placeholder="给宝宝起个名字"
                  className="flex-1 text-right border-none outline-none bg-transparent text-sm text-[#4A3035] placeholder:text-[#C0A8AD]"
                  maxLength={20}
                />
              </div>
              <div className="flex items-center px-4 py-3.5" style={{ borderBottom: '1px solid #F5F0F2' }}>
                <span className="text-sm text-[#4A3035] flex-shrink-0">出生日期</span>
                <input
                  type="date"
                  defaultValue={currentBaby?.birth_date ?? ''}
                  className="flex-1 text-right border-none outline-none bg-transparent text-sm text-[#4A3035]"
                />
                <span className="text-[#C0A8AD] ml-1 text-base">›</span>
              </div>
              <div className="flex items-center px-4 py-3.5">
                <span className="text-sm text-[#4A3035] flex-shrink-0">性别</span>
                <div className="flex-1 flex gap-2 justify-end">
                  {['male', 'female'].map((g) => (
                    <div
                      key={g}
                      className="cursor-pointer px-4 py-1 rounded-full text-sm font-medium border transition-all"
                      style={
                        (currentBaby?.gender ?? 'male') === g
                          ? { background: '#F87098', color: '#fff', borderColor: '#F87098' }
                          : { background: '#fff', color: '#9A8090', borderColor: '#E8E0E4' }
                      }
                    >
                      {g === 'male' ? '男' : '女'}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 过敏信息 */}
            <div className="text-[12px] font-semibold text-[#9A8090] px-5 pb-1.5 tracking-[.3px]">过敏信息</div>
            <div
              className="mx-4 bg-white rounded-2xl overflow-hidden mb-4"
              style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.07)' }}
            >
              <div className="flex items-center px-4 py-3.5">
                <span className="text-sm text-[#4A3035]">过敏类型</span>
                <span className="flex-1 text-right text-sm text-[#4A3035]">牛奶蛋白过敏</span>
                <span className="text-[#C0A8AD] ml-1 text-base">›</span>
              </div>
            </div>

            {/* 过敏程度 */}
            <div className="text-[12px] font-semibold text-[#9A8090] px-5 pb-1.5 tracking-[.3px]">过敏程度</div>
            <div
              className="mx-4 flex rounded-2xl overflow-hidden p-1 mb-3"
              style={{ background: '#F5F0F2' }}
            >
              {allergyLevelOptions.map(({ value, label, activeColor }) => (
                <div
                  key={value}
                  onClick={() => setEditAllergyLevel(value)}
                  className="flex-1 text-center py-2.5 rounded-xl cursor-pointer text-[13px] font-semibold transition-all"
                  style={
                    editAllergyLevel === value
                      ? { background: '#fff', color: activeColor, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }
                      : { color: '#9A8090' }
                  }
                >
                  {label}
                </div>
              ))}
            </div>

            {/* CDC 提示 */}
            <div
              className="mx-4 mb-4 px-3.5 py-3 rounded-xl"
              style={{ background: '#FFF0F4' }}
            >
              <div className="text-xs text-[#9A8090] leading-relaxed">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13, verticalAlign: -2, color: '#F87098', display: 'inline' }}>
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {' '}不确定过敏程度？{' '}
                <span
                  className="font-semibold cursor-pointer"
                  style={{ color: '#F87098' }}
                  onClick={() => showToast('跳转 CDC 评分标准页面')}
                >
                  [查看 CDC 评分标准]
                </span>
              </div>
            </div>

            {/* 最新生长数据 */}
            <div className="text-[12px] font-semibold text-[#9A8090] px-5 pb-1.5 tracking-[.3px]">最新生长数据</div>
            <div
              className="mx-4 bg-white rounded-2xl overflow-hidden mb-4"
              style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.07)' }}
            >
              {[
                { label: '身高', unit: 'cm', placeholder: '如：68.0', step: '0.1' },
                { label: '体重', unit: 'kg', placeholder: '如：7.5',  step: '0.1' },
                { label: '头围', unit: 'cm', placeholder: '如：43.0', step: '0.1' },
              ].map((f, i) => (
                <div
                  key={f.label}
                  className="flex items-center px-4 py-3.5"
                  style={i > 0 ? { borderTop: '1px solid #F5F0F2' } : {}}
                >
                  <span className="text-sm text-[#4A3035] flex-shrink-0 w-12">{f.label}</span>
                  <input
                    type="number"
                    placeholder={f.placeholder}
                    step={f.step}
                    className="flex-1 text-right border-none outline-none bg-transparent text-sm text-[#4A3035] placeholder:text-[#C0A8AD]"
                  />
                  <span className="text-[12px] text-[#9A8090] ml-1.5">{f.unit}</span>
                </div>
              ))}
            </div>

            <div className="h-4" />
            {/* 保存按钮 */}
            <div className="px-4">
              <button
                type="button"
                onClick={() => { setEditOpen(false); showToast('✓ 档案已保存，全局生效') }}
                className="w-full py-4 text-white font-bold text-base border-none cursor-pointer transition-all active:scale-[0.97]"
                style={{
                  borderRadius: 50,
                  background: 'linear-gradient(90deg, #F87098, #F9A8C0)',
                  boxShadow: '0 6px 20px rgba(248,112,152,0.4)',
                }}
              >
                保存档案
              </button>
            </div>
            <div className="px-4 mt-3">
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="w-full py-3.5 text-[#9A8090] font-semibold text-base border-none cursor-pointer transition-all active:scale-[0.97] rounded-2xl"
                style={{ background: '#F5F0F2' }}
              >
                取消
              </button>
            </div>
            <div className="h-6" />
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-[#4A3035] text-white text-sm px-5 py-2.5 rounded-full z-[60] whitespace-nowrap shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
