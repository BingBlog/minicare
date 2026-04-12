/**
 * IconGallery - 图标画廊对比页面
 *
 * 开发专用页面，路由 /dev/icons，无需鉴权
 * 展示当前项目图标，以及优化后的新 SVG 图标方案
 */
import { useState } from 'react'
import {
  // 记录类型图标
  IconMilk, IconMoon, IconDroplets, IconActivity,
  IconRuler, IconHeart, IconStethoscope, IconSmile, IconSupplementPill, IconThermometer,
  IconBreast, IconFood,
  // 新优化的图标
  IconBottle, IconBreastfeeding, IconDiaper, IconBabyCrawl,
  // 通用交互
  IconArrowLeft, IconChevronRight, IconChevronDown, IconPencil, IconPlus, IconClose,
  IconCopy, IconTrash, IconLogOut,
  // 设置类
  IconUsers, IconUserSingle, IconShare, IconPhone, IconTextSize, IconFileText,
  // 报告
  IconBarChart2, IconTrendingUp,
  // 状态
  IconLoader, IconWarn, IconInfo, IconBell, IconSearch, IconCamera,
  // 时间线语义
  IconPoop, IconDrop, IconLeaf, IconBath, IconSun, IconPlay2, IconBaby, IconRun,
  IconFaceHappy, IconFaceNeutral, IconFaceFussy, IconFaceCrying,
  IconHospital, IconPill, IconAlertTriangle, IconZap, IconClock,
  // 医疗
  IconMicroscope, IconSyringe, IconBloodDrop,
  // 辅食
  IconGrain, IconVegetable, IconFruit, IconMeatEgg, IconBean,
  // 其他
  IconWave,
  type IconProps,
} from '@/components/ui/icons'
import { RECORD_TYPE_CFG } from '@/lib/constants'

// ─────────────────────────────────────────────────────────────────────────────
// Section A: 当前项目图标分类
// ─────────────────────────────────────────────────────────────────────────────

