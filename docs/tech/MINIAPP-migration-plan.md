# minicare-web → 微信小程序 转换技术方案

> 制定时间：2026-04-19  
> 范围：minicare-web → minicare-miniapp（新建 Taro 工程）

---

## 一、项目概览与转换目标

### 现状分析

| 维度 | 当前 Web 实现 | 转换挑战 |
|---|---|---|
| **框架** | React 18 + TypeScript | 小程序用 WXML/WXSS/JS，不支持 React |
| **路由** | react-router-dom v6（Hash 模式） | 小程序用页面栈（`wx.navigateTo`） |
| **状态管理** | Zustand 5 + localStorage 持久化 | 小程序用 `wx.setStorage` 持久化 |
| **样式** | Tailwind CSS 3 | 小程序用 WXSS（CSS 子集） |
| **HTTP** | `fetch` + `localStorage` Token | 小程序用 `wx.request` + `wx.setStorageSync` |
| **图标** | SVG 内联组件（1627 行） | 小程序支持 SVG 但需要转换方式 |
| **图表** | Recharts（基于 SVG/Canvas） | 小程序用 `wx-charts` 或 `@antv/f2` |
| **认证** | JWT + CloudBase Web SDK | 小程序用 `wx.cloud` + 微信登录 |
| **拖拽排序** | @dnd-kit | 小程序用 movable-view 或自研 |
| **文件上传** | Fetch API | 小程序用 `wx.uploadFile` |
| **页面数量** | ~25 个页面 | 小程序每页面 4 文件（wxml/wxss/js/json） |

### 转换策略选择

有三条技术路线：

```
方案A：uni-app（Vue3 语法）     → 一套代码跨端，需学 Vue3
方案B：Taro（React 语法）       → 最接近现有代码，支持 React/TSX
方案C：原生微信小程序           → 性能最优，但改动量最大
```

**推荐选择：方案 B（Taro + React）**，原因：
- 现有代码全部是 React + TypeScript，Taro 支持 100% 复用逻辑层代码
- `hooks`、`zustand` 等生态可直接复用，**业务逻辑代码约 70% 可复用**
- 相比原生小程序，开发效率高 2-3 倍

---

## 二、技术栈选型

| 层级 | 选型 | 说明 |
|---|---|---|
| **小程序框架** | Taro 4.x + React | JD 出品，React 语法写小程序 |
| **UI 组件库** | NutUI-React | Taro 官方配套 UI 库 |
| **状态管理** | Zustand 5 | 直接复用，Taro 环境兼容 |
| **请求封装** | 自封装 `request.ts`（替换 fetch → wx.request） | |
| **认证** | 微信登录 → 后端换取 JWT | 替换 CloudBase Web SDK |
| **图表** | `@antv/f2`（4.x，支持 Taro） | 替换 Recharts |
| **日期** | `dayjs`（直接复用） | |
| **图标** | 将现有 SVG 组件转为 Taro Image/SVG | |
| **存储** | `wx.setStorageSync` 替换 `localStorage` | |
| **文件上传** | `wx.chooseMedia` + `wx.uploadFile` | |

---

## 三、目录结构设计

新建 `minicare-miniapp/`（与 `minicare-web/` 并列）：

