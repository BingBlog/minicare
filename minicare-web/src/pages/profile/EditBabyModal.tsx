/**
 * EditBabyModal 编辑宝宝档案底部弹层
 *
 * 表单内容：
 *   - 基本信息：昵称 / 出生日期 / 性别
 *   - 过敏信息：过敏类型（多选 Tag）/ 过敏程度（Segmented Control）
 *   - 底部：保存档案 + 取消 按钮
 *
 * 完全受控组件，所有表单状态均由父组件维护，
 * 通过 onChange 系列回调回传。
 *
 * 被引用：ProfilePage.tsx
 *
 * 注意：身高 / 体重 / 头围数据请在「生长记录」模块中录入，
 *       profile 页面仅展示最新数据，不再支持在此处写入。
 */
import DatePicker from '@/components/DatePicker'
import type { AllergyLevel, AllergyType } from '@/api'
import { ALLERGY_LEVEL_OPTIONS } from '@/lib/constants'
import { useAppConfig } from '@/lib/useAppConfig'
import { nowDate } from '@/pages/records/shared'

/** EditBabyModal 属性 */
interface EditBabyModalProps {
  /** 是否显示弹层 */
  open: boolean
  /** 是否正在保存（禁用按钮 + 改变文案） */
  saving: boolean

  // ── 表单受控值 ──────────────────────────────────────────────

  /** 宝宝昵称 */
  name: string
  onNameChange: (v: string) => void

  /** 出生日期（ISO yyyy-MM-dd 格式） */
  birthDate: string
  onBirthDateChange: (v: string) => void

  /**
   * 性别
   * "male" | "female"（不包含 "unknown"，编辑时只提供二选一）
   */
  gender: 'male' | 'female' | 'unknown'
  onGenderChange: (v: 'male' | 'female' | 'unknown') => void

  /** 已选过敏类型列表 */
  allergyTypes: AllergyType[]
  /** 切换某个过敏类型（选中则取消，未选中则添加） */
  onToggleAllergyType: (type: AllergyType) => void

  /** 当前选中的过敏程度 */
  allergyLevel: AllergyLevel
  onAllergyLevelChange: (v: AllergyLevel) => void

  // ── 操作回调 ──────────────────────────────────────────────

  /** 点击「保存档案」 */
  onSave: () => void
  /** 点击「取消」或蒙层 */
  onCancel: () => void
  /** 点击 CDC 评分标准链接 */
  onCdcHelp: () => void
}

/**
 * 编辑宝宝档案底部弹层
 *
 * 蒙层可点击关闭（触发 onCancel），弹层内容不冒泡。
 */
