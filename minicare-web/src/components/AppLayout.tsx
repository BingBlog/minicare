/**
 * App 主布局
 * - 页面内容区
 * - 底部 Tab 导航栏（4 Tab + 中间 FAB 圆按钮，对齐 ui-draft/home.html Tab Bar）
 *
 * Tab 结构：首页 | 记录 | ＋FAB | 报告 | 我的
 */
import { useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAppStore } from "@/lib/store";
import type { SwitchBabyOption } from "@/lib/store";
import UpdatePrompt from "@/components/ui/UpdatePrompt";
import FabSheet from "@/pages/home/FabSheet";
import { GLOBAL_FAB_GROUPS } from "@/lib/constants";

// ── SVG 图标（Lucide stroke 风格） ────────────────────────────────
const IconHouse = ({ active }: { active: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 20, height: 20, color: active ? "#e8507a" : "#f0b8c8" }}>
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);
const IconClipboardList = ({ active }: { active: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 20, height: 20, color: active ? "#e8507a" : "#f0b8c8" }}>
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    <line x1="9" y1="12" x2="15" y2="12" />
    <line x1="9" y1="16" x2="13" y2="16" />
  </svg>
);
const IconBarChart2 = ({ active }: { active: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 20, height: 20, color: active ? "#e8507a" : "#f0b8c8" }}>
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);
const IconUserRound = ({ active }: { active: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 20, height: 20, color: active ? "#e8507a" : "#f0b8c8" }}>
    <circle cx="12" cy="8" r="4" />
    <path d="M20 21a8 8 0 1 0-16 0" />
  </svg>
);


