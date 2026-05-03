/**
 * 联系我们弹层
 *
 * 展示联系场景说明和邮箱，支持长按复制邮箱地址
 */
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'

interface ContactModalProps {
  open: boolean
  onClose: () => void
}

const EMAIL = 'abingblog@gmail.com'

export default function ContactModal({ open, onClose }: ContactModalProps) {
  if (!open) return null

  const handleCopyEmail = () => {
    Taro.setClipboardData({
      data: EMAIL,
      success: () => {
        Taro.showToast({ title: '邮箱已复制', icon: 'success' })
      },
    })
  }

  return (
    <View className='contact-modal__mask' onClick={onClose}>
      <View className='contact-modal' onClick={(e) => e.stopPropagation()}>
        {/* 标题 */}
        <Text className='contact-modal__title'>联系我们</Text>

        {/* 说明 */}
        <Text className='contact-modal__desc'>
          如果您遇到以下情况，欢迎通过邮件与我们联系：
        </Text>

        <View className='contact-modal__list'>
          <Text className='contact-modal__item'>
            对隐私政策或用户协议有疑问
          </Text>
          <Text className='contact-modal__item'>
            需要访问、修改或删除您的个人信息
          </Text>
          <Text className='contact-modal__item'>
            需要申请注销账号
          </Text>
          <Text className='contact-modal__item'>
            发现功能异常或使用中遇到问题
          </Text>
          <Text className='contact-modal__item'>
            对产品功能有建议或反馈
          </Text>
        </View>

        {/* 邮箱 */}
        <View className='contact-modal__email-wrap'>
          <Text className='contact-modal__email-label'>联系邮箱</Text>
          <View className='contact-modal__email-row'>
            <Text className='contact-modal__email' selectable>{EMAIL}</Text>
            <View className='contact-modal__copy-btn' onClick={handleCopyEmail}>
              <Text className='contact-modal__copy-text'>复制</Text>
            </View>
          </View>
        </View>

        {/* 底部提示 */}
        <Text className='contact-modal__tip'>
          我们将在15个工作日内回复您的请求
        </Text>

        {/* 关闭按钮 */}
        <View className='contact-modal__close-btn' onClick={onClose}>
          <Text className='contact-modal__close-text'>我知道了</Text>
        </View>
      </View>
    </View>
  )
}