export default function EditBabyModal({
  open,
  saving,
  name,
  onNameChange,
  birthDate,
  onBirthDateChange,
  gender,
  onGenderChange,
  allergyTypes,
  onToggleAllergyType,
  allergyLevel,
  onAllergyLevelChange,
  onSave,
  onCancel,
  onCdcHelp,
}: EditBabyModalProps) {
  const { getLabel, getOptions } = useAppConfig()
  // 过敏原类型列表：优先从配置接口获取，回退为空数组（配置未加载时）
  const allergyTypeValues = getOptions('allergyType').map((o) => o.value as AllergyType)

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      // 点击蒙层关闭
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div
        className="w-full bg-white rounded-t-3xl overflow-hidden"
        style={{
          maxWidth: 430,
          margin: '0 auto',
          maxHeight: '92%',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
          overflowY: 'auto',
        }}
      >
        {/* 把手（Drag Handle）：居中细圆角条 */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* 弹层标题 */}
        <div className="text-center text-[17px] font-bold text-[#4A3035] py-3">编辑宝宝档案</div>

        {/* ── 基本信息 ── */}
        <div className="text-[12px] font-semibold text-[#9A8090] px-5 pb-1.5 tracking-[.3px]">
          基本信息
        </div>
        <div
          className="mx-4 bg-white rounded-2xl overflow-hidden mb-4"
          style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.07)' }}
        >
          {/* 宝宝昵称 */}
          <div
            className="flex items-center px-4 py-3.5"
            style={{ borderBottom: '1px solid #F5F0F2' }}
          >
            <span className="text-sm text-[#4A3035] flex-shrink-0">宝宝昵称</span>
            <input
              type="text"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="给宝宝起个名字"
              className="flex-1 text-right border-none outline-none bg-transparent text-sm text-[#4A3035] placeholder:text-[#C0A8AD]"
              maxLength={20}
            />
          </div>

          {/* 出生日期（使用公共 DatePicker 组件） */}
          <div
            className="flex items-center px-4 py-3.5"
            style={{ borderBottom: '1px solid #F5F0F2' }}
          >
            <DatePicker
              label="出生日期"
              value={birthDate}
              onChange={onBirthDateChange}
              max={nowDate()}
              min="2010-01-01"
              className="flex-1"
            />
          </div>

          {/* 性别选择（二选一胶囊按钮） */}
          <div className="flex items-center px-4 py-3.5">
            <span className="text-sm text-[#4A3035] flex-shrink-0">性别</span>
            <div className="flex-1 flex gap-2 justify-end">
              {(['male', 'female'] as const).map((g) => (
                <div
                  key={g}
                  onClick={() => onGenderChange(g)}
                  className="cursor-pointer px-4 py-1 rounded-full text-sm font-medium border transition-all"
                  style={
                    gender === g
                      ? { background: '#F87098', color: '#fff', borderColor: '#F87098' }
                      : { background: '#fff', color: '#9A8090', borderColor: '#E8E0E4' }
                  }
                >
                  {g === 'male' ? '男' : '女'}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── 过敏信息 ── */}
        <div className="text-[12px] font-semibold text-[#9A8090] px-5 pb-1.5 tracking-[.3px]">
          过敏信息
        </div>
        <div
          className="mx-4 bg-white rounded-2xl overflow-hidden mb-3"
          style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.07)' }}
        >
          <div className="px-4 py-3.5">
            <div className="text-[12px] font-semibold text-[#9A8090] mb-2">过敏类型</div>
            {/* 多选 Tag 组（选中时粉底粉字，未选中白底灰字） */}
            <div className="flex flex-wrap gap-2">
              {allergyTypeValues.map((type) => (
                <div
                  key={type}
                  onClick={() => onToggleAllergyType(type)}
                  className="cursor-pointer px-3 py-1.5 rounded-full text-[12px] font-medium border transition-all"
                  style={
                    allergyTypes.includes(type)
                      ? { background: '#FFF0F4', color: '#F87098', borderColor: '#F8B8CC' }
                      : { background: '#fff', color: '#9A8090', borderColor: '#E8E0E4' }
                  }
                >
                  {getLabel('allergyType', type)}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 过敏程度（分段控制器） */}
        <div className="text-[12px] font-semibold text-[#9A8090] px-5 pb-1.5 tracking-[.3px]">
          过敏程度
        </div>
        <div
          className="mx-4 flex rounded-2xl overflow-hidden p-1 mb-3"
          style={{ background: '#F5F0F2' }}
        >
          {ALLERGY_LEVEL_OPTIONS.map(({ value, label, activeColor }) => (
            <div
              key={value}
              onClick={() => onAllergyLevelChange(value)}
              className="flex-1 text-center py-2.5 rounded-xl cursor-pointer text-[13px] font-semibold transition-all"
              style={
                allergyLevel === value
                  ? {
                      background: '#fff',
                      color: activeColor,
                      boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                    }
                  : { color: '#9A8090' }
              }
            >
              {label}
            </div>
          ))}
        </div>

        {/* CDC 评分标准提示 */}
        <div className="mx-4 mb-6 px-3.5 py-2.5 rounded-xl" style={{ background: '#FFF0F4' }}>
          <div className="text-xs text-[#9A8090] leading-relaxed">
            {/* 信息圆圈图标（inline，与文字基线对齐） */}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ width: 13, height: 13, verticalAlign: -2, color: '#F87098', display: 'inline' }}
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {' '}不确定过敏程度？{' '}
            {/* CDC 全称：Centers for Disease Control（疾控中心），此处代指过敏标准评估 */}
            <span
              className="font-semibold cursor-pointer"
              style={{ color: '#F87098' }}
              onClick={onCdcHelp}
            >
              [查看 CDC 评分标准]
            </span>
          </div>
        </div>

        {/* ── 保存按钮（胶囊形，渐变色）── */}
        <div className="px-4">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="w-full py-4 text-white font-bold text-base border-none cursor-pointer transition-all active:scale-[0.97] disabled:opacity-60"
            style={{
              borderRadius: 50,
              background: 'linear-gradient(90deg, #F87098, #F9A8C0)',
              boxShadow: '0 6px 20px rgba(248,112,152,0.4)',
            }}
          >
            {saving ? '保存中…' : '保存档案'}
          </button>
        </div>

        {/* ── 取消按钮 ── */}
        <div className="px-4 mt-3">
          <button
            type="button"
            onClick={onCancel}
            className="w-full py-3.5 text-[#9A8090] font-semibold text-base border-none cursor-pointer transition-all active:scale-[0.97] rounded-2xl"
            style={{ background: '#F5F0F2' }}
          >
            取消
          </button>
        </div>

        <div className="h-6" />
      </div>
    </div>
  )
}