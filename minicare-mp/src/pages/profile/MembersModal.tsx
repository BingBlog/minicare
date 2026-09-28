import { View, Text, Input, Image } from '@tarojs/components'
import { useState } from 'react'
import type { FamilyMember } from '@/api'
import { timeAgo } from '@/lib/utils'
import {
  ROLE_TEXT,
  ROLE_AVATAR_BG,
  ROLE_AVATAR_SHADOW,
  ROLE_BADGE_BG,
  ROLE_BADGE_COLOR,
  ROLE_ICON_COLOR,
} from '@/lib/constants'

function maskPhone(phone: string): string {
  if (!phone || phone.length < 7) return phone
  return phone.slice(0, 3) + '****' + phone.slice(-4)
}

function isValidPhone(phone: string): boolean {
  return /^1[3-9]\d{9}$/.test(phone)
}

// ── 小程序兼容的 SVG data URI 图标（使用 encodeURIComponent，无需 btoa）───

function svgDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/** 生成用户头像图标的 data URI */
function userIconSrc(color: string): string {
  return svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  )
}

const ICON_PLUS = svgDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%23F87098" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
)

const ICON_X = svgDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%23F05060" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
)

const ICON_SPINNER = svgDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%239A8090" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>',
)

const ICON_ALERT = svgDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%23F05060" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
)

interface MembersModalProps {
  open: boolean
  members: FamilyMember[]
  loading: boolean
  isOwner: boolean
  onInviteByPhone: (phone: string) => Promise<void>
  onRemoveMember: (memberId: string) => Promise<void>
  onDeleteFamily?: () => void
  onClose: () => void
}

interface ConfirmState {
  open: boolean
  memberId: string
  memberName: string
  isPending: boolean
}

const CONFIRM_INIT: ConfirmState = {
  open: false,
  memberId: '',
  memberName: '',
  isPending: false,
}

