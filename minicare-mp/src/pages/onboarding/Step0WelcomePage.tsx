/**
 * Onboarding Step 0 — 引导介绍页
 *
 * 内容（与 Web Step0WelcomePage 一致）：
 *   - Logo 圆圈 + 产品标题副标题
 *   - 三张特性卡片（饮食追踪 / 全家记录 / 数据分析）
 *   - 底部「开始创建宝宝档案」按钮
 *   - 「直接进入首页」链接
 *
 * 差异化：
 *   - 导航：useNavigate → Taro.reLaunch
 *   - SVG 图标：MP 不支持内联 SVG，使用 Image + base64
 */
import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { getStatusBarHeight } from '@/lib/safeArea'

// ── 特性卡片数据（与 Web FEATURES 语义一致） ──────────────────────
const FEATURES = [
  {
    iconBg: '#FFF0F4',
    title: '饮食与表现追踪',
    desc: '记录每次进食与宝宝反应，轻松找到规律',
    // 叉勺 SVG base64
    iconSrc: 'data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI0Y4NzA5OCIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTMgMnY3YzAgMS4xLjkgMiAyIDJoNGEyIDIgMCAwIDAgMi0yVjIiLz48bGluZSB4MT0iNyIgeTE9IjIiIHgyPSI3IiB5Mj0iMTEiLz48cGF0aCBkPSJNMjEgMmMwIDQuNC0zLjYgOC04IDh2MTIiLz48L3N2Zz4=',
  },
  {
    iconBg: '#FFF8E6',
    title: '全家一起记录',
    desc: '爸妈、祖辈同步记录，不漏一次喂奶、一个细节',
    // 用户组 SVG base64
    iconSrc: 'data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI0REQjg3MCIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTE3IDIxdi0yYTQgNCAwIDAgMC00LTRIOS1hNCA0IDAgMCAwLTQgNHYyIi8+PGNpcmNsZSBjeD0iOSIgY3k9IjciIHI9IjQiLz48cGF0aCBkPSJNMjMgMjF2LTJhNCA0IDAgMCAwLTMtMy44NyIvPjxwYXRoIGQ9Ik0xNiAzLjEzYTQgNCAwIDAgMSAwIDcuNzUiLz48L3N2Zz4=',
  },
  {
    iconBg: '#DCFCE7',
    title: '数据分析与科学喂养',
    desc: '生长曲线、喂养规律一目了然，每天都在进步',
    // 趋势折线图 SVG base64
    iconSrc: 'data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzRDQUY4MiIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBvbHlsaW5lIHBvaW50cz0iMjIgMTIgMTggOCAxMyAxMyA5IDkgMiAxNiIvPjxsaW5lIHgxPSIyIiB5MT0iMjAiIHgyPSIyMiIgeTI9IjIwIi8+PC9zdmc+',
  },
]

interface Props {
  /** 点击「开始创建宝宝档案」 */
  onStart: () => void
}

export default function Step0WelcomePage({ onStart }: Props) {
  const handleGoHome = () => {
    Taro.reLaunch({ url: '/pages/home/index' })
  }

  return (
    <View
      className='welcome-page'
      style={{ paddingTop: `${getStatusBarHeight() + 24}px` }}
    >
      {/* 核心介绍区 */}
      <View className='welcome-page__hero'>
        {/* Logo 圆圈 */}
        <View className='welcome-page__logo'>
          <Image
            className='welcome-page__logo-icon'
            src='data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIxLjgiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNMTIgMmE0IDQgMCAwIDEgNCA0IDQgNCAwIDAgMS00IDQgNCA0IDAgMCAxLTQtNCA0IDQgMCAwIDEgNC00Ii8+PHBhdGggZD0iTTUgMjBhNyA3IDAgMCAxIDE0IDAiLz48Y2lyY2xlIGN4PSI5IiBjeT0iMTAuNSIgcj0iMSIgZmlsbD0iI2ZmZiIvPjxjaXJjbGUgY3g9IjE1IiBjeT0iMTAuNSIgcj0iMSIgZmlsbD0iI2ZmZiIvPjwvc3ZnPg=='
            mode='aspectFit'
          />
        </View>

        <Text className='welcome-page__title'>敏宝日记</Text>
        <Text className='welcome-page__subtitle'>记录每一口，呵护每一天</Text>

        {/* 特性卡片列表 */}
        <View className='welcome-page__features'>
          {FEATURES.map((item) => (
            <View key={item.title} className='welcome-page__feature-card'>
              <View
                className='welcome-page__feature-icon'
                style={{ background: item.iconBg }}
              >
                <Image
                  className='welcome-page__feature-icon-img'
                  src={item.iconSrc}
                  mode='aspectFit'
                />
              </View>
              <View className='welcome-page__feature-info'>
                <Text className='welcome-page__feature-title'>{item.title}</Text>
                <Text className='welcome-page__feature-desc'>{item.desc}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* 底部按钮区 */}
      <View className='welcome-page__footer'>
        <View className='welcome-page__cta' onClick={onStart}>
          <Text className='welcome-page__cta-text'>开始创建宝宝档案</Text>
        </View>
        <View className='welcome-page__skip'>
          <Text className='welcome-page__skip-label'>已有档案？ </Text>
          <Text className='welcome-page__skip-link' onClick={handleGoHome}>
            直接进入首页
          </Text>
        </View>
      </View>
    </View>
  )
}
