/**
 * 应用路由配置
 * 使用 Hash 模式（#/home），静态托管刷新不会 404
 */
import { lazy, Suspense } from 'react'
import { createHashRouter } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import AuthGuard from './components/AuthGuard'

// 懒加载页面
const LoginPage = lazy(() => import('./pages/LoginPage'))
const HomePage = lazy(() => import('./pages/HomePage'))
const RecordsPage = lazy(() => import('./pages/RecordsPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const OnboardingPage = lazy(() => import('./pages/OnboardingPage'))
const ReportPage = lazy(() => import('./pages/ReportPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

const Loading = () => (
  <div className="flex items-center justify-center h-screen bg-bg">
    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
)

export const router = createHashRouter([
  {
    path: '/login',
    element: (
      <Suspense fallback={<Loading />}>
        <LoginPage />
      </Suspense>
    ),
  },
  {
    path: '/onboarding',
    element: (
      <AuthGuard>
        <Suspense fallback={<Loading />}>
          <OnboardingPage />
        </Suspense>
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
      { index: true, element: <Suspense fallback={<Loading />}><HomePage /></Suspense> },
      { path: 'records', element: <Suspense fallback={<Loading />}><RecordsPage /></Suspense> },
      { path: 'report',  element: <Suspense fallback={<Loading />}><ReportPage /></Suspense> },
      { path: 'profile', element: <Suspense fallback={<Loading />}><ProfilePage /></Suspense> },
    ],
  },
  {
    path: '*',
    element: (
      <Suspense fallback={<Loading />}>
        <NotFoundPage />
      </Suspense>
    ),
  },
])
