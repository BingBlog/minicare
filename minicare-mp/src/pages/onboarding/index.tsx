import { View, Text, Input } from '@tarojs/components'
import Taro, { useRouter, useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { familyApi, babyApi } from '@/api'
import type { AllergyLevel } from '@/api'
import type { PendingInvite } from '@/api/family'
import { setCurrentFamilyId, setCurrentBabyId } from '@/api/http'
import { nowDate } from '@/lib/utils'

import NavBar from '@/components/NavBar/NavBar'
import InviteModal from '@/components/InviteModal/InviteModal'
import Step0WelcomePage from './Step0WelcomePage'
import StepDots from './StepDots'
import BabyInfoForm from './BabyInfoForm'
import AllergySection from './AllergySection'
import Step2SuccessPage from './Step2SuccessPage'

import './index.scss'

type Step = 0 | 1 | 2
type AllergyLevelKey = AllergyLevel | ''

export default function OnboardingPage() {
  const router = useRouter()
  const isInvited = router.params.mode === 'invited'

  const [step, setStep] = useState<Step>(0)

  const [familyName, setFamilyName] = useState('我们的家')

  const [babyName, setBabyName] = useState('')
  const [gender, setGender] = useState<'male' | 'female'>('male')
  const [birthDate, setBirthDate] = useState(() => nowDate())

  const [allergyLevel, setAllergyLevel] = useState<AllergyLevelKey>('unknown')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
  const [inviteModalOpen, setInviteModalOpen] = useState(false)

  useDidShow(() => {
    familyApi.getPendingInvites().then((invites) => {
      if (invites.length > 0) {
        setPendingInvites(invites)
        setInviteModalOpen(true)
      }
    }).catch(() => {})
  })

  const handleAcceptInvite = () => {
    setPendingInvites([])
    setInviteModalOpen(false)
    Taro.reLaunch({ url: '/pages/home/index' })
  }

  const handleDeclineInvite = () => {
    setPendingInvites([])
    setInviteModalOpen(false)
  }

  const handleInviteJoin = async () => {
    try {
      const invites = await familyApi.getPendingInvites()
      if (invites.length > 0) {
        setPendingInvites(invites)
        setInviteModalOpen(true)
      } else {
        Taro.showToast({ title: '暂无待接受的邀请', icon: 'none' })
      }
    } catch {
      Taro.showToast({ title: '查询邀请失败，请重试', icon: 'none' })
    }
  }

  const handleCreate = async () => {
    if (!babyName.trim()) {
      Taro.showToast({ title: '请输入宝宝昵称', icon: 'none' })
      return
    }
    if (!birthDate) {
      Taro.showToast({ title: '请选择出生日期', icon: 'none' })
      return
    }
    if (!isInvited && !familyName.trim()) {
      Taro.showToast({ title: '请输入家庭名称', icon: 'none' })
      return
    }

    setLoading(true)
    setError('')
    try {
      let fid: string

      if (isInvited) {
        const babies = await babyApi.getMine()
        if (!babies.length) {
          setError('未找到已加入的家庭，请重试')
          setLoading(false)
          return
        }
        fid = babies[0].family_id
        setCurrentFamilyId(fid)
      } else {
        const family = await familyApi.create(familyName.trim() || '我们的家')
        Taro.setStorageSync('minicare_family', family)
        fid = family.id
      }

      const baby = await babyApi.create(fid, {
        name: babyName.trim(),
        gender,
        birth_date: birthDate,
        allergy_types: ['milk'],
        allergy_level: allergyLevel || undefined,
      })
      Taro.setStorageSync('minicare_baby', baby)
      setCurrentFamilyId(fid)
      setCurrentBabyId(baby.id)

      setStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  if (step === 0) {
    return (
      <View>
        <Step0WelcomePage onStart={() => setStep(1)} onInviteJoin={handleInviteJoin} />
        <InviteModal
          invites={pendingInvites}
          open={inviteModalOpen}
          onAccept={handleAcceptInvite}
          onDecline={handleDeclineInvite}
        />
      </View>
    )
  }

  if (step === 2) {
    return (
      <View>
        <Step2SuccessPage
          babyName={babyName}
          gender={gender}
          birthDate={birthDate}
          allergyLevel={allergyLevel}
        />
        <InviteModal
          invites={pendingInvites}
          open={inviteModalOpen}
          onAccept={handleAcceptInvite}
          onDecline={handleDeclineInvite}
        />
      </View>
    )
  }

  return (
    <View className='onboarding-page'>
      <NavBar
        title='创建宝宝档案'
        showBack
        background='#fff'
        onBack={() => setStep(0)}
      />

      <StepDots current={1} total={3} />

      <View className='onboarding-page__body'>
        {!isInvited && (
          <View className='onboarding-page__section'>
            <Text className='onboarding-page__section-title'>家庭名称</Text>
            <View className='onboarding-page__field'>
              <Input
                className='onboarding-page__input'
                placeholder='请输入家庭名称'
                value={familyName}
                onInput={(e) => setFamilyName(e.detail.value)}
                maxlength={20}
              />
            </View>
          </View>
        )}

        <BabyInfoForm
          babyName={babyName}
          onBabyNameChange={setBabyName}
          birthDate={birthDate}
          onBirthDateChange={setBirthDate}
          gender={gender}
          onGenderChange={setGender}
        />

        <AllergySection
          allergyLevel={allergyLevel}
          onAllergyLevelChange={setAllergyLevel}
        />

        {error && (
          <View className='onboarding-page__error'>
            <Text className='onboarding-page__error-text'>{error}</Text>
          </View>
        )}
      </View>

      <View className='onboarding-page__footer'>
        <View
          className={`onboarding-page__submit ${loading ? 'onboarding-page__submit--disabled' : ''}`}
          onClick={loading ? undefined : handleCreate}
        >
          {loading ? (
            <View className='onboarding-page__submit-loading'>
              <View className='onboarding-page__spinner' />
              <Text className='onboarding-page__submit-text'>创建中...</Text>
            </View>
          ) : (
            <Text className='onboarding-page__submit-text'>保存档案</Text>
          )}
        </View>
      </View>
      <InviteModal
        invites={pendingInvites}
        open={inviteModalOpen}
        onAccept={handleAcceptInvite}
        onDecline={handleDeclineInvite}
      />
    </View>
  )
}
