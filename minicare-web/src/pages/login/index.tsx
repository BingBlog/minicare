/**
 * 登录/注册页（验证码流程）
 *
 * VITE_AUTH_MODE=test  （开发/测试环境）
 *   → 调后端 /api/auth/send-code + /api/auth/verify-code
 *   → 后端固定验证码 123456，不发真实短信
 *
 * VITE_AUTH_MODE=sms   （生产环境）
 *   → 前端 @cloudbase/js-sdk signInWithOtp 发真实短信
 *   → 验证成功后调后端 /api/auth/tcb-login 换取自定义 JWT
 *
 * 组件结构：
 * ┌─ LoginPage（路由级页面，仅组合子组件）
 * │  ├─ LoginHero       顶部插画区（渐变背景 + 场景装饰）
 * │  ├─ ModeTabs        验证码 / 密码 切换 Tab（内联）
 * │  ├─ SmsPanel        验证码登录面板
 * │  └─ PwdPanel        密码登录面板（UI 占位）
 * └─ useLoginLogic      全部业务逻辑 Hook
 */
import LoginHero from './LoginHero'
import SmsPanel from './SmsPanel'
import PwdPanel from './PwdPanel'
import { useLoginLogic, type LoginMode } from './useLoginLogic'

export default function LoginPage() {
  const {
    mode, switchMode,
    // 协议
    agreed, setAgreed,
    // 验证码面板
    phone, setPhone,
    code, setCode,
    codeSent,
    countdown,
    loadingSend,
    loadingLogin,
    error,
    handleSendCode,
    handleSmsLogin,
    // 密码面板
    pwdPhone, setPwdPhone,
    pwdPass, setPwdPass,
    showPwd, setShowPwd,
    handlePwdLogin,
    // Toast
    toast,
    showToast,
    IS_TEST_MODE,
  } = useLoginLogic()

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">

      {/* ══ 顶部插画区 ══ */}
      <LoginHero onSwitchToRegister={() => switchMode('sms')} />

      {/* ══ 主体 ══ */}
      <div className="flex-1 bg-white overflow-y-auto px-6 pt-8 pb-6">

        {/* 测试模式提示 */}
        {IS_TEST_MODE && (
          <div className="mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
            🔧 测试模式 · 验证码固定 <strong>123456</strong>，不发真实短信
          </div>
        )}

        {/* ── 模式切换 Tab ── */}
        <div className="flex mb-6" style={{ borderBottom: '1.5px solid #F0E8EA' }}>
          {(['sms', 'pwd'] as LoginMode[]).map((m) => (
            <div
              key={m}
              onClick={() => switchMode(m)}
              className="flex-1 text-center py-2.5 text-[15px] font-semibold cursor-pointer transition-all"
              style={{
                color: mode === m ? 'var(--color-primary, #F87098)' : '#9A8090',
                borderBottom: mode === m ? '2.5px solid #F87098' : '2.5px solid transparent',
                marginBottom: -1.5,
              }}
            >
              {m === 'sms' ? '验证码登录' : '密码登录'}
            </div>
          ))}
        </div>

        {/* ── 验证码面板 ── */}
        {mode === 'sms' && (
          <SmsPanel
            phone={phone}
            onPhoneChange={setPhone}
            code={code}
            onCodeChange={setCode}
            codeSent={codeSent}
            countdown={countdown}
            loadingSend={loadingSend}
            loadingLogin={loadingLogin}
            error={error}
            onSendCode={handleSendCode}
            onSubmit={handleSmsLogin}
            agreed={agreed}
            onToggleAgreed={() => setAgreed((v) => !v)}
          />
        )}

        {/* ── 密码面板 ── */}
        {mode === 'pwd' && (
          <PwdPanel
            pwdPhone={pwdPhone}
            onPwdPhoneChange={setPwdPhone}
            pwdPass={pwdPass}
            onPwdPassChange={setPwdPass}
            showPwd={showPwd}
            onToggleShowPwd={() => setShowPwd((v) => !v)}
            onSubmit={handlePwdLogin}
            onSwitchToSms={() => switchMode('sms')}
            onForgotPassword={() => showToast('忘记密码 - 请使用验证码登录')}
            agreed={agreed}
            onToggleAgreed={() => setAgreed((v) => !v)}
          />
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-[#4A3035] text-white text-sm px-5 py-2.5 rounded-full z-50 whitespace-nowrap shadow-lg"
          style={{ animation: 'fadeIn .2s ease' }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}
