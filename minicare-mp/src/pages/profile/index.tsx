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
import Taro from '@tarojs/taro'
import { useState, useEffect, useCallback } from 'react'
import { babyApi, familyApi, fetchAppConfig } from '@/api'
import { removeToken, getToken, getUser, getCurrentFamilyId, setCurrentFamilyId } from '@/api/http'
import type { AllergyLevel, AllergyType, FamilyMember, User, Family, Baby } from '@/api'

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
  const [currentFamily, setCurrentFamily] = useState<Family | null>(null)
  const [families, setFamilies] = useState<Family[]>([])
  const [currentBaby, setCurrentBaby] = useState<Baby | null>(null)
  const [babies, setBabies] = useState<Baby[]>([])
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

  // ── 联系我们弹层 ──────────────────────────────────────────────
  const [contactOpen, setContactOpen] = useState(false)
  const [familyPickerOpen, setFamilyPickerOpen] = useState(false)

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
        const families = await familyApi.getMine()
        if (!families.length) {
          if (!cancelled) setLoading(false)
          return
        }

        const familyId = getCurrentFamilyId(families)!
        const family = families.find((f) => f.id === familyId) || families[0]
        setCurrentFamilyId(family.id)
        let baby: Baby | null = null
        try {
          baby = await babyApi.get(family.id)
        } catch {
          // 无宝宝档案时不报错
        }

        let babyList: Baby[] = []
        try {
          babyList = await babyApi.list(family.id)
        } catch {
          // 列表获取失败时 fallback 到单个
          babyList = baby ? [baby] : []
        }

        if (!cancelled) {
          setFamilies(families)
          setCurrentFamily(family)
          setCurrentBaby(baby)
          setBabies(babyList)
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
    if (!currentBaby || !currentFamily) {
      showToast('数据未就绪，请稍后再试')
      return
    }

    setSaving(true)
    try {
      const updated = await babyApi.update(currentFamily.id, currentBaby.id, {
        name: editName.trim(),
        birth_date: editBirthDate,
        gender: editGender,
        allergy_types: editAllergyTypes,
        allergy_level: editAllergyLevel,
      })
      setCurrentBaby(updated)
      setEditOpen(false)
      showToast('档案已保存')
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  // ── 家庭成员弹层操作 ──────────────────────────────────────────
  const openMembers = async () => {
    if (!currentFamily) {
      showToast('暂无家庭信息')
      return
    }
    setMembersOpen(true)
    setMembersLoading(true)
    try {
      const res = await familyApi.getMembers(currentFamily.id)
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
    if (!currentFamily) throw new Error('暂无家庭信息')
    await familyApi.inviteByPhone(currentFamily.id, phone)
    showToast('邀请已发送，等待对方登录接受')
    await refreshMembers(currentFamily.id)
  }

  const handleRemoveMember = async (memberId: string) => {
    if (!currentFamily) throw new Error('暂无家庭信息')
    await familyApi.removeMember(currentFamily.id, memberId)
    showToast('操作成功')
    await refreshMembers(currentFamily.id)
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
    setCurrentBaby(baby)
    Taro.setStorageSync('minicare_baby', baby)
  }

  const handleSwitchFamily = async (family: Family) => {
    if (family.id === currentFamily?.id) return
    setCurrentFamilyId(family.id)
    setCurrentFamily(family)
    Taro.setStorageSync('minicare_family', family)
    Taro.setStorageSync('minicare_current_family_id', family.id)
    try {
      const baby = await babyApi.get(family.id)
      setCurrentBaby(baby)
      Taro.setStorageSync('minicare_baby', baby)
    } catch {
      setCurrentBaby(null)
      Taro.removeStorageSync('minicare_baby')
    }
    try {
      const babyList = await babyApi.list(family.id)
      setBabies(babyList)
    } catch {
      setBabies([])
    }
  }

  // ── SettingsGroup 数据 ────────────────────────────────────────
  const activeCount = members.filter((m) => m.status === 'active' || m.status === undefined).length
  const familyRows: SettingsRow[] = [
    ...(families.length > 1
      ? [{
          id: 'switch-family',
          type: 'arrow' as const,
          icon: 'home',
          iconBg: '#FFF0F4',
          label: '切换家庭',
          subText: currentFamily?.name,
          onClick: () => setFamilyPickerOpen(true),
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
          babies={babies}
          currentBabyId={currentBaby?.id}
          onEdit={openEdit}
          onSwitchBaby={handleSwitchBaby}
        />

        {/* 宝宝生长数据迷你格 */}
        <BabyStats currentFamily={currentFamily} currentBaby={currentBaby} />

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
      />


      {/* 家庭成员管理弹层 */}
      <MembersModal
        open={membersOpen}
        members={members}
        loading={membersLoading}
        isOwner={currentUserRole === 'owner'}
        onInviteByPhone={handleInviteByPhone}
        onRemoveMember={handleRemoveMember}
        onClose={() => setMembersOpen(false)}
      />

      {/* 联系我们弹层 */}
      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />

      {/* 家庭切换弹层 */}
      {familyPickerOpen && families.length > 1 && (
        <View className='family-picker-overlay' onClick={() => setFamilyPickerOpen(false)}>
          <View className='family-picker' onClick={(e) => e.stopPropagation()}>
            <Text className='family-picker__title'>切换家庭</Text>
            <View className='family-picker__list'>
              {families.map((f) => (
                <View
                  key={f.id}
                  className={`family-picker__item ${f.id === currentFamily?.id ? 'family-picker__item--active' : ''}`}
                  onClick={async () => {
                    setFamilyPickerOpen(false)
                    await handleSwitchFamily(f)
                  }}
                >
                  <View className='family-picker__icon'>
                    <svg viewBox='0 0 24 24' fill='none' stroke={f.id === currentFamily?.id ? '#fff' : '#f87098'} strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' style={{ width: 18, height: 18 }}>
                      <path d='M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' />
                      <polyline points='9 22 9 12 15 12 15 22' />
                    </svg>
                  </View>
                  <View className='family-picker__info'>
                    <Text className='family-picker__name'>{f.name}</Text>
                    <Text className='family-picker__role'>{f.role === 'owner' ? '创建者' : '成员'}</Text>
                  </View>
                  {f.id === currentFamily?.id && (
                    <View className='family-picker__check'>
                      <svg viewBox='0 0 24 24' fill='none' stroke='#f87098' strokeWidth='3' strokeLinecap='round' strokeLinejoin='round' style={{ width: 16, height: 16 }}>
                        <polyline points='20 6 9 17 4 12' />
                      </svg>
                    </View>
                  )}
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