const CURRENT_ICONS = {
  '记录类型': [
    { name: 'Milk', comp: IconMilk, label: '配方奶/饮食' },
    { name: 'Moon', comp: IconMoon, label: '睡眠' },
    { name: 'Droplets', comp: IconDroplets, label: '尿布' },
    { name: 'Activity', comp: IconActivity, label: '活动' },
    { name: 'Ruler', comp: IconRuler, label: '生长' },
    { name: 'Heart', comp: IconHeart, label: '健康' },
    { name: 'Stethoscope', comp: IconStethoscope, label: '医疗' },
    { name: 'Smile', comp: IconSmile, label: '表现' },
    { name: 'SupplementPill', comp: IconSupplementPill, label: '营养素' },
    { name: 'Thermometer', comp: IconThermometer, label: '体温' },
    { name: 'Breast', comp: IconBreast, label: '母乳' },
    { name: 'Food', comp: IconFood, label: '辅食' },
  ],
  '通用交互': [
    { name: 'ArrowLeft', comp: IconArrowLeft, label: '返回' },
    { name: 'ChevronRight', comp: IconChevronRight, label: '右箭头' },
    { name: 'ChevronDown', comp: IconChevronDown, label: '下箭头' },
    { name: 'Pencil', comp: IconPencil, label: '编辑' },
    { name: 'Plus', comp: IconPlus, label: '新增' },
    { name: 'Close', comp: IconClose, label: '关闭' },
    { name: 'Copy', comp: IconCopy, label: '复制' },
    { name: 'Trash', comp: IconTrash, label: '删除' },
    { name: 'LogOut', comp: IconLogOut, label: '退出' },
  ],
  '设置类': [
    { name: 'Users', comp: IconUsers, label: '家庭成员' },
    { name: 'UserSingle', comp: IconUserSingle, label: '用户' },
    { name: 'Share', comp: IconShare, label: '分享' },
    { name: 'Phone', comp: IconPhone, label: '手机' },
    { name: 'TextSize', comp: IconTextSize, label: '字体' },
    { name: 'FileText', comp: IconFileText, label: '文档' },
  ],
  '报告': [
    { name: 'BarChart2', comp: IconBarChart2, label: '柱状图' },
    { name: 'TrendingUp', comp: IconTrendingUp, label: '趋势' },
  ],
  '状态': [
    { name: 'Loader', comp: IconLoader, label: '加载' },
    { name: 'Warn', comp: IconWarn, label: '警告' },
    { name: 'Info', comp: IconInfo, label: '信息' },
    { name: 'Bell', comp: IconBell, label: '通知' },
    { name: 'Search', comp: IconSearch, label: '搜索' },
    { name: 'Camera', comp: IconCamera, label: '相机' },
  ],
  '时间线语义': [
    { name: 'Poop', comp: IconPoop, label: '大便' },
    { name: 'Drop', comp: IconDrop, label: '水滴' },
    { name: 'Leaf', comp: IconLeaf, label: '干净' },
    { name: 'Bath', comp: IconBath, label: '洗澡' },
    { name: 'Sun', comp: IconSun, label: '户外' },
    { name: 'Play2', comp: IconPlay2, label: '玩耍' },
    { name: 'Baby', comp: IconBaby, label: '俯趴' },
    { name: 'Run', comp: IconRun, label: '跑步' },
    { name: 'FaceHappy', comp: IconFaceHappy, label: '开心' },
    { name: 'FaceNeutral', comp: IconFaceNeutral, label: '平静' },
    { name: 'FaceFussy', comp: IconFaceFussy, label: '烦躁' },
    { name: 'FaceCrying', comp: IconFaceCrying, label: '哭闹' },
    { name: 'Hospital', comp: IconHospital, label: '医院' },
    { name: 'Pill', comp: IconPill, label: '药片' },
    { name: 'AlertTriangle', comp: IconAlertTriangle, label: '过敏警告' },
    { name: 'Zap', comp: IconZap, label: '精神活跃' },
    { name: 'Clock', comp: IconClock, label: '进行中' },
  ],
  '医疗': [
    { name: 'Microscope', comp: IconMicroscope, label: '显微镜' },
    { name: 'Syringe', comp: IconSyringe, label: '注射器' },
    { name: 'BloodDrop', comp: IconBloodDrop, label: '血液检查' },
  ],
  '辅食分类': [
    { name: 'Grain', comp: IconGrain, label: '主食' },
    { name: 'Vegetable', comp: IconVegetable, label: '蔬菜' },
    { name: 'Fruit', comp: IconFruit, label: '水果' },
    { name: 'MeatEgg', comp: IconMeatEgg, label: '肉蛋' },
    { name: 'Bean', comp: IconBean, label: '豆制品' },
  ],
  '其他': [
    { name: 'Wave', comp: IconWave, label: '挥手' },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// Section B: 优化后的新图标设计（纯内联 SVG，不引入第三方库）
// 每个图标均手工绘制，保持与现有图标库相同的视觉规范：
//   - viewBox="0 0 24 24"
//   - strokeWidth="1.5"，strokeLinecap="round"，strokeLinejoin="round"
//   - fill="none"（stroke-only 风格）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 新图标：宝宝表现/状态
 * 设计：婴儿脸 + 表情符号结合 — 圆脸 + 大眼 + 可切换表情曲线
 * 加上心跳/活力线，暗示"观察宝宝状态"
 */
const IconBabyMoodNew = ({ size = 24, color = 'currentColor' }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size }}>
    {/* 脸圆 */}
    <circle cx="12" cy="12" r="9" />
    {/* 左眼 */}
    <circle cx="9.5" cy="10" r="1" fill={color} stroke="none" />
    {/* 右眼 */}
    <circle cx="14.5" cy="10" r="1" fill={color} stroke="none" />
    {/* 嘴巴（中性/略向上） */}
    <path d="M9 14.5c0 0 1 1.5 3 1.5s3-1.5 3-1.5" />
    {/* 脸颊腮红（两个短弧，萌感） */}
    <path d="M7 13c.3.5.8.8 1.3.8" strokeWidth="1" />
    <path d="M17 13c-.3.5-.8.8-1.3.8" strokeWidth="1" />
  </svg>
)

// ─────────────────────────────────────────────────────────────────────────────
// 优化图标列表（带 before/after 对比数据）
// ─────────────────────────────────────────────────────────────────────────────

