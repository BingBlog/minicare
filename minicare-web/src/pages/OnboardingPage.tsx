/**
 * 新用户引导页 — 创建家庭 + 添加宝宝
 * 流程：创建家庭 → 创建宝宝档案 → 跳首页
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { familyApi, babyApi } from '@/lib/api'
import { useAppStore } from '@/lib/store'

const genderOptions = [
  { value: 'female', label: '👧 女宝宝', active: 'border-primary bg-[#FFF0F4] text-primary' },
  { value: 'male', label: '👦 男宝宝', active: 'border-teal bg-teal-light text-teal-dark' },
  { value: 'unknown', label: '🐣 神秘宝宝', active: 'border-yellow bg-yellow-light text-yellow-dark' },
] as const

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { setCurrentFamily, setCurrentBaby } = useAppStore()

  const [familyName, setFamilyName] = useState('')
  const [babyName, setBabyName] = useState('')
  const [gender, setGender] = useState<'male' | 'female' | 'unknown'>('female')
  const [birthDate, setBirthDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!familyName.trim()) {
      setError('请输入家庭名称')
      return
    }
    if (!babyName.trim() || !birthDate) {
      setError('请填写宝宝姓名和生日')
      return
    }

    setLoading(true)
    setError('')

    try {
      // 1. 创建家庭
      const family = await familyApi.create(familyName.trim())
      setCurrentFamily(family)

      // 2. 创建宝宝档案
      const baby = await babyApi.create(family.id, {
        name: babyName.trim(),
        gender,
        birthDate,
      })
      setCurrentBaby(baby)

      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-6 py-10">
      <div className="text-center mb-8">
        <div className="text-5xl mb-3">🍼</div>
        <h1 className="text-2xl font-bold text-text">开始记录宝宝成长</h1>
        <p className="text-sm text-subtext mt-1">创建家庭，添加第一个宝宝</p>
      </div>

      <div className="w-full max-w-sm bg-white rounded-2xl shadow-md p-6">
        <form onSubmit={handleCreate} className="space-y-5">
          {/* 家庭名称 */}
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">家庭名称</label>
            <input
              type="text"
              placeholder="例如：幸福之家"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              className="w-full h-12 px-4 rounded-xl border border-border bg-gray-50 text-text placeholder-subtext focus:outline-none focus:border-primary focus:bg-white transition-colors"
              maxLength={30}
            />
          </div>

          {/* 宝宝姓名 */}
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">宝宝叫什么？</label>
            <input
              type="text"
              placeholder="例如：小果子"
              value={babyName}
              onChange={(e) => setBabyName(e.target.value)}
              className="w-full h-12 px-4 rounded-xl border border-border bg-gray-50 text-text placeholder-subtext focus:outline-none focus:border-primary focus:bg-white transition-colors"
              maxLength={20}
            />
          </div>

          {/* 性别 */}
          <div>
            <label className="block text-sm font-medium text-text mb-2">性别</label>
            <div className="flex gap-2">
              {genderOptions.map(({ value, label, active }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setGender(value)}
                  className={`flex-1 h-10 text-sm font-medium rounded-xl border-2 transition-all ${
                    gender === value ? active : 'border-border text-subtext bg-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 出生日期 */}
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">出生日期</label>
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              className="w-full h-12 px-4 rounded-xl border border-border bg-gray-50 text-text focus:outline-none focus:border-primary focus:bg-white transition-colors"
            />
          </div>

          {error && (
            <div className="text-sm text-red-500 bg-red-50 px-4 py-2.5 rounded-lg">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-primary text-white font-semibold rounded-xl shadow-md shadow-primary/30 active:scale-[0.98] transition-all disabled:opacity-60"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                创建中...
              </span>
            ) : '开始记录 ✨'}
          </button>
        </form>
      </div>
    </div>
  )
}
