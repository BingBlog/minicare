/**
 * GuestReport 游客分析页
 *
 * 未登录状态下的分析页面，与小程序版本保持一致：
 * - 5个 Tab（生长/饮食/尿布/睡眠/健康）均可自由切换
 * - 生长 & 饮食 Tab：展示模拟图表数据 + 顶部"示例数据"提示
 * - 其他 Tab：直接展示登录引导
 * - 底部统一 LoginGuide
 */
import { useState } from 'react'
import LoginGuide from '@/components/LoginGuide'

type TabKey = 'growth' | 'feeding' | 'sleep' | 'diaper' | 'health'

const TAB_CONFIG: Array<{ key: TabKey; label: string }> = [
  { key: 'growth', label: '生长' },
  { key: 'feeding', label: '饮食' },
  { key: 'sleep', label: '睡眠' },
  { key: 'diaper', label: '尿布' },
  { key: 'health', label: '健康' },
]

export default function GuestReport() {
  const [activeTab, setActiveTab] = useState<TabKey>('growth')

  return (
    <div className="min-h-full bg-bg flex flex-col">
      {/* ── 页面标题 ── */}
      <div className="px-5 pt-12 pb-2 bg-bg flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[22px] font-extrabold text-[#4A3035] tracking-tight">
            分析
          </span>
          <span
            className="text-[11px] font-medium px-2 py-0.5 rounded-full"
            style={{ background: '#FFF0F4', color: '#F87098' }}
          >
            示例数据
          </span>
        </div>
        <div className="text-[13px] text-[#9A8090] mt-0.5">
          数据洞察
        </div>
      </div>

      {/* ── 横向 Tab 导航 ── */}
      <div className="px-5 py-2 bg-bg flex-shrink-0 border-b border-gray-100">
        <div className="flex gap-1 overflow-x-auto scrollbar-hide">
          {TAB_CONFIG.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium rounded-full whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? 'bg-[#F87098] text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 内容区 ── */}
      <div className="flex-1 overflow-y-auto pb-28 px-5 py-4">
        {activeTab === 'growth' && <GuestGrowthTab />}
        {activeTab === 'feeding' && <GuestFeedingTab />}
        {(activeTab === 'sleep' || activeTab === 'diaper' || activeTab === 'health') && (
          <div className="flex-1 flex items-center justify-center min-h-[300px]">
            <LoginGuide
              title="登录后查看分析"
              desc="登录后可查看宝宝的成长数据分析报告"
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ── 游客生长 Tab（模拟数据展示） ──────────────────────────────────

function GuestGrowthTab() {
  return (
    <div>
      {/* 提示横幅 */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 rounded-xl mb-4"
        style={{ background: '#FFF8FA', border: '1px solid #F5E8EC' }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="#F87098" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, flexShrink: 0 }}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <span className="text-[12px] text-[#9A8090]">
          示例数据，登录后将展示宝宝的真实生长曲线
        </span>
      </div>

      {/* 模拟生长曲线图占位 */}
      <div
        className="rounded-2xl overflow-hidden mb-4"
        style={{ background: '#fff', border: '1px solid #F5F0F2' }}
      >
        <div className="px-4 py-3 border-b border-[#F5F0F2]">
          <div className="text-[14px] font-bold text-[#4A3035]">体重曲线</div>
          <div className="text-[11px] text-[#9A8090]">0-8月龄 · WHO标准参考范围</div>
        </div>
        <div className="px-4 py-6">
          {/* 简化的模拟曲线 SVG */}
          <svg viewBox="0 0 300 120" className="w-full" style={{ height: 120 }}>
            {/* 参考区间（灰色底带） */}
            <path d="M 0 90 Q 75 70 150 50 T 300 20" fill="none" stroke="#F5F0F2" strokeWidth="20" strokeLinecap="round" opacity="0.6" />
            {/* P50 参考线 */}
            <path d="M 0 80 Q 75 60 150 40 T 300 15" fill="none" stroke="#E0D8DC" strokeWidth="1.5" strokeDasharray="4 3" />
            {/* 示例数据点连线 */}
            <path d="M 20 85 L 60 72 L 100 58 L 150 45 L 200 35 L 260 22" fill="none" stroke="#F87098" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            {/* 数据点 */}
            <circle cx="20" cy="85" r="4" fill="#F87098" />
            <circle cx="60" cy="72" r="4" fill="#F87098" />
            <circle cx="100" cy="58" r="4" fill="#F87098" />
            <circle cx="150" cy="45" r="4" fill="#F87098" />
            <circle cx="200" cy="35" r="4" fill="#F87098" />
            <circle cx="260" cy="22" r="4" fill="#F87098" />
          </svg>
          {/* X轴标签 */}
          <div className="flex justify-between mt-2 px-2">
            {['出生', '1月', '2月', '4月', '6月', '8月'].map((label) => (
              <span key={label} className="text-[10px] text-[#C0A8AD]">{label}</span>
            ))}
          </div>
        </div>
      </div>

      {/* 模拟身高曲线占位 */}
      <div
        className="rounded-2xl overflow-hidden mb-4"
        style={{ background: '#fff', border: '1px solid #F5F0F2' }}
      >
        <div className="px-4 py-3 border-b border-[#F5F0F2]">
          <div className="text-[14px] font-bold text-[#4A3035]">身长曲线</div>
          <div className="text-[11px] text-[#9A8090]">0-8月龄 · WHO标准参考范围</div>
        </div>
        <div className="px-4 py-6">
          <svg viewBox="0 0 300 120" className="w-full" style={{ height: 120 }}>
            <path d="M 0 95 Q 75 75 150 55 T 300 25" fill="none" stroke="#F5F0F2" strokeWidth="20" strokeLinecap="round" opacity="0.6" />
            <path d="M 0 85 Q 75 65 150 45 T 300 18" fill="none" stroke="#E0D8DC" strokeWidth="1.5" strokeDasharray="4 3" />
            <path d="M 20 90 L 60 78 L 100 64 L 150 50 L 200 38 L 260 26" fill="none" stroke="#5C6BC0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="20" cy="90" r="4" fill="#5C6BC0" />
            <circle cx="60" cy="78" r="4" fill="#5C6BC0" />
            <circle cx="100" cy="64" r="4" fill="#5C6BC0" />
            <circle cx="150" cy="50" r="4" fill="#5C6BC0" />
            <circle cx="200" cy="38" r="4" fill="#5C6BC0" />
            <circle cx="260" cy="26" r="4" fill="#5C6BC0" />
          </svg>
          <div className="flex justify-between mt-2 px-2">
            {['出生', '1月', '2月', '4月', '6月', '8月'].map((label) => (
              <span key={label} className="text-[10px] text-[#C0A8AD]">{label}</span>
            ))}
          </div>
        </div>
      </div>

      {/* 底部登录引导 */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: '#FFFBFC', border: '1px solid #F5F0F2' }}
      >
        <LoginGuide
          title="查看宝宝真实生长曲线"
          desc="登录后可查看宝宝的真实生长数据与 WHO 标准对比"
        />
      </div>
    </div>
  )
}

// ── 游客饮食 Tab（模拟数据展示） ──────────────────────────────────

function GuestFeedingTab() {
  return (
    <div>
      {/* 提示横幅 */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 rounded-xl mb-4"
        style={{ background: '#FFF8FA', border: '1px solid #F5E8EC' }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="#F87098" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, flexShrink: 0 }}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <span className="text-[12px] text-[#9A8090]">
          示例数据，登录后将展示宝宝的真实饮食分析
        </span>
      </div>

      {/* 模拟每日奶量趋势图 */}
      <div
        className="rounded-2xl overflow-hidden mb-4"
        style={{ background: '#fff', border: '1px solid #F5F0F2' }}
      >
        <div className="px-4 py-3 border-b border-[#F5F0F2]">
          <div className="text-[14px] font-bold text-[#4A3035]">每日奶量趋势</div>
          <div className="text-[11px] text-[#9A8090]">近14天 · 配方奶 + 母乳</div>
        </div>
        <div className="px-4 py-6">
          {/* 简化柱状图 */}
          <div className="flex items-end justify-between gap-1" style={{ height: 100 }}>
            {[65, 70, 55, 80, 75, 60, 85, 72, 68, 90, 78, 82, 75, 88].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-sm"
                style={{
                  height: `${h}%`,
                  background: i === 13 ? '#F87098' : '#FDDFE7',
                  minWidth: 8,
                }}
              />
            ))}
          </div>
          {/* 统计摘要 */}
          <div className="flex justify-between mt-3 pt-3 border-t border-[#F5F0F2]">
            <div className="text-center">
              <div className="text-[16px] font-bold text-[#4A3035]">680<span className="text-[11px] font-normal text-[#9A8090]">ml</span></div>
              <div className="text-[10px] text-[#9A8090]">日均奶量</div>
            </div>
            <div className="text-center">
              <div className="text-[16px] font-bold text-[#4A3035]">5.2<span className="text-[11px] font-normal text-[#9A8090]">次</span></div>
              <div className="text-[10px] text-[#9A8090]">日均喂养</div>
            </div>
            <div className="text-center">
              <div className="text-[16px] font-bold text-[#4A3035]">750<span className="text-[11px] font-normal text-[#9A8090]">ml</span></div>
              <div className="text-[10px] text-[#9A8090]">最高日量</div>
            </div>
          </div>
        </div>
      </div>

      {/* 底部登录引导 */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: '#FFFBFC', border: '1px solid #F5F0F2' }}
      >
        <LoginGuide
          title="查看宝宝真实饮食分析"
          desc="登录后可查看宝宝的喂养趋势和营养摄入分析"
        />
      </div>
    </div>
  )
}
