/**
 * MembersModal 家庭成员管理底部弹层
 *
 * 展示：
 *   - 标题行（家庭成员管理 + 邀请成员按钮）
 *   - 成员列表（含头像、名字、副标题、角色徽章）
 *   - 角色权限说明卡片
 *   - 邀请码区域（生成后显示：邀请码 + 复制按钮 + 有效期提示）
 *   - 关闭按钮
 *
 * 角色体系（role 字段）：
 *   1 = 创建者（owner）：可管理所有成员权限
 *   2 = 编辑者（editor）：可查看和新增记录
 *   3 = 查看者（viewer）：只能浏览，无法编辑
 *
 * 被引用：ProfilePage.tsx
 */
import type { FamilyMember } from '@/api'
import {
  ROLE_TEXT,
  ROLE_AVATAR_STYLE,
  ROLE_BADGE_STYLE,
  ROLE_ICON_COLOR,
} from '@/lib/constants'

// ── SVG 图标 ──────────────────────────────────────────────────────

/** 用户单人图标（头像区域，颜色从父组件注入） */
const IconUserSingle = ({ color = 'currentColor' }: { color?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 20, height: 20 }}
  >
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
)

/** 加号图标（邀请成员按钮，14×14） */
const IconPlus = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 14, height: 14 }}
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

/** 复制图标（邀请码操作按钮，15×15） */
const IconCopy = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 15, height: 15 }}
  >
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
)

/** 加载旋转图标（成员列表 loading 状态） */
const IconSpinner = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 18, height: 18, marginRight: 8, animation: 'spin 1s linear infinite' }}
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
)

// ── 工具函数 ──────────────────────────────────────────────────────

/**
 * 将时间戳格式化为"X天前 / X小时前 / 刚刚"
 * @param isoStr - ISO 格式时间字符串
 */
function timeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days >= 1) return `${days}天前`
  const hours = Math.floor(diff / 3600000)
  if (hours >= 1) return `${hours}小时前`
  return '刚刚'
}

// ── 类型定义 ──────────────────────────────────────────────────────

/** MembersModal 属性 */
interface MembersModalProps {
  /** 是否显示弹层 */
  open: boolean
  /** 家庭成员列表（由父组件通过 API 获取） */
  members: FamilyMember[]
  /** 是否正在加载成员列表 */
  loading: boolean
  /** 当前已生成的邀请码（空字符串表示尚未生成） */
  inviteCode: string
  /** 是否正在生成邀请码 */
  inviteLoading: boolean
  /** 点击「邀请成员」回调 */
  onInvite: () => void
  /** 复制邀请码回调 */
  onCopyCode: () => void
  /** 点击某成员条目（如查看/编辑权限等后续扩展） */
  onMemberClick: (member: FamilyMember) => void
  /** 关闭弹层回调 */
  onClose: () => void
}

/**
 * 家庭成员管理底部弹层
 *
 * @example
 * <MembersModal
 *   open={membersOpen}
 *   members={members}
 *   loading={membersLoading}
 *   inviteCode={inviteCode}
 *   inviteLoading={inviteLoading}
 *   onInvite={handleInvite}
 *   onCopyCode={copyInviteCode}
 *   onMemberClick={(m) => showToast(`${m.name} · ${ROLE_TEXT[m.role ?? 2]}`)}
 *   onClose={closeMembers}
 * />
 */