```
minicare-miniapp/
├── config/
│   ├── index.ts          # Taro 基础配置
│   ├── dev.ts            # 开发环境配置
│   └── prod.ts           # 生产环境配置
├── src/
│   ├── app.tsx           # 小程序入口
│   ├── app.config.ts     # 小程序全局配置（页面列表、TabBar）
│   ├── app.scss          # 全局样式（替代 index.css + Tailwind）
│   │
│   ├── api/              # ✅ 大部分直接复用（替换 http.ts）
│   │   ├── http.ts       # 改写：fetch → wx.request，localStorage → wx.setStorage
│   │   ├── types.ts      # ✅ 100% 复用
│   │   ├── auth.ts       # ⚡ 改写微信登录流程
│   │   ├── baby.ts       # ✅ 复用
│   │   ├── babyFoods.ts  # ✅ 复用
│   │   ├── family.ts     # ✅ 复用
│   │   ├── report.ts     # ✅ 复用
│   │   ├── appConfig.ts  # ✅ 复用
│   │   ├── index.ts      # ✅ 复用
│   │   └── records/      # ✅ 全部复用（8 个子文件）
│   │
│   ├── lib/              # ✅ 大部分复用
│   │   ├── constants.ts        # ✅ 100% 复用
│   │   ├── store.ts            # ⚡ 替换 localStorage → wx.setStorage
│   │   ├── utils.ts            # ✅ 复用
│   │   ├── growth-standards.ts # ✅ 复用
│   │   ├── record-adapters.ts  # ✅ 复用
│   │   ├── records-sort.ts     # ✅ 复用
│   │   ├── useAppConfig.ts     # ✅ 复用
│   │   └── useQuickActionKeys.ts # ✅ 复用
│   │
│   ├── components/       # ⚡ 需要改写 JSX（HTML → Taro 组件）
│   │   ├── ui/
│   │   │   ├── icons.tsx        # ⚡ SVG 组件转换（保留 SVG 字符串）
│   │   │   ├── BottomSheet.tsx  # ⚡ 改写（div → View，动画方式不同）
│   │   │   ├── Toast.tsx        # ⚡ 改写为 wx.showToast 封装
│   │   │   ├── LoadingSpinner.tsx # ⚡ 改写
│   │   │   ├── EmptyState.tsx   # ⚡ 改写
│   │   │   └── SectionLabel.tsx # ⚡ 改写
│   │   ├── record/
│   │   │   ├── FilterChip.tsx
│   │   │   ├── RecordContent.tsx
│   │   │   ├── RecordTypeIcon.tsx
│   │   │   └── RecordsSortModeBar.tsx
│   │   ├── AppTabBar.tsx    # 🆕 自定义 TabBar 组件
│   │   ├── DatePicker.tsx   # ⚡ 改写（wx.picker）
│   │   └── TimePicker.tsx   # ⚡ 改写（wx.picker）
│   │
│   └── pages/            # ⚡ 全部需要 JSX 改写（逻辑可复用）
│       ├── login/
│       ├── onboarding/
│       ├── home/
│       ├── records-list/
│       ├── report/
│       ├── profile/
│       └── records/         # 记录表单页（8 种）
│           ├── feeding/
│           ├── sleep/
│           ├── diaper/
│           ├── activity/
│           ├── health/
│           ├── symptom/
│           ├── growth/
│           └── medical/
│
├── package.json
├── tsconfig.json
└── project.config.json   # 微信小程序项目配置（appid）
```

---

## 四、核心模块迁移详解

### 4.1 HTTP 请求层（最关键）

**原 Web 实现**（`src/api/http.ts`）基于 `fetch` + `localStorage`。

**小程序改写**（`src/api/http.ts`）：

```typescript
import Taro from '@tarojs/taro'

const BASE_URL = process.env.TARO_APP_API_BASE_URL

export function getToken(): string | null {
  return Taro.getStorageSync('minicare_token') || null
}
export function setToken(token: string): void {
  Taro.setStorageSync('minicare_token', token)
}
export function removeToken(): void {
  Taro.removeStorageSync('minicare_token')
}

export function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth = true, method = 'GET', body, headers: customHeaders } = options
  const header: Record<string, string> = {
    'Content-Type': 'application/json',
    ...customHeaders,
  }
  if (auth) {
    const token = getToken()
    if (token) header['Authorization'] = `Bearer ${token}`
  }
  return new Promise((resolve, reject) => {
    Taro.request({
      url: `${BASE_URL}${path}`,
      method: method as any,
      data: body ? JSON.parse(body as string) : undefined,
      header,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data as T)
        } else {
          reject(new Error(res.data?.message || `HTTP ${res.statusCode}`))
        }
      },
      fail: (err) => reject(new Error(err.errMsg)),
    })
  })
}
```

**关键点**：接口路径和 `types.ts` 等**完全不需要改动**，只改底层传输层。

---

### 4.2 认证流程重构（最大变化）

**Web 版**：手机号 + 验证码 → `POST /api/auth/verify-code` → JWT

**小程序版**：微信一键登录 → JWT

```typescript
// pages/login/index.tsx
async function handleWxLogin() {
  // 1. 获取微信登录 code
  const { code } = await Taro.login()
  // 2. 换取 JWT（后端新增接口）
  const { token, user } = await authApi.wxLogin({ code })
  setUser(user, token)
}
```