const REDESIGNED_ICONS = [
  {
    key: 'formula',
    label: '配方奶',
    issue: '当前 IconMilk 瓶身形态抽象，不像奶瓶',
    oldComp: IconMilk,
    oldName: 'IconMilk（旧）',
    newComp: IconBottle,
    newName: 'IconBottle（已入库）',
    design: '宽圆底瓶身 + 肩部收颈 + 奶嘴帽 + 三条刻度线，一眼辨认为婴儿奶瓶',
    cfg: RECORD_TYPE_CFG['formula'],
  },
  {
    key: 'breast',
    label: '母乳',
    issue: '当前自绘弧线语义模糊，视觉较奇特',
    oldComp: IconBreast,
    oldName: 'IconBreast（旧）',
    newComp: IconBreastfeeding,
    newName: 'IconBreastfeeding（已入库）',
    design: '妈妈圆头 + 弯曲手臂 + 怀中小婴儿头部，剪影式哺乳场景',
    cfg: RECORD_TYPE_CFG['breast'],
  },
  {
    key: 'diaper',
    label: '尿布',
    issue: '当前用水滴（Droplets），与尿布语义完全不符',
    oldComp: IconDroplets,
    oldName: 'IconDroplets（旧）',
    newComp: IconDiaper,
    newName: 'IconDiaper（已入库）',
    design: '展开尿布俯视轮廓：上下宽、中间收腰的梯形体，两侧腰贴耳翼',
    cfg: RECORD_TYPE_CFG['diaper'],
  },
  {
    key: 'activity',
    label: '活动',
    issue: '当前用医疗脉搏波形（Activity），有歧义，容易误解为心率',
    oldComp: IconActivity,
    oldName: 'IconActivity（旧）',
    newComp: IconBabyCrawl,
    newName: 'IconBabyCrawl（已入库）',
    design: '婴儿爬行姿势：圆头 + 背部弧线 + 前臂撑地 + 后腿跪撑，直观表达宝宝活动',
    cfg: RECORD_TYPE_CFG['activity'],
  },
  {
    key: 'symptom',
    label: '表现',
    issue: '当前用笑脸（Smile），表达的是情绪，不能代表"症状/状态观察"',
    oldComp: IconSmile,
    oldName: 'IconSmile（旧）',
    newComp: IconBabyMoodNew,
    newName: 'IconBabyMood（待入库）',
    design: '圆脸宝宝 + 点状大眼 + 中性嘴型 + 腮红，表达"观察宝宝表现"',
    cfg: RECORD_TYPE_CFG['symptom'],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// UI 组件
// ─────────────────────────────────────────────────────────────────────────────

function IconCard({ name, Comp, label }: {
  name: string
  Comp: React.ComponentType<IconProps>
  label: string
}) {
  const key = name.replace(/^Icon/, '').toLowerCase()
  const cfg = RECORD_TYPE_CFG[key] ?? { bg: '#F5F5F5', color: '#9A8090' }
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex items-center justify-center rounded-xl"
        style={{ width: 56, height: 56, background: cfg.bg }}>
        <Comp size={28} color={cfg.color} />
      </div>
      <span className="text-[11px] text-gray-600 font-medium text-center leading-tight">{name}</span>
      <span className="text-[10px] text-gray-400">{label}</span>
    </div>
  )
}

function RedesignCard({ item }: { item: typeof REDESIGNED_ICONS[0] }) {
  const OldIcon = item.oldComp
  const NewIcon = item.newComp
  const cfg = item.cfg

  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
      {/* 标题行 */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-base font-bold text-gray-800">{item.label}</span>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-600 border border-amber-200">
          语义优化
        </span>
      </div>

      {/* 问题描述 */}
      <p className="text-xs text-gray-500 mb-5 leading-relaxed">
        <span className="text-red-400 font-medium">当前问题：</span>{item.issue}
      </p>

      {/* 图标对比区 */}
      <div className="flex items-stretch gap-4">
        {/* 旧图标 */}
        <div className="flex-1 flex flex-col items-center gap-3">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">当前</div>
          <div className="flex flex-col items-center gap-2">
            {/* 小尺寸（快捷入口 B 区） */}
            <div className="flex items-center justify-center rounded-xl"
              style={{ width: 44, height: 44, background: cfg?.bg ?? '#F5F5F5' }}>
              <OldIcon size={22} color={cfg?.color ?? '#9A8090'} />
            </div>
            {/* 大尺寸（快捷入口 A 区） */}
            <div className="flex items-center justify-center rounded-2xl"
              style={{ width: 60, height: 60, background: cfg?.bg ?? '#F5F5F5' }}>
              <OldIcon size={30} color={cfg?.color ?? '#9A8090'} />
            </div>
          </div>
          <div className="text-[10px] text-gray-400 text-center">{item.oldName}</div>
        </div>

        {/* 箭头 */}
        <div className="flex items-center text-gray-300 text-xl font-light self-center">→</div>

        {/* 新图标 */}
        <div className="flex-1 flex flex-col items-center gap-3">
          <div className="text-[10px] font-semibold text-green-500 uppercase tracking-wider">优化后</div>
          <div className="flex flex-col items-center gap-2">
            {/* 小尺寸 */}
            <div className="flex items-center justify-center rounded-xl ring-2 ring-green-200"
              style={{ width: 44, height: 44, background: cfg?.bg ?? '#F5F5F5' }}>
              <NewIcon size={22} color={cfg?.color ?? '#9A8090'} />
            </div>
            {/* 大尺寸 */}
            <div className="flex items-center justify-center rounded-2xl ring-2 ring-green-200"
              style={{ width: 60, height: 60, background: cfg?.bg ?? '#F5F5F5' }}>
              <NewIcon size={30} color={cfg?.color ?? '#9A8090'} />
            </div>
          </div>
          <div className="text-[10px] text-green-600 text-center font-medium">{item.newName}</div>
        </div>
      </div>

      {/* 设计说明 */}
      <div className="mt-4 pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-500 leading-relaxed">
          <span className="text-green-600 font-medium">设计说明：</span>{item.design}
        </p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 主组件
// ─────────────────────────────────────────────────────────────────────────────

type TabKey = 'current' | 'redesign'

export default function IconGallery() {
  const [activeTab, setActiveTab] = useState<TabKey>('redesign')

  return (
    <div className="min-h-screen bg-[#F9F5F2]">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <h1 className="text-xl font-bold text-gray-800">Icon Gallery</h1>
          <p className="text-sm text-gray-500 mt-0.5">图标优化预览 · 纯内联 SVG，不引入第三方库</p>
        </div>

        {/* Tabs */}
        <div className="max-w-4xl mx-auto px-4 flex gap-3 border-t border-gray-100 pt-3">
          {([
            { key: 'redesign' as TabKey, label: '优化方案预览', badge: '5 个优化' },
            { key: 'current' as TabKey, label: '当前全量图标', badge: '' },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-full transition-colors ${
                activeTab === tab.key
                  ? 'bg-[#F87098] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tab.label}
              {tab.badge && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-600'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-6">

        {/* ── Tab: 优化预览 ── */}
        {activeTab === 'redesign' && (
          <div>
            {/* 说明 */}
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-6">
              <h3 className="text-sm font-semibold text-blue-800 mb-1">优化原则</h3>
              <ul className="text-xs text-blue-700 space-y-1 leading-relaxed">
                <li>· 不引入任何第三方库，所有图标均为手工绘制的内联 SVG</li>
                <li>· 保持现有规范：viewBox 0 0 24 24，strokeWidth 1.5，stroke 风格</li>
                <li>· 新图标命名直接替换对应的旧函数，RecordTypeIcon 映射无需改动</li>
                <li>· 每个图标在"小尺寸（44px）"和"大尺寸（60px）"两种场景下均验证清晰度</li>
              </ul>
            </div>

            {/* 对比卡片列表 */}
            <div className="grid grid-cols-1 gap-5">
              {REDESIGNED_ICONS.map(item => (
                <RedesignCard key={item.key} item={item} />
              ))}
            </div>

            {/* 实施说明 */}
            <div className="mt-6 bg-white rounded-2xl p-5 border border-gray-100">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">实施步骤</h3>
              <ol className="text-xs text-gray-600 space-y-2 leading-relaxed">
                <li><span className="font-semibold text-[#F87098]">Step 1</span> — 将上述新图标的 SVG 代码复制到 <code className="bg-gray-100 px-1 py-0.5 rounded">src/components/ui/icons.tsx</code>，替换对应的旧函数体</li>
                <li><span className="font-semibold text-[#F87098]">Step 2</span> — <code className="bg-gray-100 px-1 py-0.5 rounded">RecordTypeIcon.tsx</code> 中的 ICON_MAP 映射无需改动（函数名保持一致）</li>
                <li><span className="font-semibold text-[#F87098]">Step 3</span> — 在真实页面（首页快捷区、记录列表）中目视检查效果，根据实际渲染再微调路径</li>
                <li><span className="font-semibold text-[#F87098]">注意</span> — IconDiaper 是全新名称（原为 IconDroplets 用于尿布语义），需要在 ICON_MAP 中同步更新 key 映射</li>
              </ol>
            </div>
          </div>
        )}

        {/* ── Tab: 当前全量图标 ── */}
        {activeTab === 'current' && (
          <div className="space-y-6">
            {Object.entries(CURRENT_ICONS).map(([category, icons]) => (
              <div key={category}>
                <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <span>{category}</span>
                  <span className="text-[10px] font-normal text-gray-400">{icons.length} 个</span>
                </h2>
                <div className="grid grid-cols-5 gap-3 sm:grid-cols-6 md:grid-cols-8">
                  {icons.map(icon => (
                    <IconCard
                      key={icon.name}
                      name={`Icon${icon.name}`}
                      Comp={icon.comp}
                      label={icon.label}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
