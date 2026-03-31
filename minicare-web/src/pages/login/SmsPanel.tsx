/**
 * 验证码登录面板
 *
 * 包含：
 *   - 手机号输入框（图标 + tel 输入）
 *   - 验证码输入框（图标 + 「获取/重发」按钮 + 倒计时）
 *   - 错误提示
 *   - 登录按钮（含加载态 spinner）
 *   - 用户协议文字
 */

interface Props {
  phone: string;
  onPhoneChange: (v: string) => void;
  code: string;
  onCodeChange: (v: string) => void;
  codeSent: boolean;
  countdown: number;
  loadingSend: boolean;
  loadingLogin: boolean;
  error: string;
  onSendCode: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

/** 手机图标 */
const PhoneIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="#F0B8C8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
    <line x1="12" y1="18" x2="12.01" y2="18" />
  </svg>
);

/** 锁图标 */
const LockIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="#F0B8C8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

/** 输入行容器 */
function InputRow({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-center gap-3.5"
      style={{ borderBottom: '1px solid #F0E8EA', padding: '14px 0' }}
    >
      {children}
    </div>
  );
}

export default function SmsPanel({
  phone,
  onPhoneChange,
  code,
  onCodeChange,
  codeSent,
  countdown,
  loadingSend,
  loadingLogin,
  error,
  onSendCode,
  onSubmit,
}: Props) {
  return (
    <form onSubmit={onSubmit} className="space-y-0">
      {/* 手机号 */}
      <InputRow>
        <div className="w-[22px] h-[22px] flex items-center justify-center flex-shrink-0">
          <PhoneIcon />
        </div>
        <input
          type="tel"
          placeholder="请输入手机号"
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value.replace(/\D/g, '').slice(0, 11))}
          className="flex-1 border-none outline-none bg-transparent text-[15px] text-[#4A3035] placeholder:text-[#C0A8AD]"
          maxLength={11}
          autoComplete="tel"
        />
      </InputRow>

      {/* 验证码 */}
      <InputRow>
        <div className="w-[22px] h-[22px] flex items-center justify-center flex-shrink-0">
          <LockIcon />
        </div>
        <input
          type="number"
          placeholder="请输入验证码"
          value={code}
          onChange={(e) => onCodeChange(e.target.value.slice(0, 6))}
          className="flex-1 border-none outline-none bg-transparent text-[15px] text-[#4A3035] placeholder:text-[#C0A8AD]"
          style={{ letterSpacing: 4 }}
          inputMode="numeric"
          autoComplete="one-time-code"
        />
        {/* 发送验证码按钮 */}
        <button
          type="button"
          onClick={onSendCode}
          disabled={loadingSend || countdown > 0}
          className="flex-shrink-0 text-[13px] font-semibold px-2.5 py-1 rounded-xl border transition-all"
          style={
            countdown > 0
              ? { color: '#9A8090', borderColor: '#E8E0E4', background: 'transparent', pointerEvents: 'none' }
              : { color: '#F87098', borderColor: '#F87098', background: 'transparent' }
          }
        >
          {loadingSend
            ? '发送中…'
            : countdown > 0
            ? `${countdown}s 后重发`
            : codeSent
            ? '重新获取'
            : '获取验证码'}
        </button>
      </InputRow>

      {/* 错误提示 */}
      {error && (
        <div className="mt-3 text-sm text-red-500 bg-red-50 px-4 py-2.5 rounded-lg">{error}</div>
      )}

      {/* 登录按钮 */}
      <button
        type="submit"
        disabled={loadingLogin}
        className="w-full mt-8 py-4 text-white font-bold text-base cursor-pointer border-none transition-all active:scale-[0.97] disabled:opacity-60"
        style={{
          borderRadius: 50,
          background: 'linear-gradient(90deg, #F87098, #F9A8C0)',
          boxShadow: '0 6px 20px rgba(248,112,152,0.4)',
        }}
      >
        {loadingLogin ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            登录中…
          </span>
        ) : '登录 / 注册'}
      </button>

      {/* 用户协议 */}
      <div className="text-center mt-4 text-[11px] text-[#9A8090] leading-relaxed">
        登录即代表同意{' '}
        <span className="text-[#F87098] font-medium cursor-pointer">《用户协议》</span>
        {' '}和{' '}
        <span className="text-[#F87098] font-medium cursor-pointer">《隐私政策》</span>
      </div>
    </form>
  );
}