**后端需新增接口**（`POST /api/auth/wx-login`）：
1. 用 code 换取 openId（wx.code2Session）
2. 用 openId 查找或创建用户
3. 返回 JWT（与现有机制完全兼容）

---

### 4.3 状态管理（小改动）

Zustand 在 Taro 环境中**直接可用**，只需替换持久化 storage：

```typescript
// lib/store.ts 改动点
const taroStorage = {
  getItem:    (key: string) => Taro.getStorageSync(key),
  setItem:    (key: string, value: string) => Taro.setStorageSync(key, value),
  removeItem: (key: string) => Taro.removeStorageSync(key),
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({ /* 完全复用原有逻辑 */ }),
    {
      name: 'minicare-store',
      storage: createJSONStorage(() => taroStorage), // 只改这一行
    }
  )
)
```

---

### 4.4 路由系统（完全替换）

| Web 路由 | 小程序页面路径 | 导航方式 |
|---|---|---|
| `/login` | `pages/login/index` | `reLaunch`（清栈） |
| `/onboarding` | `pages/onboarding/index` | `reLaunch` |
| `/`（首页） | `pages/home/index` | TabBar |
| `/records` | `pages/records-list/index` | TabBar |
| `/report` | `pages/report/index` | TabBar |
| `/profile` | `pages/profile/index` | TabBar |
| `/records/form/feeding` | `pages/records/feeding/index` | `navigateTo` |
| `/records/form/sleep` | `pages/records/sleep/index` | `navigateTo` |
| `/records/form/diaper` | `pages/records/diaper/index` | `navigateTo` |
| `/records/form/*` | `pages/records/*/index` | `navigateTo` |

**AuthGuard 替代方案**：在每个需鉴权页面的 `useDidShow` 中检查 token：

```typescript
function useAuthCheck() {
  useDidShow(() => {
    if (!getToken()) Taro.reLaunch({ url: '/pages/login/index' })
  })
}
```

---

### 4.5 样式系统（替换 Tailwind CSS）

小程序不支持 Tailwind CSS，改用 CSS Modules（SCSS）+ 设计 Token：

```scss
/* app.scss - 设计 Token */
:root {
  --color-primary:    #F87098;
  --color-bg:         #FFF8FB;
  --color-text:       #2D2D2D;
  --color-text-muted: #999999;
  --color-border:     #F0E8EC;
  --color-danger:     #F05060;
  --radius-card:      20rpx;
  --radius-button:    40rpx;
  --spacing-page:     32rpx;
}
```

| Tailwind 类 | SCSS 等价 |
|---|---|
| `bg-primary` | `background: var(--color-primary)` |
| `text-gray-400` | `color: var(--color-text-muted)` |
| `rounded-3xl` | `border-radius: 24rpx` |
| `flex items-center` | `display: flex; align-items: center` |
| `p-4` | `padding: 32rpx` |

---

### 4.6 图标系统（极小改动）

现有 `icons.tsx` 是 SVG 内联组件，Taro 支持 SVG 元素语法，改动量约 5%：

```tsx
// Taro 版（几乎与 Web 版相同）
export const IconMilk = ({ size = 40, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}>
    <path ... />
  </svg>
)
// 只需：import 从 react → @tarojs/taro；尺寸单位酌情用 rpx
```

---

### 4.7 图表系统（替换 Recharts）

Recharts 基于 React DOM，**不兼容小程序**，替换为 `@antv/f2`（官方支持 Taro）：

| Recharts 组件 | F2 等价 |
|---|---|
| `LineChart` | `F2.Line` |
| `BarChart` | `F2.Interval` |
| `DonutChart` | `F2.Pie` |
| `ScatterChart` | `F2.Point` |
| `StackedBarChart` | `F2.Interval（stack）` |
| `GrowthChart` | `F2.Line + 参考线` |

```tsx
import { F2Canvas } from '@antv/f2-react'
import { Chart, Line, Axis, Tooltip } from '@antv/f2'

const FeedingLineChart = ({ data }) => (
  <F2Canvas>
    <Chart data={data}>
      <Axis field="date" /><Axis field="amount" />
      <Line x="date" y="amount" />
      <Tooltip />
    </Chart>
  </F2Canvas>
)
```

---

### 4.8 日期/时间选择器

改用小程序原生 Picker（体验更好）：