export default function MembersModal({
  open,
  members,
  loading,
  isOwner,
  onInviteByPhone,
  onRemoveMember,
  onDeleteFamily,
  onClose,
}: MembersModalProps) {
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [invitePhone, setInvitePhone] = useState('')
  const [inviteSubmitting, setInviteSubmitting] = useState(false)
  const [inviteError, setInviteError] = useState('')

  const [confirm, setConfirm] = useState<ConfirmState>(CONFIRM_INIT)
  const [confirmLoading, setConfirmLoading] = useState(false)

  const activeMembers = members.filter(
    (m) => m.status === 'active' || m.status === undefined,
  )
  const pendingMembers = members.filter((m) => m.status === 'pending')

  const handleClose = () => {
    setShowInviteForm(false)
    setInvitePhone('')
    setInviteError('')
    onClose()
  }

  const handleInviteSubmit = async () => {
    if (!isValidPhone(invitePhone)) {
      setInviteError('请输入正确的 11 位手机号')
      return
    }
    setInviteSubmitting(true)
    setInviteError('')
    try {
      await onInviteByPhone(invitePhone)
      setInvitePhone('')
      setShowInviteForm(false)
    } catch (e: unknown) {
      setInviteError(e instanceof Error ? e.message : '邀请失败，请重试')
    } finally {
      setInviteSubmitting(false)
    }
  }

  const openConfirm = (member: FamilyMember, isPending: boolean) => {
    const name = isPending
      ? member.invite_phone
        ? maskPhone(member.invite_phone)
        : member.phone
          ? maskPhone(member.phone)
          : '该联系人'
      : (member.name ?? '该成员')

    setConfirm({
      open: true,
      memberId: member.id,
      memberName: name,
      isPending,
    })
  }

  const handleConfirm = async () => {
    setConfirmLoading(true)
    try {
      await onRemoveMember(confirm.memberId)
    } catch {
      // 错误由父组件处理
    } finally {
      setConfirmLoading(false)
      setConfirm(CONFIRM_INIT)
    }
  }

  if (!open) return null

  return (
    <>
      {/* 主弹层 */}
      <View className='members-overlay' onClick={handleClose}>
        <View
          className='members-sheet'
          onClick={(e) => { e.stopPropagation() }}
        >
          {/* 把手 */}
          <View className='members-handle'>
            <View className='members-handle__bar' />
          </View>

          {/* 标题行 */}
          <View className='members-header'>
            <Text className='members-header__title'>家庭成员管理</Text>
            {isOwner && (
              <View
                className='members-header__invite'
                onClick={() => {
                  setShowInviteForm((v) => !v)
                  setInviteError('')
                  setInvitePhone('')
                }}
              >
                <Image src={ICON_PLUS} style={{ width: 14, height: 14 }} />
                <Text>邀请成员</Text>
              </View>
            )}
          </View>

          {/* 手机号输入表单 */}
          {isOwner && showInviteForm && (
            <View className='members-invite-form'>
              <Text className='members-invite-form__label'>输入对方手机号</Text>
              <View className='members-invite-form__row'>
                <Input
                  type='number'
                  maxlength={11}
                  placeholder='请输入 11 位手机号'
                  value={invitePhone}
                  onInput={(e) => {
                    setInvitePhone(
                      e.detail.value.replace(/\D/g, '').slice(0, 11),
                    )
                    setInviteError('')
                  }}
                  className='members-invite-form__input'
                />
                <View
                  className={`members-invite-form__send${invitePhone.length === 11 && !inviteSubmitting ? ' members-invite-form__send--ready' : ''}`}
                  onClick={invitePhone.length === 11 && !inviteSubmitting ? handleInviteSubmit : undefined}
                >
                  {inviteSubmitting ? (
                    <Image src={ICON_SPINNER} className='members-icon-spin' style={{ width: 18, height: 18 }} />
                  ) : '发送'}
                </View>
              </View>
              {inviteError && (
                <Text className='members-invite-form__error'>{inviteError}</Text>
              )}
              <Text className='members-invite-form__hint'>
                对方登录后将自动加入家庭，无需任何操作
              </Text>
            </View>
          )}

          {/* 当前成员列表 */}
          <Text className='members-section-label'>
            当前成员
            {activeMembers.length > 0 ? `（${activeMembers.length}人）` : ''}
          </Text>
          <View className='members-card'>
            {loading ? (
              <View className='members-loading'>
                <Image src={ICON_SPINNER} className='members-icon-spin' style={{ width: 18, height: 18 }} />
                <Text>加载中...</Text>
              </View>
            ) : activeMembers.length === 0 ? (
              <View className='members-loading'>
                <Text>暂无成员数据</Text>
              </View>
            ) : (
              activeMembers.map((member, i) => {
                const role = member.role ?? 'member'
                const name = member.name ?? '未知用户'
                const sub = member.is_self
                  ? `${member.phone ? member.phone + ' · ' : ''}本账号`
                  : member.joined_at
                    ? `${member.phone ? member.phone + ' · ' : ''}已加入 ${timeAgo(member.joined_at)}`
                    : (member.phone ?? '')

                const canRemove = isOwner && role !== 'owner' && !member.is_self

                return (
                  <View
                    key={member.id}
                    className={`members-row${i > 0 ? ' members-row--bordered' : ''}`}
                  >
                    {/* 头像 */}
                    <View
                      className='members-row__avatar'
                      style={{
                        background: ROLE_AVATAR_BG[role],
                        ...(ROLE_AVATAR_SHADOW[role] ? { boxShadow: ROLE_AVATAR_SHADOW[role] } : {}),
                      }}
                    >
                      <Image src={userIconSrc(ROLE_ICON_COLOR[role])} style={{ width: 20, height: 20 }} />
                    </View>

                    {/* 名字 + 副标题 */}
                    <View className='members-row__info'>
                      <Text className='members-row__name'>{name}</Text>
                      {sub && (
                        <Text className='members-row__sub'>{sub}</Text>
                      )}
                    </View>

                    {/* 角色徽章 */}
                    <View
                      className='members-row__badge'
                      style={{
                        background: ROLE_BADGE_BG[role],
                        color: ROLE_BADGE_COLOR[role],
                      }}
                    >
                      {ROLE_TEXT[role] ?? '成员'}
                    </View>

                    {/* 移除按钮 */}
                    {canRemove && (
                      <View
                        className='members-row__remove'
                        onClick={() => openConfirm(member, false)}
                      >
                        <Image src={ICON_X} style={{ width: 13, height: 13 }} />
                      </View>
                    )}
                  </View>
                )
              })
            )}
          </View>

          {/* 待接受列表 */}
          {pendingMembers.length > 0 && (
            <>
              <Text className='members-section-label'>
                待接受（{pendingMembers.length}人）
              </Text>
              <View className='members-card'>
                {pendingMembers.map((member, i) => {
                  const displayPhone = member.invite_phone
                    ? maskPhone(member.invite_phone)
                    : member.phone
                      ? maskPhone(member.phone)
                      : '未知号码'

                  return (
                    <View
                      key={member.id}
                      className={`members-row${i > 0 ? ' members-row--bordered' : ''}`}
                    >
                      <View className='members-row__avatar' style={{ background: '#F5F0F2' }}>
                        <Image src={userIconSrc('#C0A8AD')} style={{ width: 20, height: 20 }} />
                      </View>
                      <View className='members-row__info'>
                        <Text className='members-row__name'>{displayPhone}</Text>
                        <Text className='members-row__sub' style={{ color: '#C0A8AD' }}>
                          等待对方登录接受
                        </Text>
                      </View>
                      <View
                        className='members-row__badge'
                        style={{ background: '#F5F0F2', color: '#C0A8AD' }}
                      >
                        待接受
                      </View>
                      {isOwner && (
                        <View
                          className='members-row__remove'
                          style={{ background: '#F5F0F2', color: '#9A8090' }}
                          onClick={() => openConfirm(member, true)}
                        >
                          <Image src={ICON_X} style={{ width: 13, height: 13 }} />
                        </View>
                      )}
                    </View>
                  )
                })}
              </View>
            </>
          )}

          {/* 权限说明 */}
          <View className='members-role-hint'>
            <Text style={{ color: '#F87098', fontWeight: 700 }}>角色说明：</Text>
            创建者可管理所有成员权限；
            <Text style={{ color: '#4A90D9', fontWeight: 600 }}>成员</Text>
            可查看和新增记录。
          </View>

          {/* 解散家庭（仅创建者可见） */}
          {isOwner && onDeleteFamily && (
            <View className='members-delete-family' onClick={onDeleteFamily}>
              <svg
                viewBox='0 0 24 24' fill='none' stroke='#F05060'
                strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'
                style={{ width: 14, height: 14, verticalAlign: -2, marginRight: 4 }}
              >
                <polyline points='3 6 5 6 21 6' />
                <path d='M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' />
              </svg>
              解散家庭
            </View>
          )}

          {/* 关闭按钮 */}
          <View className='members-btn-close' onClick={handleClose}>
            关闭
          </View>

          <View style={{ height: 24 }} />
        </View>
      </View>

      {/* 确认弹层 */}
      {confirm.open && (
        <View
          className='members-confirm-overlay'
          onClick={() => setConfirm(CONFIRM_INIT)}
        >
          <View
            className='members-confirm-sheet'
            onClick={(e) => { e.stopPropagation() }}
          >
            <View className='members-handle'>
              <View className='members-handle__bar' />
            </View>

            <View className='members-confirm-body'>
              <View className='members-confirm-icon'>
                <Image src={ICON_ALERT} style={{ width: 36, height: 36 }} />
              </View>
              <Text className='members-confirm-title'>
                {confirm.isPending
                  ? `撤销对 ${confirm.memberName} 的邀请？`
                  : `移除「${confirm.memberName}」？`}
              </Text>
              <Text className='members-confirm-desc'>
                {confirm.isPending
                  ? '撤销后对方将无法通过此邀请加入家庭，如需再次邀请可重新发送。'
                  : '移除后该成员将无法查看或记录家庭数据，如需再次加入需重新邀请。'}
              </Text>
            </View>

            <View className='members-confirm-actions'>
              <View
                className={`members-confirm-btn members-confirm-btn--danger${confirmLoading ? ' members-confirm-btn--disabled' : ''}`}
                onClick={confirmLoading ? undefined : handleConfirm}
              >
                {confirmLoading ? (
                  <Image src={ICON_SPINNER} className='members-icon-spin' style={{ width: 18, height: 18 }} />
                ) : confirm.isPending ? '撤销邀请' : '移除成员'}
              </View>
              <View
                className='members-confirm-btn members-confirm-btn--secondary'
                onClick={() => setConfirm(CONFIRM_INIT)}
              >
                再想想
              </View>
            </View>
          </View>
        </View>
      )}
    </>
  )
}
