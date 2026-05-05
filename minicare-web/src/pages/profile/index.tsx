/**
 * 我的页面
 * UI 严格对齐 minicare/ui-draft/profile.html
 *
 * 结构：
 *   - 页面标题「我的」
 *   - BabyHero     宝宝头像 + 名字 + 过敏信息 + 编辑按钮
 *   - BabyStats    4格：身高 / 体重 / 头围 / 稳定期
 *   - SettingsGroup 设置菜单组（外观 / 家庭 / 关于）
 *   - 退出登录按钮
 *   - EditBabyModal  编辑宝宝档案底部弹层
 *   - MembersModal   家庭成员管理弹层（v2 手机号邀请）
 *
 * 子组件均位于 ./profile/ 目录下
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "@/lib/store";
import { removeToken, babyApi, familyApi } from "@/api";
import type { AllergyLevel, AllergyType, FamilyMember } from "@/api";
import { useToast } from "@/components/ui/Toast";
import BabyHero from "./BabyHero";
import BabyStats from "./BabyStats";
import SettingsGroup from "./SettingsGroup";
import type { SettingsRow } from "./SettingsGroup";
import EditBabyModal from "./EditBabyModal";
import BottomSheet from "@/components/ui/BottomSheet";
import MembersModal from "./MembersModal";
import LoginGuide from "@/components/LoginGuide";

// ── SettingsGroup 所需的图标（仅在本文件内使用）──────────────────

/** 大字体模式图标 */
const IconText = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 18, height: 18, color: "#F0B8C8" }}>
    <polyline points="4 7 4 4 20 4 20 7" />
    <line x1="9" y1="20" x2="15" y2="20" />
    <line x1="12" y1="4" x2="12" y2="20" />
  </svg>
);

/** 家庭成员图标 */
const IconUsers = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 18, height: 18, color: "#F0B8C8" }}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

/** 手机/版本号图标 */
const IconPhone = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 18, height: 18, color: "#F0B8C8" }}>
    <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
    <line x1="12" y1="18" x2="12.01" y2="18" />
  </svg>
);

/** 心形/关于图标 */
const IconHeart = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 18, height: 18, color: "#F87098" }}>
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

/** 文件/隐私政策图标 */
const IconFileText = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 18, height: 18, color: "#9A8090" }}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

/** 退出登录图标 */
const IconLogOut = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="#F05060"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 18, height: 18 }}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