```tsx
import { Picker } from '@tarojs/components'

<Picker mode="date" onChange={(e) => setDate(e.detail.value)}>
  <View>{selectedDate || '请选择日期'}</View>
</Picker>

<Picker mode="time" onChange={(e) => setTime(e.detail.value)}>
  <View>{selectedTime || '请选择时间'}</View>
</Picker>
```

---

### 4.9 文件上传（图片上传改写）

```typescript
async function uploadImage() {
  const { tempFilePaths } = await Taro.chooseMedia({
    count: 1,
    mediaType: ['image'],
    sourceType: ['album', 'camera'],
  })
  const { uploadUrl, fileId } = await storageApi.getUploadUrl()
  await Taro.uploadFile({ url: uploadUrl, filePath: tempFilePaths[0], name: 'file' })
  return fileId
}
```

---

### 4.10 TabBar 配置

```typescript
// src/app.config.ts
export default defineAppConfig({
  pages: [
    'pages/home/index',
    'pages/records-list/index',
    'pages/report/index',
    'pages/profile/index',
    'pages/login/index',
    'pages/onboarding/index',
    'pages/records/feeding/index',
    'pages/records/sleep/index',
    'pages/records/diaper/index',
    'pages/records/activity/index',
    'pages/records/health/index',
    'pages/records/symptom/index',
    'pages/records/growth/index',
    'pages/records/medical/index',
  ],
  tabBar: {
    color: '#999999',
    selectedColor: '#F87098',
    backgroundColor: '#FFFFFF',
    list: [
      { pagePath: 'pages/home/index',         text: '首页', iconPath: 'assets/tab/home.png',    selectedIconPath: 'assets/tab/home-active.png' },
      { pagePath: 'pages/records-list/index', text: '记录', iconPath: 'assets/tab/record.png',  selectedIconPath: 'assets/tab/record-active.png' },
      { pagePath: 'pages/report/index',       text: '报告', iconPath: 'assets/tab/report.png',  selectedIconPath: 'assets/tab/report-active.png' },
      { pagePath: 'pages/profile/index',      text: '我的', iconPath: 'assets/tab/profile.png', selectedIconPath: 'assets/tab/profile-active.png' },
    ],
  },
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#FFFFFF',
    navigationBarTitleText: '敏宝日记',
    navigationBarTextStyle: 'black',
  },
  subPackages: [
    { root: 'pages/records', pages: ['feeding/index', 'sleep/index', 'diaper/index', 'activity/index', 'health/index', 'symptom/index', 'growth/index', 'medical/index'] },
    { root: 'pages/report',  pages: ['index'] },
  ],
})
```

> ⚠️ TabBar 图标**必须使用 PNG**，需从现有 SVG 导出 4 组正常态 + 选中态 PNG。

---

## 五、各页面改造量评估

| 页面/模块 | 逻辑复用率 | JSX 改动量 | 说明 |
|---|---|---|---|
| **api/ 全层** | 95% | 仅改 `http.ts` | 最高价值复用 |
| **lib/ 全层** | 90% | 仅改 `store.ts` storage | |
| **登录页** | 20% | 完全重写 | 微信登录流程完全不同 |
| **Onboarding** | 80% | 中等改动 | 表单逻辑复用，JSX 替换 |
| **首页** | 75% | 中等改动 | FAB 弹层、时间线 JSX 替换 |
| **记录列表页** | 75% | 中等改动 | 筛选、时间线 JSX 替换 |
| **喂养记录表单** | 80% | 中等改动 | 标签选择器、数字输入 |
| **睡眠记录表单** | 80% | 中等改动 | 计时器功能完全可用 |
| **其他 6 类记录表单** | 75-85% | 中等改动 | |
| **报告页** | 60% | 图表层替换 | Recharts → F2 |
| **我的页面** | 75% | 中等改动 | 成员管理、宝宝编辑 |
| **图标系统** | 95% | 极小 | SVG 语法基本相同 |
| **图表系统** | 0% | 完全重写 | Recharts → @antv/f2 |

---

## 六、后端改动需求

### 必须新增

```
POST /api/auth/wx-login
  body:   { code: string }         // wx.login() 获取的 code
  return: { token: string, user: User, isNewUser: boolean }

流程：
  1. code → wx.code2Session → openid
  2. 查 users 表是否存在 openid
  3. 不存在 → 新建用户
  4. 返回 JWT（与现有 JWT 完全兼容）
```

