/**
 * 应用路由配置
 * 使用 Hash 模式（#/home），静态托管刷新不会 404
 */
import { lazy, Suspense } from "react";
import { createHashRouter } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import AuthGuard from "./components/AuthGuard";

// 懒加载页面（Index Entry Pattern: 目录/index.tsx）
const LoginPage = lazy(() => import("./pages/login"));
const HomePage = lazy(() => import("./pages/home"));
const RecordsPage = lazy(() => import("./pages/records-list"));
const ProfilePage = lazy(() => import("./pages/profile"));
const OnboardingPage = lazy(() => import("./pages/onboarding"));
const ReportPage = lazy(() => import("./pages/report"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

// 记录表单页（带路径前缀 /records/xxx，Index Entry Pattern）
const FeedingFormPage = lazy(() => import("./pages/records/feeding"));
const SleepFormPage = lazy(() => import("./pages/records/sleep"));
const DiaperFormPage = lazy(() => import("./pages/records/diaper"));
const ActivityFormPage = lazy(() => import("./pages/records/activity"));
const HealthFormPage = lazy(() => import("./pages/records/health"));
const SymptomFormPage = lazy(() => import("./pages/records/symptom"));
const GrowthFormPage = lazy(() => import("./pages/records/growth"));
const MedicalFormPage = lazy(() => import("./pages/records/medical"));

const Loading = () => (
  <div className="flex items-center justify-center h-screen bg-bg">
    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const S = (C: React.LazyExoticComponent<any>) => (
  <Suspense fallback={<Loading />}>
    <C />
  </Suspense>
);

export const router = createHashRouter([
  {
    path: "/login",
    element: S(LoginPage),
  },
  {
    path: "/onboarding",
    element: <AuthGuard>{S(OnboardingPage)}</AuthGuard>,
  },
  {
    path: "/",
    element: (
      <AuthGuard>
        <AppLayout />
      </AuthGuard>
    ),
    children: [
      { index: true, element: S(HomePage) },
      { path: "records", element: S(RecordsPage) },
      { path: "report", element: S(ReportPage) },
      { path: "profile", element: S(ProfilePage) },
    ],
  },
  // ── 记录表单页（需要登录，但无 Tab Bar） ────────────────────────
  {
    path: "/records/form",
    element: <AuthGuard>{S(RecordsPage)}</AuthGuard>,
  },
  {
    path: "/records/form/feeding",
    element: <AuthGuard>{S(FeedingFormPage)}</AuthGuard>,
  },
  {
    path: "/records/form/sleep",
    element: <AuthGuard>{S(SleepFormPage)}</AuthGuard>,
  },
  {
    path: "/records/form/diaper",
    element: <AuthGuard>{S(DiaperFormPage)}</AuthGuard>,
  },
  {
    path: "/records/form/activity",
    element: <AuthGuard>{S(ActivityFormPage)}</AuthGuard>,
  },
  {
    path: "/records/form/health",
    element: <AuthGuard>{S(HealthFormPage)}</AuthGuard>,
  },
  {
    path: "/records/form/symptom",
    element: <AuthGuard>{S(SymptomFormPage)}</AuthGuard>,
  },
  {
    path: "/records/form/growth",
    element: <AuthGuard>{S(GrowthFormPage)}</AuthGuard>,
  },
  {
    path: "/records/form/medical",
    element: <AuthGuard>{S(MedicalFormPage)}</AuthGuard>,
  },
  {
    path: "*",
    element: S(NotFoundPage),
  },
]);
