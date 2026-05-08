import BottomSheet from '@/components/ui/BottomSheet'

interface ContactModalProps {
  open: boolean
  onClose: () => void
}

const EMAIL = 'abingblog@gmail.com'

export default function ContactModal({ open, onClose }: ContactModalProps) {
  const handleCopyEmail = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(EMAIL)
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} maxHeightVh={70} scrollable={false}>
      <div className="px-5 pb-6">
        <p className="text-[17px] font-bold text-[#4A3035] text-center mb-3">
          联系我们
        </p>

        <p className="text-[13px] text-[#9A8090] leading-relaxed mb-4">
          如果您遇到以下情况，欢迎通过邮件与我们联系：
        </p>

        <div className="space-y-2 mb-5">
          <p className="text-[13px] text-[#4A3035] leading-relaxed">
            · 对隐私政策或用户协议有疑问
          </p>
          <p className="text-[13px] text-[#4A3035] leading-relaxed">
            · 需要访问、修改或删除您的个人信息
          </p>
          <p className="text-[13px] text-[#4A3035] leading-relaxed">
            · 需要申请注销账号
          </p>
          <p className="text-[13px] text-[#4A3035] leading-relaxed">
            · 发现功能异常或使用中遇到问题
          </p>
          <p className="text-[13px] text-[#4A3035] leading-relaxed">
            · 对产品功能有建议或反馈
          </p>
        </div>

        <div className="mb-4">
          <p className="text-[12px] text-[#9A8090] mb-1.5">联系邮箱</p>
          <div className="flex items-center gap-2">
            <span className="flex-1 text-[15px] font-medium text-[#4A3035]">
              {EMAIL}
            </span>
            <button
              type="button"
              onClick={handleCopyEmail}
              className="px-3 py-1.5 rounded-lg text-[13px] font-medium border-none cursor-pointer transition-all active:scale-[0.96]"
              style={{ background: '#FFF0F4', color: '#F87098' }}
            >
              复制
            </button>
          </div>
        </div>

        <p className="text-[12px] text-[#C0A8AD] text-center mb-5">
          我们将在15个工作日内回复您的请求
        </p>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-3.5 rounded-2xl text-[15px] font-semibold border-none cursor-pointer transition-all active:scale-[0.98]"
          style={{ background: '#F87098', color: '#fff' }}
        >
          我知道了
        </button>
      </div>
    </BottomSheet>
  )
}
