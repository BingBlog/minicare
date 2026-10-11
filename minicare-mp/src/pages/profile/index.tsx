/**
 * 我的页面 - MP 迁移版
 * 与 Web profile/index.tsx 行为一致
 *
 * 结构：
 *   - 页面标题「我的」
 *   - BabyHero     宝宝头像 + 名字 + 过敏信息 + 编辑按钮
 *   - BabyStats    4格：身高 / 体重 / 头围 / 稳定期
 *   - SettingsGroup 设置菜单组（家庭 / 关于）
 *   - 退出登录按钮
 *   - EditBabyModal  编辑宝宝档案底部弹层
 *   - MembersModal   家庭成员管理弹层
 */
import { View, Text, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState, useEffect, useCallback } from 'react'
import { babyApi, familyApi, fetchAppConfig, authApi } from '@/api'
import { removeToken, getToken, getUser, setCurrentFamilyId, getCurrentBabyId, setCurrentBabyId } from '@/api/http'
import type { AllergyLevel, AllergyType, FamilyMember, User, Baby } from '@/api'

import BabyHero from './BabyHero'
import BabyStats from './BabyStats'
import SettingsGroup from './SettingsGroup'
import type { SettingsRow } from './types'
import EditBabyModal from './EditBabyModal'
import MembersModal from './MembersModal'
import ContactModal from './ContactModal'
import TabBar from '@/components/TabBar/TabBar'
import LoginGuide from '@/components/LoginGuide/LoginGuide'
import { getStatusBarHeight } from '@/lib/safeArea'
import { useIsIPad } from '@/lib/useIsIPad'
import { uploadOne } from '@/lib/uploadImage'
import { useFileDisplayUrl } from '@/lib/useFileDisplayUrl'

import './index.scss'

