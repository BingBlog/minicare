/**
 * 应用路由配置
 * 使用 Hash 模式（#/home），静态托管刷新不会 404
 */
import { lazy, Suspense } from 'react'
import { createHashRouter } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import AuthGuard from './components/AuthGuard'

// 懒加载页面
const LoginPage       = lazy(() => import('./pages/LoginPage'))
const HomePage        = lazy(() => import('./pages/HomePage'))
const RecordsPage     = lazy(() => import('./pages/RecordsPage'))
const ProfilePage     = lazy(() => import('./pages/ProfilePage'))
const OnboardingPage  = lazy(() => import('./pages/OnboardingPage'))
const ReportPage      = lazy(() => import('./pages/ReportPage'))
const NotFoundPage    = lazy(() => import('./pages/NotFoundPage'))

// 记录表单页（带路径前缀 /records/xxx）
const FeedingFormPage  = lazy(() => import('./pages/records/FeedingFormPage'))
const SleepFormPage    = lazy(() => import('./pages/records/SleepFormPage'))
const DiaperFormPage   = lazy(() => import('./pages/records/DiaperFormPage'))
const ActivityFormPage = lazy(() => import('./pages/records/ActivityFormPage'))
const HealthFormPage   = lazy(() => import('./pages/records/HealthFormPage'))
const SymptomFormPage  = lazy(() => import('./pages/records/SymptomFormPage'))
const GrowthFormPage   = lazy(() => import('./pages/records/GrowthFormPage'))
const MedicalFormPage  = lazy(() => import('./pages/records/MedicalFormPage'))

const Loading = () => (
  <div className="flex items-center justify-center h-screen bg-bg">
    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
)

const S = (C: React.LazyExoticComponent<any>) => (
  <Suspense fallback={<Loading />}><C /></Suspense>
)

export const router = createHashRouter([
  {
    path: '/login',
    element: S(LoginPage),
  },
  {
    path: '/onboarding',
    element: (
      <AuthGuard>
        {S(OnboardingPage)}
      </AuthGuard>
    ),
  },
  {
    path: '/',
    element: (
      <AuthGuard>
        <AppLayout />
      </AuthGuard>
    ),
    children: [
      { index: true,          element: S(HomePage) },
      { path: 'records',      element: S(RecordsPage) },
      { path: 'report',       element: S(ReportPage) },
      { path: 'profile',      element: S(ProfilePage) },
    ],
  },
  // ── 记录表单页（需要登录，但无 Tab Bar） ────────────────────────
  {
    path: '/records/form',
    element: <AuthGuard>{S(RecordsPage)}</AuthGuard>,
  },
  {
    path: '/records/form/feeding',
    element: <AuthGuard>{S(FeedingFormPage)}</AuthGuard>,
  },
  {
    path: '/records/form/sleep',
    element: <AuthGuard>{S(SleepFormPage)}</AuthGuard>,
  },
  {
    path: '/records/form/diaper',
    element: <AuthGuard>{S(DiaperFormPage)}</AuthGuard>,
  },
  {
    path: '/records/form/activity',
    element: <AuthGuard>{S(ActivityFormPage)}</AuthGuard>,
  },
  {
    path: '/records/form/health',
    element: <AuthGuard>{S(HealthFormPage)}</AuthGuard>,
  },
  {
    path: '/records/form/symptom',
    element: <AuthGuard>{S(SymptomFormPage)}</AuthGuard>,
  },
  {
    path: '/records/form/growth',
    element: <AuthGuard>{S(GrowthFormPage)}</AuthGuard>,
  },
  {
    path: '/records/form/medical',
    element: <AuthGuard>{S(MedicalFormPage)}</AuthGuard>,
  },
  {
    path: '*',
    element: S(NotFoundPage),
  },
])
