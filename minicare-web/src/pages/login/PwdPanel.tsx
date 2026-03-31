/**
 * 密码登录面板（当前为 UI 占位，功能开发中）
 *
 * 包含：
 *   - 手机号输入框
 *   - 密码输入框（含「忘记密码」链接）
 *   - 登录按钮
 *   - 立即注册链接
 *   - 用户协议文字
 */

interface Props {
  pwdPhone: string;
  onPwdPhoneChange: (v: string) => void;
  pwdPass: string;
  onPwdPassChange: (v: string) => void;
  showPwd: boolean;
  onToggleShowPwd: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onSwitchToSms: () => void;
  onForgotPassword: () => void;
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

export default function PwdPanel({
  pwdPhone,
  onPwdPhoneChange,
  pwdPass,
  onPwdPassChange,
  showPwd,
  onSubmit,
  onSwitchToSms,
  onForgotPassword,
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
          value={pwdPhone}
          onChange={(e) => onPwdPhoneChange(e.target.value.replace(/\D/g, '').slice(0, 11))}
          className="flex-1 border-none outline-none bg-transparent text-[15px] text-[#4A3035] placeholder:text-[#C0A8AD]"
          maxLength={11}
          autoComplete="tel"
        />
      </InputRow>

      {/* 密码 */}
      <InputRow>
        <div className="w-[22px] h-[22px] flex items-center justify-center flex-shrink-0">
          <LockIcon />
        </div>
        <input
          type={showPwd ? 'text' : 'password'}
          placeholder="请输入密码"
          value={pwdPass}
          onChange={(e) => onPwdPassChange(e.target.value)}
          className="flex-1 border-none outline-none bg-transparent text-[15px] text-[#4A3035] placeholder:text-[#C0A8AD]"
          autoComplete="current-password"
        />
        <span
          className="text-[13px] text-[#F87098] cursor-pointer font-medium flex-shrink-0"
          onClick={onForgotPassword}
        >
          忘记密码?
        </span>
      </InputRow>

      {/* 登录按钮 */}
      <button
        type="submit"
        className="w-full mt-8 py-4 text-white font-bold text-base cursor-pointer border-none transition-all active:scale-[0.97]"
        style={{
          borderRadius: 50,
          background: 'linear-gradient(90deg, #F87098, #F9A8C0)',
          boxShadow: '0 6px 20px rgba(248,112,152,0.4)',
        }}
      >
        登录
      </button>

      {/* 立即注册 */}
      <div className="text-center mt-5 text-[13px] text-[#9A8090]">
        没有账号？{' '}
        <span
          className="text-[#F87098] font-semibold cursor-pointer"
          onClick={onSwitchToSms}
        >
          立即注册
        </span>
      </div>

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