export default function MembersModal({
  open,
  members,
  loading,
  inviteCode,
  inviteLoading,
  onInvite,
  onCopyCode,
  onMemberClick,
  onClose,
}: MembersModalProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      // 点击蒙层关闭
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full bg-white rounded-t-3xl"
        style={{
          maxWidth: 430,
          margin: '0 auto',
          maxHeight: '92%',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
          overflowY: 'auto',
        }}
      >
        {/* 把手 */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* ── 标题行 ── */}
        <div className="flex items-center justify-between px-5 py-3">
          <div className="text-[17px] font-bold text-[#4A3035]">家庭成员管理</div>
          <button
            type="button"
            onClick={onInvite}
            disabled={inviteLoading}
            className="flex items-center gap-1 border-none bg-transparent cursor-pointer text-[13px] font-semibold"
            style={{ color: '#F87098' }}
          >
            <IconPlus />
            邀请成员
          </button>
        </div>

        {/* ── 成员列表区 ── */}
        <div className="text-[12px] font-semibold text-[#9A8090] px-5 pb-1.5">
          当前成员{members.length > 0 ? `（${members.length}人）` : ''}
        </div>
        <div
          className="mx-4 bg-white rounded-2xl overflow-hidden mb-3"
          style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.07)' }}
        >
          {loading ? (
            /* 加载状态 */
            <div className="flex items-center justify-center py-8 text-[#9A8090] text-sm">
              <IconSpinner />
              加载中…
            </div>
          ) : members.length === 0 ? (
            /* 空状态 */
            <div className="flex items-center justify-center py-8 text-[#9A8090] text-sm">
              暂无成员数据
            </div>
          ) : (
            /* 成员列表 */
            members.map((member, i) => {
              /** 角色 ID，回落为 2（编辑者）*/
              const role = member.role ?? 2
              const name = member.name ?? '未知用户'

              /**
               * 副标题逻辑：
               * - is_self = true  → "138xxx · 本账号"（当前用户自己）
               * - 有 joined_at    → "138xxx · 已加入 X天前"
               * - 否则            → 仅显示手机号
               */
              const sub = member.is_self
                ? `${member.phone ? member.phone + ' · ' : ''}本账号`
                : member.joined_at
                  ? `${member.phone ? member.phone + ' · ' : ''}已加入 ${timeAgo(member.joined_at)}`
                  : (member.phone ?? '')

              return (
                <div
                  key={member.id}
                  className="flex items-center gap-3.5 px-5 py-3.5 cursor-pointer active:bg-[#FAF5F6] transition-colors"
                  style={i > 0 ? { borderTop: '.5px solid #F5F0F2' } : {}}
                  onClick={() => onMemberClick(member)}
                >
                  {/* 头像（颜色区分角色权限层级）*/}
                  <div
                    className="flex items-center justify-center rounded-full flex-shrink-0"
                    style={{ width: 44, height: 44, ...ROLE_AVATAR_STYLE[role] }}
                  >
                    <IconUserSingle color={ROLE_ICON_COLOR[role]} />
                  </div>

                  {/* 名字 + 副标题 */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-bold text-[#4A3035] truncate">{name}</div>
                    {sub && (
                      <div className="text-[12px] text-[#9A8090] mt-0.5 truncate">{sub}</div>
                    )}
                  </div>

                  {/* 角色徽章：不同角色背景色不同 */}
                  <div
                    className="px-2.5 py-0.5 rounded-full text-[11px] font-bold flex-shrink-0"
                    style={ROLE_BADGE_STYLE[role]}
                  >
                    {ROLE_TEXT[role] ?? '成员'}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* ── 权限说明卡片 ── */}
        <div
          className="mx-4 mb-3 px-4 py-3.5 rounded-xl text-[12px] leading-relaxed"
          style={{ background: '#FFF0F4', color: '#9A8090' }}
        >
          <span style={{ color: '#F87098', fontWeight: 700 }}>角色说明：</span>
          创建者可管理所有成员权限；
          <span style={{ color: '#4A90D9', fontWeight: 600 }}>编辑者</span>
          可查看和新增记录；
          <span style={{ color: '#9A8090', fontWeight: 600 }}>查看者</span>
          只能浏览记录，无法编辑。
        </div>

        {/* ── 邀请码区域（生成后显示）── */}
        {inviteCode && (
          <>
            <div className="text-[12px] font-semibold text-[#9A8090] px-5 pb-1.5">邀请码</div>
            <div className="mx-4 mb-4">
              <div
                className="flex items-center justify-between px-4 py-3.5 rounded-2xl"
                style={{ background: '#FFF0F4', border: '1px solid #F8B8CC' }}
              >
                <div>
                  <div className="text-[12px] text-[#9A8090] mb-0.5">
                    邀请码（24小时内有效）
                  </div>
                  {/* 邀请码字符间距 4px，增大可读性 */}
                  <div
                    className="text-[20px] font-extrabold text-[#F87098]"
                    style={{ letterSpacing: '4px' }}
                  >
                    {inviteCode}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onCopyCode}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl border-none cursor-pointer text-[12px] font-semibold"
                  style={{ background: '#F87098', color: '#fff' }}
                >
                  <IconCopy />
                  复制
                </button>
              </div>
              {/* 使用说明文字 */}
              <div className="text-[11px] text-[#C0A8AD] mt-2 px-1">
                将邀请码分享给家人，对方可在「加入家庭」页面输入邀请码加入
              </div>
            </div>
          </>
        )}

        {/* ── 关闭按钮 ── */}
        <div className="px-4 mt-1 mb-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3.5 text-[#9A8090] font-semibold text-sm border-none cursor-pointer transition-all active:scale-[0.97] rounded-2xl"
            style={{ background: '#F5F0F2' }}
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
