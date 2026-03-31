/**
 * 登录页顶部插画区
 *
 * 内容：
 *   - 粉色渐变背景（180deg）
 *   - 装饰性场景元素：太阳 / 云朵 / 小路 / 丘陵 / 地面 / 小树 / 风车
 *   - 左上角「登录」标题 + 右上角「注册」链接
 *
 * Props：
 *   onSwitchToRegister  点击「注册」时的回调（切换到 sms Tab）
 */

interface Props {
  /** 点击右上角「注册」链接 */
  onSwitchToRegister: () => void;
}

export default function LoginHero({ onSwitchToRegister }: Props) {
  return (
    <div
      className="relative overflow-hidden flex-shrink-0"
      style={{
        height: 220,
        background: 'linear-gradient(180deg, #F87098 0%, #F9A8C0 60%, #FBCAD8 100%)',
      }}
    >
      {/* 太阳 */}
      <div
        className="absolute rounded-full bg-white/90"
        style={{ top: 30, left: 28, width: 34, height: 34, boxShadow: '0 0 0 8px rgba(255,255,255,.2)' }}
      />

      {/* 云朵 */}
      <div className="absolute bg-white/18 rounded-full" style={{ width: 60, height: 18, top: 50, right: 40 }} />
      <div className="absolute bg-white/18 rounded-full" style={{ width: 80, height: 22, top: 42, right: 20 }} />
      <div className="absolute bg-white/18 rounded-full" style={{ width: 45, height: 15, top: 80, left: 80 }} />

      {/* 小路 */}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-t-full"
        style={{ width: 30, height: 100, background: 'linear-gradient(to bottom, rgba(255,240,180,0.6), rgba(255,220,120,0.3))' }}
      />

      {/* 丘陵 */}
      <div
        className="absolute bottom-5 left-0 right-0"
        style={{ height: 50, background: 'rgba(245,160,180,0.4)', borderRadius: '50% 50% 0 0 / 30px 30px 0 0' }}
      />

      {/* 地面 */}
      <div
        className="absolute bottom-0 left-0 right-0"
        style={{ height: 60, background: 'rgba(248,180,195,0.5)', borderRadius: '60% 60% 0 0 / 30px 30px 0 0' }}
      />

      {/* 小树 × 2 */}
      <div className="absolute flex flex-col items-center" style={{ bottom: 28, left: 22 }}>
        <div style={{ width: 18, height: 24, borderRadius: '50%', background: 'rgba(240,100,130,0.7)' }} />
        <div style={{ width: 4, height: 10, background: 'rgba(200,80,110,0.5)' }} />
      </div>
      <div className="absolute flex flex-col items-center" style={{ bottom: 32, left: 42 }}>
        <div style={{ width: 14, height: 18, borderRadius: '50%', background: 'rgba(240,100,130,0.7)' }} />
        <div style={{ width: 4, height: 8, background: 'rgba(200,80,110,0.5)' }} />
      </div>

      {/* 风车 */}
      <div className="absolute" style={{ bottom: 24, right: 60 }}>
        <div style={{ width: 0, height: 0, borderLeft: '12px solid transparent', borderRight: '12px solid transparent', borderBottom: '10px solid rgba(180,60,90,0.4)', margin: '0 auto' }} />
        <div style={{ width: 20, height: 14, background: 'rgba(220,80,110,0.5)', borderRadius: '4px 4px 0 0', margin: '0 auto' }} />
        <div style={{ width: 16, height: 30, background: 'rgba(240,120,150,0.5)', margin: '0 auto', borderRadius: 2 }} />
      </div>

      {/* 顶部标题栏 */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 pt-10">
        <div className="text-lg font-bold text-white">登录</div>
        <div
          className="text-sm text-white/90 cursor-pointer font-medium"
          onClick={onSwitchToRegister}
        >
          注册
        </div>
      </div>
    </div>
  );
}
