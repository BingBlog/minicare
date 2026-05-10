import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { familyApi } from '@/api'
import type { PendingInvite } from '@/api/family'

import './InviteModal.scss'

interface InviteModalProps {
  invites: PendingInvite[]
  open: boolean
  onAccept?: (invites: PendingInvite[]) => void
  onDecline?: () => void
}

export default function InviteModal({ invites, open, onAccept, onDecline }: InviteModalProps) {
  if (!open || invites.length === 0) return null

  const handleAccept = async () => {
    try {
      for (const inv of invites) {
        await familyApi.acceptInvite(inv.id)
      }
      Taro.showToast({ title: '已加入家庭', icon: 'success' })
      onAccept?.(invites)
    } catch (err) {
      Taro.showToast({ title: err instanceof Error ? err.message : '操作失败', icon: 'none' })
    }
  }

  const handleDecline = async () => {
    try {
      for (const inv of invites) {
        await familyApi.declineInvite(inv.id)
      }
      Taro.showToast({ title: '已拒绝邀请', icon: 'none' })
      onDecline?.()
    } catch (err) {
      Taro.showToast({ title: err instanceof Error ? err.message : '操作失败', icon: 'none' })
    }
  }

  return (
    <View className='invite-overlay'>
      <View className='invite-modal' onClick={(e) => e.stopPropagation()}>
        <Text className='invite-modal__title'>家庭邀请</Text>
        <View className='invite-modal__list'>
          {invites.map((inv) => (
            <View key={inv.id} className='invite-modal__item'>
              <Text className='invite-modal__name'>{inv.family_name}</Text>
              {inv.inviter_name && (
                <Text className='invite-modal__inviter'>邀请人：{inv.inviter_name}</Text>
              )}
            </View>
          ))}
        </View>
        <View className='invite-modal__actions'>
          <View className='invite-modal__btn invite-modal__btn--accept' onClick={handleAccept}>
            <Text className='invite-modal__btn-text'>接受邀请</Text>
          </View>
          <View className='invite-modal__btn invite-modal__btn--decline' onClick={handleDecline}>
            <Text className='invite-modal__btn-text invite-modal__btn-text--decline'>拒绝</Text>
          </View>
        </View>
      </View>
    </View>
  )
}