### 建议新增

```
POST /api/auth/wx-bind-phone
  body:   { phoneCode: string }    // wx.getPhoneNumber 授权 code
  return: { phone: string }        // 绑定结果（老用户手机号关联）
```

### 无需修改

所有业务接口（记录、报告、家庭、宝宝）**完全不用改动**，JWT 认证机制通用。

---

## 七、开发分阶段计划

### Phase 1：基础架构搭建（1 周）

- 初始化 Taro 工程（`minicare-miniapp/`）
- 配置 TypeScript、NutUI-React、环境变量
- 迁移 `api/` 和 `lib/` 层（改写 `http.ts`、`store.ts`）
- 迁移 `icons.tsx`（95% 复用）
- 配置 `app.config.ts`（页面列表、TabBar、分包）
- 后端新增 `/api/auth/wx-login` 接口

### Phase 2：登录 + Onboarding（3 天）

- 实现微信登录页（`wx.login` + 新接口）
- 添加"手机号绑定"入口（供老用户关联）
- 迁移 Onboarding 建档流程
- 验证端到端：登录 → JWT → 业务接口可用

### Phase 3：核心功能页面（2 周）

- Week 1：首页 + 8 种记录表单页（逻辑复用 75-85%）
- Week 2：记录列表页 + 我的页面

### Phase 4：报告 + 图表（1 周）

- 集成 `@antv/f2`（替换 Recharts）
- 实现 5 类数据图表：喂养/睡眠/尿布/健康/生长
- 报告生成 + 历史列表 + `wx.shareAppMessage` 分享

### Phase 5：测试 + 发布（1 周）

- 微信开发者工具真机预览调试
- 处理 iOS/Android 兼容性问题
- 申请上线权限（微信登录、getPhoneNumber）
- 提审 → 发布

---

## 八、关键注意事项与风险

### 8.1 微信小程序资质要求

| 权限 | 是否需要 | 申请条件 |
|---|---|---|
| `wx.login` | ✅ 必须 | 所有小程序默认具备 |
| `getPhoneNumber`（手机号） | ✅ 必须 | 需**企业主体**认证，个人主体不可用 |
| 用户隐私政策 | ✅ 必须 | 需提交隐私协议 URL |
| 医疗健康类目 | ⚠️ 可能需要 | 涉及"健康记录"，需选择正确类目 |

> ⚠️ **关键风险**：`getPhoneNumber` 需企业资质，若主体为个人，微信登录只能用 openId，需要另设手机号绑定流程。

### 8.2 小程序包大小限制

| 限制 | 数值 |
|---|---|
| 主包大小 | ≤ 2MB |
| 总包大小（含分包） | ≤ 20MB |

应对策略：使用**分包加载**（见 `app.config.ts`），图表库按需引入，图标用 SVG 字符串。

### 8.3 网络请求域名白名单

需将 CloudRun 域名加入小程序管理后台的 **request 合法域名**：

```
https://minicare-api-240137-10-1253854169.sh.run.tcloudbase.com
```

### 8.4 拖拽排序（快捷操作区）

首页 QuickActions 使用 `@dnd-kit` 实现拖拽排序，小程序不支持：

- **方案A**：小程序 `movable-view` 重写
- **方案B**：编辑模式 + 长按拖拽（推荐，与微信原生体验一致）
- **方案C**：去掉拖拽，改为设置项配置

---

## 九、总结

| 指标 | 数值 |
|---|---|
| 预计开发周期 | **6-7 周**（1 名前端全职） |
| 后端改动量 | **极小**（仅新增 1-2 个接口） |
| 代码复用率（逻辑层） | **~75%**（api/、lib/、hooks） |
| 代码复用率（视图层） | **~30%**（JSX 结构需改写） |
| 整体代码复用率 | **~55%** |
| 风险项 | 微信企业主体资质、包大小控制 |
| 推荐框架 | **Taro 4.x + React + NutUI-React** |

**核心结论**：选用 Taro 方案，整个 `api/` 层和 `lib/` 层几乎零改动即可复用，视图层通过系统性将 `div → View`、`span → Text`、`img → Image` 完成替换，图表和认证是最大的重构点，整体工程量可控。
