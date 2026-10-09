/**
 * 登录成功后的统一跳转逻辑
 *
 * 从 `pages/login/index.tsx` 抽出（TECH-016 §5.3），供**验证码登录**与**密码登录**共用，
 * 避免两份逻辑各自漂移。
 *
 * 分支：
 *   - 无宝宝档案且无待处理邀请 → 引导建档页
 *   - 有待处理家庭邀请         → 首页（由首页弹窗承接）
 *   - 否则                     → 选中家庭/宝宝后进首页
 */
import Taro from '@tarojs/taro'
import { babyApi, familyApi } from '@/api'
import { getCurrentFamilyId, setCurrentFamilyId, setCurrentBabyId } from '@/api/http'

const ONBOARDING = '/pages/onboarding/index'
const HOME = '/pages/home/index'

export async function afterLogin(): Promise<void> {
  let babies: any[] = []
  let pendingInvites: any[] = []

  try {
    ;[babies, pendingInvites] = await Promise.all([
      // 我名下的宝宝；接口异常时回退到「家庭 → 宝宝」两级查询
      babyApi.getMine().catch(async () => {
        const families = await familyApi.getMine()
        if (!families.length) return []
        const fid = getCurrentFamilyId(families)!
        setCurrentFamilyId(fid)
        try {
          const baby = await babyApi.get(fid)
          return [
            {
              ...baby,
              family_id: fid,
              family_name: families.find((f) => f.id === fid)?.name,
              family_role: families.find((f) => f.id === fid)?.role,
            },
          ]
        } catch {
          return []
        }
      }),
      familyApi.getPendingInvites().catch(() => []),
    ])
  } catch {
    Taro.reLaunch({ url: ONBOARDING })
    return
  }

  if (!babies.length && !pendingInvites.length) {
    Taro.reLaunch({ url: ONBOARDING })
    return
  }

  if (pendingInvites.length > 0) {
    Taro.reLaunch({ url: HOME })
    return
  }

  const baby = babies[0]
  setCurrentFamilyId(baby.family_id)
  setCurrentBabyId(baby.id)
  Taro.reLaunch({ url: HOME })
}