const ICON_LOGOUT = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#F05060" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`
)}`

function showToast(title: string) {
  Taro.showToast({ title, icon: 'none', duration: 2000 })
}

export default function ProfilePage() {
  const isIPad = useIsIPad()
  const cls = (base: string) => isIPad ? `${base} is-ipad` : base
  // ── 核心数据状态──────────────────────────────────────────────
  const [user, setUser] = useState<User | null>(null)
  const [currentBaby, setCurrentBaby] = useState<Baby | null>(null)
  const [allBabies, setAllBabies] = useState<Baby[]>([])
  const [loading, setLoading] = useState(true)

  // ── 编辑宝宝档案弹层 ──────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editName, setEditName] = useState('')
  const [editBirthDate, setEditBirthDate] = useState('')
  const [editGender, setEditGender] = useState<'male' | 'female' | 'unknown'>('unknown')
  const [editAllergyTypes, setEditAllergyTypes] = useState<AllergyType[]>([])
  const [editAllergyLevel, setEditAllergyLevel] = useState<AllergyLevel>('unknown')

  // ── 退出登录确认 ──────────────────────────────────────────────

  // ── 家庭成员弹层 ──────────────────────────────────────────────
  const [membersOpen, setMembersOpen] = useState(false)
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [currentUserRole, setCurrentUserRole] = useState<'owner' | 'member'>('member')

  // 是否未登录（游客模式）
  const [isGuest, setIsGuest] = useState(false)

  // 是否已设置密码（TECH-016）—— null 表示尚未取到，不显示副文案
  const [hasPassword, setHasPassword] = useState<boolean | null>(null)

  // ── 联系我们弹层 ──────────────────────────────────────────────
  const [contactOpen, setContactOpen] = useState(false)
  const [babyPickerOpen, setBabyPickerOpen] = useState(false)

  // ── 初始数据加载 ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    const init = async () => {
      const token = getToken()
      if (!token) {
        if (!cancelled) {
          setIsGuest(true)
          setLoading(false)
        }
        return
      }

      const storedUser = getUser()
      if (storedUser && !cancelled) {
        setUser(storedUser as User)
      }

      try {
        await fetchAppConfig()
        const babies = await babyApi.getMine()
        if (!babies.length) {
          if (!cancelled) setLoading(false)
          return
        }

        const babyId = getCurrentBabyId(babies)!
        const baby = babies.find((b) => b.id === babyId) || babies[0]
        setCurrentBabyId(baby.id)
        setCurrentFamilyId(baby.family_id)

        if (!cancelled) {
          setAllBabies(babies)
          setCurrentBaby(baby)
          Taro.setStorageSync('minicare_baby', baby)
          Taro.setStorageSync('minicare_current_baby_id', baby.id)
          Taro.setStorageSync('minicare_current_family_id', baby.family_id)
          setLoading(false)
        }
      } catch {
        if (!cancelled) {
          showToast('加载数据失败，请重试')
          setLoading(false)
        }
      }
    }
    init()
    return () => { cancelled = true }
  }, [])

  // ── 密码状态（TECH-016）─────────────────────────────────────
  // 用 useDidShow 而非 useEffect：从「账号与安全」返回本页时需要刷新
  // （刚设置完密码 → 副文案应从「未设置密码」变为「已设置密码」）。
  // 失败静默降级为不显示副文案，不打扰用户。
  useDidShow(() => {
    if (!getToken()) return
    authApi
      .passwordStatus()
      .then((res) => setHasPassword(res.hasPassword))
      .catch(() => {})
  })

  // ── 同步编辑表单 initial 值（当 currentBaby 变化时）───────────
  useEffect(() => {
    setEditName(currentBaby?.name ?? '')
    setEditBirthDate(currentBaby?.birth_date ?? '')
    setEditGender(
      (currentBaby?.gender as 'male' | 'female' | 'unknown') ?? 'unknown',
    )
    setEditAllergyTypes(currentBaby?.allergy_types ?? [])
    setEditAllergyLevel(
      (currentBaby?.allergy_level as AllergyLevel) ?? 'unknown',
    )
  }, [currentBaby])

  // ── 编辑弹层操作 ──────────────────────────────────────────────
  const openEdit = useCallback(() => {
    setEditName(currentBaby?.name ?? '')
    setEditBirthDate(currentBaby?.birth_date ?? '')
    setEditGender(
      (currentBaby?.gender as 'male' | 'female' | 'unknown') ?? 'unknown',
    )
    setEditAllergyTypes(currentBaby?.allergy_types ?? [])
    setEditAllergyLevel(
      (currentBaby?.allergy_level as AllergyLevel) ?? 'unknown',
    )
    setEditOpen(true)
  }, [currentBaby])

  const toggleAllergyType = (type: AllergyType) => {
    setEditAllergyTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    )
  }

  const handleSave = async () => {
    if (!editName.trim()) {
      showToast('请填写宝宝昵称')
      return
    }
    if (!editBirthDate) {
      showToast('请填写出生日期')
      return
    }
    if (!currentBaby) {
      showToast('数据未就绪，请稍后再试')
      return
    }

    setSaving(true)
    try {
      const updated = await babyApi.update(currentBaby.family_id, currentBaby.id, {
        name: editName.trim(),
        birth_date: editBirthDate,
        gender: editGender,
        allergy_types: editAllergyTypes,
        allergy_level: editAllergyLevel,
      })
      setCurrentBaby(updated)
      Taro.setStorageSync('minicare_baby', updated) // 同步 storage，首页 onShow 读取
      setEditOpen(false)
      showToast('档案已保存')
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  // ── 宝宝头像 ─────────────────────────────────────────────────
  // fileID → 临时 URL（avatar_url 变化即刷新展示）
  const avatarDisplayUrl = useFileDisplayUrl(currentBaby?.avatar_url)

  /** 换头像：选图 → COS 直传 → PATCH 宝宝档案 → 刷新展示 */
  const handleChangeAvatar = async () => {
    if (!currentBaby) {
      showToast('数据未就绪，请稍后再试')
      return
    }
    let tempPath = ''
    try {
      const res = await Taro.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
      })
      tempPath = res.tempFilePaths[0]
    } catch {
      return // 用户取消选择，静默
    }
    if (!tempPath) return

    Taro.showLoading({ title: '上传中…', mask: true })
    try {
      const fileID = await uploadOne('avatar', currentBaby.id, tempPath, { width: 400 })
      const updated = await babyApi.update(currentBaby.family_id, currentBaby.id, { avatar_url: fileID })
      setCurrentBaby(updated)
      Taro.setStorageSync('minicare_baby', updated) // 同步 storage，首页 onShow 读取
      Taro.hideLoading()
      showToast('头像已更新')
    } catch (e: unknown) {
      Taro.hideLoading()
      showToast(e instanceof Error ? e.message : '换头像失败，请重试')
    }
  }

  // ── 家庭成员弹层操作 ──────────────────────────────────────────
  const openMembers = async () => {
    if (!currentBaby) {
      showToast('暂无家庭信息')
      return
    }
    setMembersOpen(true)
    setMembersLoading(true)
    try {
      const res = await familyApi.getMembers(currentBaby.family_id)
      const enriched = res.members.map((m) => ({
        ...m,
        is_self: m.user_id === user?.id,
      }))
      setMembers(enriched)
      setCurrentUserRole(res.currentUserRole)
    } catch {
      showToast('加载成员列表失败')
    } finally {
      setMembersLoading(false)
    }
  }

  const refreshMembers = async (familyId: string) => {
    const res = await familyApi.getMembers(familyId)
    const enriched = res.members.map((m) => ({ ...m, is_self: m.user_id === user?.id }))
    setMembers(enriched)
    setCurrentUserRole(res.currentUserRole)
  }

  const handleInviteByPhone = async (phone: string) => {
    if (!currentBaby) throw new Error('暂无家庭信息')
    await familyApi.inviteByPhone(currentBaby.family_id, phone)
    showToast('邀请已发送，等待对方登录接受')
    await refreshMembers(currentBaby.family_id)
  }

  const handleRemoveMember = async (memberId: string) => {
    if (!currentBaby) throw new Error('暂无家庭信息')
    await familyApi.removeMember(currentBaby.family_id, memberId)
    showToast('操作成功')
    await refreshMembers(currentBaby.family_id)
  }

  // ── 退出登录 ──────────────────────────────────────────────────
  const handleLogout = () => {
    Taro.showModal({
      title: '退出登录',
      content: '退出后需要重新登录才能访问宝宝数据，确定退出吗？',
      confirmText: '确定退出',
      confirmColor: '#F05060',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          removeToken()
          Taro.reLaunch({ url: '/pages/login/index' })
        }
      },
    })
  }

  const handleSwitchBaby = (baby: Baby) => {
    if (baby.id === currentBaby?.id) return
    setCurrentBabyId(baby.id)
    setCurrentFamilyId(baby.family_id)
    setCurrentBaby(baby)
    Taro.setStorageSync('minicare_baby', baby)
    Taro.setStorageSync('minicare_current_baby_id', baby.id)
    Taro.setStorageSync('minicare_current_family_id', baby.family_id)
  }

  const handleLeaveFamily = async (baby: Baby) => {
    if (baby.family_role === 'owner') {
      showToast('家庭创建者不能退出')
      return
    }
    Taro.showModal({
      title: '退出家庭',
      content: `退出「${baby.family_name || '该家庭'}」后将无法查看${baby.name}的数据，确定退出吗？`,
      confirmText: '确定退出',
      confirmColor: '#F05060',
      cancelText: '取消',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await familyApi.leave(baby.family_id)
          showToast('已退出该家庭')
          const remaining = allBabies.filter((b) => b.family_id !== baby.family_id)
          setAllBabies(remaining)
          if (remaining.length > 0) {
            handleSwitchBaby(remaining[0])
          } else {
            setCurrentBaby(null)
            setCurrentBabyId('')
            setCurrentFamilyId('')
            Taro.removeStorageSync('minicare_baby')
            Taro.removeStorageSync('minicare_current_baby_id')
            Taro.removeStorageSync('minicare_current_family_id')
          }
          setBabyPickerOpen(false)
        } catch (e) {
          showToast(e instanceof Error ? e.message : '操作失败')
        }
      },
    })
  }

  // ── 删除宝宝（仅创建者，软删除） ──────────────────────────────
  const handleDeleteBaby = async () => {
    if (!currentBaby) return
    Taro.showModal({
      title: '删除宝宝档案',
      content: `删除「${currentBaby.name}」后，ta 的档案和全部记录（喂养、睡眠、尿布、健康等）将不再显示，历史数据将归档保留，确定删除吗？`,
      confirmText: '删除',
      confirmColor: '#F05060',
      cancelText: '取消',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await babyApi.remove(currentBaby.family_id, currentBaby.id)
          showToast('宝宝档案已删除')
          setEditOpen(false)
          const remaining = allBabies.filter((b) => b.id !== currentBaby.id)
          setAllBabies(remaining)
          if (remaining.length > 0) {
            handleSwitchBaby(remaining[0])
          } else {
            setCurrentBaby(null)
            setCurrentBabyId('')
            setCurrentFamilyId('')
            Taro.removeStorageSync('minicare_baby')
            Taro.removeStorageSync('minicare_current_baby_id')
            Taro.removeStorageSync('minicare_current_family_id')
          }
        } catch (e) {
          showToast(e instanceof Error ? e.message : '操作失败')
        }
      },
    })
  }

  // ── 解散家庭（仅创建者，软删除） ──────────────────────────────
  const handleDeleteFamily = async () => {
    if (!currentBaby) return
    const familyName = currentBaby.family_name || '该家庭'
    Taro.showModal({
      title: '解散家庭',
      content: `解散「${familyName}」后，家庭内所有宝宝档案和全部记录将不再显示，历史数据将归档保留，确定解散吗？`,
      confirmText: '解散',
      confirmColor: '#F05060',
      cancelText: '取消',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await familyApi.remove(currentBaby.family_id)
          showToast('家庭已解散')
          setMembersOpen(false)
          const remaining = allBabies.filter((b) => b.family_id !== currentBaby.family_id)
          setAllBabies(remaining)
          if (remaining.length > 0) {
            handleSwitchBaby(remaining[0])
          } else {
            setCurrentBaby(null)
            setCurrentBabyId('')
            setCurrentFamilyId('')
            Taro.removeStorageSync('minicare_baby')
            Taro.removeStorageSync('minicare_current_baby_id')
            Taro.removeStorageSync('minicare_current_family_id')
          }
          setBabyPickerOpen(false)
        } catch (e) {
          showToast(e instanceof Error ? e.message : '操作失败')
        }
      },
    })
  }

  // ── SettingsGroup 数据 ────────────────────────────────────────
  const activeCount = members.filter((m) => m.status === 'active' || m.status === undefined).length

  // 账号组（TECH-016）：设置/修改密码入口
  const accountRows: SettingsRow[] = [
    {
      id: 'security',
      type: 'arrow',
      icon: 'lock',
      iconBg: '#FFF0F4',
      label: '账号与安全',
      subText:
        hasPassword === null ? undefined : hasPassword ? '已设置密码' : '未设置密码',
      onClick: () => Taro.navigateTo({ url: '/pages/account/security/index' }),
    },
  ]

  const familyRows: SettingsRow[] = [
    ...(allBabies.length > 1
      ? [{
          id: 'switch-baby',
          type: 'arrow' as const,
          icon: 'baby',
          iconBg: '#FFF0F4',
          label: '管理宝宝',
          subText: currentBaby?.name,
          onClick: () => setBabyPickerOpen(true),
        }]
      : []),
    {
      id: 'members',
      type: 'arrow',
      icon: 'users',
      iconBg: '#FFF0F4',
      label: '家庭成员管理',
      subText: activeCount > 0 ? `${activeCount}人` : undefined,
      onClick: openMembers,
    },
    {
      id: 'devices',
      type: 'arrow',
      icon: 'speaker',
      iconBg: '#FFF0F4',
      label: '智能设备',
      subText: '语音音箱',
      onClick: () => Taro.navigateTo({ url: '/pages/device/index' }),
    },
  ]

  const toolRows: SettingsRow[] = [
    {
      id: 'dashboard',
      type: 'arrow',
      icon: 'monitor',
      iconBg: '#F0F4FF',
      label: 'iPad 数据看板',
      subText: '床头大屏',
      onClick: () => Taro.navigateTo({ url: '/pages/dashboard/index' }),
    },
  ]

  const aboutRows: SettingsRow[] = [
    {
      id: 'version',
      type: 'info',
      icon: 'phone',
      iconBg: '#FFF0F4',
      label: '版本号',
      value: 'v1.0.0（MVP）',
    },
    {
      id: 'about',
      type: 'arrow',
      icon: 'heart',
      iconBg: '#FFF1F4',
      label: '关于敏宝日记',
      onClick: () => showToast('敏宝日记 · 专为敏感宝宝家庭打造'),
    },
    {
      id: 'privacy',
      type: 'arrow',
      icon: 'fileText',
      iconBg: '#F5F5F5',
      label: '隐私政策',
      onClick: () => Taro.navigateTo({ url: '/pages/privacy/index?tab=privacy' }),
    },
    {
      id: 'terms',
      type: 'arrow',
      icon: 'fileText',
      iconBg: '#F5F5F5',
      label: '用户服务协议',
      onClick: () => Taro.navigateTo({ url: '/pages/privacy/index?tab=terms' }),
    },
    {
      id: 'contact',
      type: 'arrow',
      icon: 'mail',
      iconBg: '#FFF0F4',
      label: '联系我们',
      onClick: () => setContactOpen(true),
    },
  ]

  // 游客模式
  if (isGuest) {
    return (
      <View className={cls('profile-page')}>
        <View className='profile-page__header' style={{ paddingTop: `${getStatusBarHeight() + 12}px` }}>
          <Text className='profile-page__title'>我的</Text>
        </View>
        <View className='profile-page__body'>
          <LoginGuide title='登录后查看' desc='登录后可管理宝宝档案、家庭成员和个人设置' />
          <SettingsGroup title='关于' rows={[
            {
              id: 'privacy',
              type: 'arrow',
              icon: 'fileText',
              iconBg: '#F5F5F5',
              label: '隐私政策',
              onClick: () => Taro.navigateTo({ url: '/pages/privacy/index?tab=privacy' }),
            },
            {
              id: 'terms',
              type: 'arrow',
              icon: 'fileText',
              iconBg: '#F5F5F5',
              label: '用户服务协议',
              onClick: () => Taro.navigateTo({ url: '/pages/privacy/index?tab=terms' }),
            },
            {
              id: 'contact',
              type: 'arrow',
              icon: 'mail',
              iconBg: '#FFF0F4',
              label: '联系我们',
              onClick: () => setContactOpen(true),
            },
          ]} />
          <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />
        </View>
        <TabBar activeTab='profile' />
      </View>
    )
  }

  return (
    <View className={cls('profile-page')}>
      {/* 页面标题 */}
      <View className='profile-page__header' style={{ paddingTop: `${getStatusBarHeight() + 12}px` }}>
        <Text className='profile-page__title'>我的</Text>
      </View>

      {/* 可滚动内容区 */}
      <View className='profile-page__body'>
        {/* 宝宝 Hero 区 */}
        <BabyHero
          babyName={currentBaby?.name}
          userNickname={user?.nickname}
          birthDate={currentBaby?.birth_date}
          gender={currentBaby?.gender}
          allergyTypes={currentBaby?.allergy_types}
          allergyLevel={currentBaby?.allergy_level as AllergyLevel | undefined}
          babies={allBabies}
          currentBabyId={currentBaby?.id}
          avatarUrl={avatarDisplayUrl}
          onEdit={openEdit}
          onAvatarClick={handleChangeAvatar}
          onSwitchBaby={handleSwitchBaby}
        />

        <BabyStats currentFamilyId={currentBaby?.family_id} currentBaby={currentBaby} />

        {/* 账号设置组（TECH-016） */}
        <SettingsGroup title='账号' rows={accountRows} />

        {/* 家庭设置组 */}
        <SettingsGroup title='家庭' rows={familyRows} />

        {/* 工具设置组 */}
        <SettingsGroup title='工具' rows={toolRows} />

        {/* 关于设置组 */}
        <SettingsGroup title='关于' rows={aboutRows} />

        {/* 退出登录按钮 */}
        <View className='profile-page__logout-wrap'>
          <View className='profile-page__logout-btn' onClick={handleLogout}>
            <Image src={ICON_LOGOUT} style={{ width: '18px', height: '18px' }} />
            退出登录
          </View>
        </View>

        <View style={{ height: 32 }} />
      </View>

      {/* 编辑宝宝档案弹层 */}
      <EditBabyModal
        open={editOpen}
        saving={saving}
        name={editName}
        onNameChange={setEditName}
        birthDate={editBirthDate}
        onBirthDateChange={setEditBirthDate}
        gender={editGender}
        onGenderChange={setEditGender}
        allergyTypes={editAllergyTypes}
        onToggleAllergyType={toggleAllergyType}
        allergyLevel={editAllergyLevel}
        onAllergyLevelChange={setEditAllergyLevel}
        onSave={handleSave}
        onCancel={() => setEditOpen(false)}
        onCdcHelp={() => showToast('跳转 CDC 评分标准页面')}
        isOwner={currentBaby?.family_role === 'owner'}
        onDelete={handleDeleteBaby}
      />


      {/* 家庭成员管理弹层 */}
      <MembersModal
        open={membersOpen}
        members={members}
        loading={membersLoading}
        isOwner={currentUserRole === 'owner' || currentBaby?.family_role === 'owner'}
        onInviteByPhone={handleInviteByPhone}
        onRemoveMember={handleRemoveMember}
        onDeleteFamily={handleDeleteFamily}
        onClose={() => setMembersOpen(false)}
      />

      {/* 联系我们弹层 */}
      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />

      {babyPickerOpen && allBabies.length > 1 && (
        <View className='family-picker-overlay' onClick={() => setBabyPickerOpen(false)}>
          <View className='family-picker' onClick={(e) => e.stopPropagation()}>
            <Text className='family-picker__title'>切换宝宝</Text>
            <View className='family-picker__list'>
              {allBabies.map((b) => (
                <View
                  key={b.id}
                  className={`family-picker__item ${b.id === currentBaby?.id ? 'family-picker__item--active' : ''}`}
                  onClick={() => {
                    setBabyPickerOpen(false)
                    handleSwitchBaby(b)
                  }}
                >
                  <View className='family-picker__icon'>
                    <svg viewBox='0 0 24 24' fill='none' stroke={b.id === currentBaby?.id ? '#fff' : '#f87098'} strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' style={{ width: 18, height: 18 }}>
                      <path d='M12 2a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4' />
                      <path d='M5 20a7 7 0 0 1 14 0' />
                    </svg>
                  </View>
                  <View className='family-picker__info'>
                    <Text className='family-picker__name'>{b.name}</Text>
                    <Text className='family-picker__role'>{b.family_name || '家庭'} · {b.family_role === 'owner' ? '创建者' : '成员'}</Text>
                  </View>
                  {b.id === currentBaby?.id ? (
                    <View className='family-picker__check'>
                      <svg viewBox='0 0 24 24' fill='none' stroke='#f87098' strokeWidth='3' strokeLinecap='round' strokeLinejoin='round' style={{ width: 16, height: 16 }}>
                        <polyline points='20 6 9 17 4 12' />
                      </svg>
                    </View>
                  ) : b.family_role !== 'owner' ? (
                    <View
                      className='baby-picker__leave'
                      onClick={(e) => {
                        e.stopPropagation()
                        handleLeaveFamily(b)
                      }}
                    >
                      <Text className='baby-picker__leave-text'>退出</Text>
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* 底部导航栏 */}
      <TabBar activeTab='profile' />
    </View>
  )
}