// ══ 我的页面主体 ══════════════════════════════════════════════════
export default function ProfilePage() {
  const navigate = useNavigate();
  const { token, user, currentBaby, currentFamily, setCurrentBaby, logout } =
    useAppStore();
  const { showToast, ToastNode } = useToast();

  // 游客模式：未登录时展示简化版（仅关于/协议入口 + 登录引导）
  if (!token) {
    return <GuestProfile />;
  }

  // ── 外观设置 ──────────────────────────────────────────────────
  const [largeFontMode, setLargeFontMode] = useState(false);

  // ── 编辑宝宝档案弹层状态 ──────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // 编辑表单受控字段（打开弹层时从 currentBaby 同步初始值）
  const [editName, setEditName] = useState(currentBaby?.name ?? "");
  const [editBirthDate, setEditBirthDate] = useState(
    currentBaby?.birth_date ?? "",
  );
  const [editGender, setEditGender] = useState<"male" | "female" | "unknown">(
    (currentBaby?.gender as "male" | "female" | "unknown") ?? "unknown",
  );
  const [editAllergyTypes, setEditAllergyTypes] = useState<AllergyType[]>(
    currentBaby?.allergy_types ?? [],
  );
  const [editAllergyLevel, setEditAllergyLevel] = useState<AllergyLevel>(
    (currentBaby?.allergy_level as AllergyLevel) ?? "unknown",
  );

  // ── 退出登录确认弹层状态 ────────────────────────────────────
  const [logoutOpen, setLogoutOpen] = useState(false);

  // ── 家庭成员弹层状态 ──────────────────────────────────────────
  const [membersOpen, setMembersOpen] = useState(false);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // 当前用户在家庭中的角色（用于控制邀请/移除权限）
  const [currentUserRole, setCurrentUserRole] = useState<'owner' | 'member'>('member');

  // ── 编辑弹层操作 ──────────────────────────────────────────────

  /** 打开编辑弹层，先同步最新 currentBaby 数据到表单 */
  const openEdit = () => {
    setEditName(currentBaby?.name ?? "");
    setEditBirthDate(currentBaby?.birth_date ?? "");
    setEditGender(
      (currentBaby?.gender as "male" | "female" | "unknown") ?? "unknown",
    );
    setEditAllergyTypes(currentBaby?.allergy_types ?? []);
    setEditAllergyLevel(
      (currentBaby?.allergy_level as AllergyLevel) ?? "unknown",
    );
    setEditOpen(true);
  };

  /** 过敏类型多选 toggle：已选则取消，未选则添加 */
  const toggleAllergyType = (type: AllergyType) => {
    setEditAllergyTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  /** 保存宝宝档案：调用 API 更新，成功后更新全局 store */
  const handleSave = async () => {
    if (!editName.trim()) {
      showToast("请填写宝宝昵称");
      return;
    }
    if (!editBirthDate) {
      showToast("请填写出生日期");
      return;
    }
    if (!currentBaby || !currentFamily) {
      showToast("数据未就绪，请稍后再试");
      return;
    }

    setSaving(true);
    try {
      const updated = await babyApi.update(currentFamily.id, currentBaby.id, {
        name: editName.trim(),
        birth_date: editBirthDate,
        gender: editGender,
        allergy_types: editAllergyTypes,
        allergy_level: editAllergyLevel,
      });
      setCurrentBaby(updated);
      setEditOpen(false);
      showToast("✓ 档案已保存");
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  // ── 家庭成员弹层操作 ──────────────────────────────────────────

  /** 打开家庭成员弹层并加载列表 */
  const openMembers = async () => {
    if (!currentFamily) {
      showToast("暂无家庭信息");
      return;
    }
    setMembersOpen(true);
    setMembersLoading(true);
    try {
      const res = await familyApi.getMembers(currentFamily.id);

      // 用当前登录用户 ID 标记 is_self
      const enriched = res.members.map((m) => ({
        ...m,
        is_self: m.user_id === user?.id,
      }));
      setMembers(enriched);

      // 直接使用服务端返回的角色
      setCurrentUserRole(res.currentUserRole);
    } catch {
      showToast("加载成员列表失败");
    } finally {
      setMembersLoading(false);
    }
  };

  /** 刷新成员列表（enrich is_self + 更新角色） */
  const refreshMembers = async (familyId: string) => {
    const res = await familyApi.getMembers(familyId);
    const enriched = res.members.map((m) => ({ ...m, is_self: m.user_id === user?.id }));
    setMembers(enriched);
    setCurrentUserRole(res.currentUserRole);
  };

  /** 按手机号邀请成员 */
  const handleInviteByPhone = async (phone: string) => {
    if (!currentFamily) throw new Error("暂无家庭信息");
    await familyApi.inviteByPhone(currentFamily.id, phone);
    showToast("✓ 邀请已发送，等待对方登录接受");
    await refreshMembers(currentFamily.id);
  };

  /** 移除成员或撤销 pending 邀请 */
  const handleRemoveMember = async (memberId: string) => {
    if (!currentFamily) throw new Error("暂无家庭信息");
    await familyApi.removeMember(currentFamily.id, memberId);
    showToast("✓ 操作成功");
    await refreshMembers(currentFamily.id);
  };

  /** 关闭成员弹层 */
  const closeMembers = () => {
    setMembersOpen(false);
  };

  /** 退出登录：打开确认弹层 */
  const handleLogout = () => {
    setLogoutOpen(true);
  };

  /** 确认退出登录：清除 token → 跳转登录页 */
  const confirmLogout = () => {
    setLogoutOpen(false);
    removeToken();
    logout();
    navigate("/login", { replace: true });
  };

  // ── SettingsGroup 数据配置 ──────────────────────────────────

  /** 外观分组：大字体模式 Toggle */
  const appearanceRows: SettingsRow[] = [
    {
      id: "font",
      type: "toggle",
      icon: <IconText />,
      iconBg: "#FFF0F4",
      label: "大字体模式",
      checked: largeFontMode,
      onToggle: () => setLargeFontMode((v) => !v),
    },
  ];

  /** 家庭分组：家庭成员管理（合并邀请入口）*/
  const activeCount = members.filter((m) => m.status === 'active' || m.status === undefined).length;
  const familyRows: SettingsRow[] = [
    {
      id: "members",
      type: "arrow",
      icon: <IconUsers />,
      iconBg: "#FFF0F4",
      label: "家庭成员管理",
      subText: activeCount > 0 ? `${activeCount}人` : undefined,
      onClick: openMembers,
    },
  ];

  /** 关于分组：版本号（info）/ 关于我们 / 隐私政策 */
  const aboutRows: SettingsRow[] = [
    {
      id: "version",
      type: "info",
      icon: <IconPhone />,
      iconBg: "#FFF0F4",
      label: "版本号",
      value: "v1.0.0（MVP）",
    },
    {
      id: "about",
      type: "arrow",
      icon: <IconHeart />,
      iconBg: "#FFF1F4",
      label: "关于敏宝日记",
      onClick: () => showToast("敏宝日记 · 专为敏感宝宝家庭打造"),
    },
    {
      id: "privacy",
      type: "arrow",
      icon: <IconFileText />,
      iconBg: "#F5F5F5",
      label: "隐私政策",
      onClick: () => showToast("隐私政策与用户协议"),
    },
  ];

  return (
    <div className="min-h-full bg-bg">
      {/* ── 页面标题 ── */}
      <div className="px-5 pt-12 pb-0 bg-bg flex-shrink-0">
        <div className="text-[22px] font-extrabold text-[#4A3035] tracking-tight">
          我的
        </div>
      </div>

      {/* ── 可滚动内容区 ── */}
      <div className="overflow-y-auto pb-24">
        {/* 宝宝 Hero 区 */}
        <BabyHero
          babyName={currentBaby?.name}
          userNickname={user?.nickname}
          birthDate={currentBaby?.birth_date}
          gender={currentBaby?.gender}
          allergyTypes={currentBaby?.allergy_types}
          allergyLevel={currentBaby?.allergy_level as AllergyLevel | undefined}
          onEdit={openEdit}
        />

        {/* 宝宝生长数据迷你格 */}
        <BabyStats />

        {/* 外观设置组 */}
        {/* <SettingsGroup title="外观" rows={appearanceRows} /> */}

        {/* 家庭设置组 */}
        <SettingsGroup title="家庭" rows={familyRows} />

        {/* 关于设置组 */}
        <SettingsGroup title="关于" rows={aboutRows} />

        {/* 退出登录按钮 */}
        <div className="mx-4 mt-4">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-[14px] font-semibold border-none cursor-pointer transition-all active:scale-[0.98]"
            style={{ background: "#FFF0F4", color: "#F05060" }}>
            <IconLogOut />
            退出登录
          </button>
        </div>

        <div className="h-8" />
      </div>

      {/* ── 编辑宝宝档案弹层 ── */}
      <EditBabyModal
        open={editOpen}
        saving={saving}
        name={editName}
        onNameChange={setEditName}
        birthDate={editBirthDate}
        onBirthDateChange={setEditBirthDate}
        gender={editGender}
        onGenderChange={setEditGender}
        allergyTypes={editAllergyTypes}
        onToggleAllergyType={toggleAllergyType}
        allergyLevel={editAllergyLevel}
        onAllergyLevelChange={setEditAllergyLevel}
        onSave={handleSave}
        onCancel={() => setEditOpen(false)}
        onCdcHelp={() => showToast("跳转 CDC 评分标准页面")}
      />

      {/* ── 退出登录确认弹层 ── */}
      <BottomSheet
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        maxHeightVh={40}
        scrollable={false}
      >
        <div className="px-5 pb-4">
          {/* 图标 + 标题 */}
          <div className="flex flex-col items-center pt-2 pb-5">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
              style={{ background: "#FFF0F4" }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="#F05060"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ width: 28, height: 28 }}
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </div>
            <p className="text-[17px] font-bold text-[#4A3035] mb-1">退出登录</p>
            <p className="text-[13px] text-[#9A8090] text-center leading-relaxed">
              退出后需要重新登录才能<br />访问宝宝数据，确定退出吗？
            </p>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setLogoutOpen(false)}
              className="flex-1 py-3.5 rounded-2xl text-[15px] font-semibold border-none cursor-pointer transition-all active:scale-[0.98]"
              style={{ background: "#F5F0F2", color: "#9A8090" }}
            >
              取消
            </button>
            <button
              type="button"
              onClick={confirmLogout}
              className="flex-1 py-3.5 rounded-2xl text-[15px] font-semibold border-none cursor-pointer transition-all active:scale-[0.98]"
              style={{ background: "#F05060", color: "#fff" }}
            >
              确定退出
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* ── 家庭成员管理弹层（v2 手机号邀请）── */}
      <MembersModal
        open={membersOpen}
        members={members}
        loading={membersLoading}
        isOwner={currentUserRole === 'owner'}
        onInviteByPhone={handleInviteByPhone}
        onRemoveMember={handleRemoveMember}
        onClose={closeMembers}
      />

      {/* Toast 全局提示 */}
      {ToastNode}

      {/* spin 关键帧（供 MembersModal 旋转动画使用） */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ══ 游客版"我的"页面 ══════════════════════════════════════════════

function GuestProfile() {
  const navigate = useNavigate();

  return (
    <div className="min-h-full bg-bg">
      {/* 页面标题 */}
      <div className="px-5 pt-12 pb-4 bg-bg">
        <div className="text-[22px] font-extrabold text-[#4A3035] tracking-tight">
          我的
        </div>
      </div>

      {/* 登录引导 */}
      <div className="px-4 mb-4">
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: '#FFFBFC', border: '1px solid #F5F0F2' }}
        >
          <LoginGuide
            title="登录后查看"
            desc="登录后可管理宝宝档案、家庭成员和个人设置"
          />
        </div>
      </div>

      {/* 关于分组（游客也可访问） */}
      <div className="mx-4 mb-4">
        <div className="text-[11px] font-semibold text-[#C0A8AD] tracking-[0.5px] uppercase mb-2 px-1">
          关于
        </div>
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: '#fff', boxShadow: '0 1px 4px rgba(200,100,120,0.06)' }}
        >
          <button
            type="button"
            onClick={() => navigate('/privacy?tab=privacy')}
            className="w-full flex items-center gap-3 px-4 py-3.5 border-none bg-transparent cursor-pointer active:bg-gray-50 transition-colors text-left"
            style={{ borderBottom: '0.5px solid #F5F0F2' }}
          >
            <IconFileTextGuest />
            <span className="flex-1 text-[14px] text-[#4A3035]">隐私政策</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="#C0A8AD" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => navigate('/privacy?tab=terms')}
            className="w-full flex items-center gap-3 px-4 py-3.5 border-none bg-transparent cursor-pointer active:bg-gray-50 transition-colors text-left"
            style={{ borderBottom: '0.5px solid #F5F0F2' }}
          >
            <IconFileTextGuest />
            <span className="flex-1 text-[14px] text-[#4A3035]">用户服务协议</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="#C0A8AD" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => {
              if (navigator.clipboard) {
                navigator.clipboard.writeText('abingblog@gmail.com')
              }
            }}
            className="w-full flex items-center gap-3 px-4 py-3.5 border-none bg-transparent cursor-pointer active:bg-gray-50 transition-colors text-left"
          >
            <IconMailGuest />
            <span className="flex-1 text-[14px] text-[#4A3035]">联系我们</span>
            <span className="text-[12px] text-[#9A8090]">abingblog@gmail.com</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/** 游客版文件图标 */
function IconFileTextGuest() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#9A8090" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18, flexShrink: 0 }}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

/** 游客版邮件图标 */
function IconMailGuest() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#9A8090" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18, flexShrink: 0 }}>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}