export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [fabOpen, setFabOpen] = useState(false);

  const {
    pendingSwitchOptions,
    clearPendingSwitchOptions,
    setCurrentFamily,
    setCurrentBaby,
  } = useAppStore();

  const isActive = (path: string) =>
    path === "/"
      ? location.pathname === "/"
      : location.pathname.startsWith(path);

  /** 切换宝宝：选择某个新家庭/宝宝后更新 store */
  const handleSwitchBaby = (option: SwitchBabyOption) => {
    setCurrentFamily(option.family);
    if (option.baby) setCurrentBaby(option.baby);
    clearPendingSwitchOptions();
  };

  return (
    <div className="flex flex-col h-screen max-w-[430px] mx-auto bg-bg overflow-x-hidden overflow-y-hidden">
      {/* 页面内容 */}
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{ paddingBottom: 56 }}>
        <div className="h-full">
          <Outlet />
        </div>
      </div>

      {/* ── 底部 Tab 栏 ── */}
      <nav
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-border flex items-center z-50"
        style={{
          height: 56,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}>
        {/* Tab: 首页 */}
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1 border-none bg-transparent cursor-pointer">
          <IconHouse active={isActive("/")} />
          <span
            className="text-[10px] font-medium"
            style={{ color: isActive("/") ? "#e8507a" : "#f0b8c8" }}>
            首页
          </span>
        </button>

        {/* Tab: 记录 */}
        <button
          type="button"
          onClick={() => navigate("/records")}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1 border-none bg-transparent cursor-pointer">
          <IconClipboardList active={isActive("/records")} />
          <span
            className="text-[10px] font-medium"
            style={{ color: isActive("/records") ? "#e8507a" : "#f0b8c8" }}>
            记录
          </span>
        </button>

        {/* FAB 中央圆按钮 */}
        <div className="flex-1 flex items-center justify-center">
          <button
            type="button"
            onClick={() => setFabOpen(true)}
            className="flex items-center justify-center text-white font-light text-3xl border-none cursor-pointer transition-transform active:scale-95"
            style={{
              width: 50,
              height: 50,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #F87098, #F9A8C0)",
              boxShadow: "0 4px 12px rgba(248,112,152,0.45)",
              lineHeight: 1,
              paddingBottom: 2,
              marginBottom: 8,
            }}>
            ＋
          </button>
        </div>

        {/* Tab: 分析 */}
        <button
          type="button"
          onClick={() => navigate("/report")}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1 border-none bg-transparent cursor-pointer">
          <IconBarChart2 active={isActive("/report")} />
          <span
            className="text-[10px] font-medium"
            style={{ color: isActive("/report") ? "#e8507a" : "#f0b8c8" }}>
            分析
          </span>
        </button>

        {/* Tab: 我的 */}
        <button
          type="button"
          onClick={() => navigate("/profile")}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1 border-none bg-transparent cursor-pointer">
          <IconUserRound active={isActive("/profile")} />
          <span
            className="text-[10px] font-medium"
            style={{ color: isActive("/profile") ? "#e8507a" : "#f0b8c8" }}>
            我的
          </span>
        </button>
      </nav>

      {/* ── FAB 底部弹层（完整版：4分组 11项）── */}
      <FabSheet
        open={fabOpen}
        onClose={() => setFabOpen(false)}
        groups={GLOBAL_FAB_GROUPS}
      />

      {/* ── PWA 更新提示（新版本可用时展示）── */}
      <UpdatePrompt />

      {/* ── 切换宝宝引导弹层（被邀请加入新家庭时触发）── */}
      {pendingSwitchOptions.length > 0 && (
        <div
          className="fixed inset-0 z-[60] flex items-end"
          style={{ background: "rgba(0,0,0,0.5)" }}>
          <div
            className="w-full bg-white rounded-t-3xl"
            style={{
              maxWidth: 430,
              margin: "0 auto",
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
            }}>
            {/* 把手 */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {/* 标题 */}
            <div className="px-5 pt-3 pb-4">
              <div className="text-[18px] font-extrabold text-[#4A3035]">
                你被加入了新家庭 🎉
              </div>
              <div className="text-[13px] text-[#9A8090] mt-1">
                请选择当前要使用的宝宝档案
              </div>
            </div>

            {/* 选项列表 */}
            <div
              className="mx-4 rounded-2xl overflow-hidden mb-3"
              style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>
              {pendingSwitchOptions.map((option, i) => (
                <div
                  key={option.family.id}
                  className="flex items-center gap-3.5 px-5 py-4 cursor-pointer active:bg-[#FFF8FA] transition-colors"
                  style={i > 0 ? { borderTop: ".5px solid #F5F0F2" } : {}}
                  onClick={() => handleSwitchBaby(option)}>
                  {/* 宝宝头像 */}
                  <div
                    className="flex items-center justify-center flex-shrink-0 rounded-full"
                    style={{
                      width: 46,
                      height: 46,
                      background: "linear-gradient(135deg, #F9A8C0, #F87098)",
                      boxShadow: "0 2px 8px rgba(248,112,152,.25)",
                    }}>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#fff"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ width: 28, height: 28 }}>
                      <path d="M12 2a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4" />
                      <path d="M5 20a7 7 0 0 1 14 0" />
                    </svg>
                  </div>

                  {/* 宝宝信息 */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-bold text-[#4A3035] truncate">
                      {option.baby?.name ?? "（家庭暂无宝宝）"}
                    </div>
                    <div className="text-[12px] text-[#9A8090] mt-0.5 truncate">
                      {option.family.name}
                    </div>
                  </div>

                  {/* 箭头 */}
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#C0A8AD"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ width: 16, height: 16, flexShrink: 0 }}>
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              ))}
            </div>

            {/* 暂不切换 */}
            <div className="px-4">
              <button
                type="button"
                onClick={() => clearPendingSwitchOptions()}
                className="w-full py-3.5 text-[#9A8090] font-semibold text-sm border-none cursor-pointer transition-all active:scale-[0.97] rounded-2xl"
                style={{ background: "#F5F0F2" }}>
                暂不切换，继续使用当前宝宝
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
