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
 *   - MembersModal   家庭成员管理弹层
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
import MembersModal from "./MembersModal";

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

/** 分享/邀请图标 */
const IconShare = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 18, height: 18, color: "#4CAF82" }}>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
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
  const { user, currentBaby, currentFamily, setCurrentBaby, logout } = useAppStore();
  const { showToast, ToastNode } = useToast();

  // ── 外观设置 ──────────────────────────────────────────────────
  const [largeFontMode, setLargeFontMode] = useState(false);

  // ── 编辑宝宝档案弹层状态 ──────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // 编辑表单受控字段（打开弹层时从 currentBaby 同步初始值）
  const [editName, setEditName] = useState(currentBaby?.name ?? "");
  const [editBirthDate, setEditBirthDate] = useState(currentBaby?.birth_date ?? "");
  const [editGender, setEditGender] = useState<"male" | "female" | "unknown">(
    (currentBaby?.gender as "male" | "female" | "unknown") ?? "unknown"
  );
  const [editAllergyTypes, setEditAllergyTypes] = useState<AllergyType[]>(currentBaby?.allergy_types ?? []);
  const [editAllergyLevel, setEditAllergyLevel] = useState<AllergyLevel>(
    (currentBaby?.allergy_level as AllergyLevel) ?? "unknown"
  );

  // ── 家庭成员弹层状态 ──────────────────────────────────────────
  const [membersOpen, setMembersOpen] = useState(false);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);

  // ── 编辑弹层操作 ──────────────────────────────────────────────

  /** 打开编辑弹层，先同步最新 currentBaby 数据到表单 */
  const openEdit = () => {
    setEditName(currentBaby?.name ?? "");
    setEditBirthDate(currentBaby?.birth_date ?? "");
    setEditGender((currentBaby?.gender as "male" | "female" | "unknown") ?? "unknown");
    setEditAllergyTypes(currentBaby?.allergy_types ?? []);
    setEditAllergyLevel((currentBaby?.allergy_level as AllergyLevel) ?? "unknown");
    setEditOpen(true);
  };

  /** 过敏类型多选 toggle：已选则取消，未选则添加 */
  const toggleAllergyType = (type: AllergyType) => {
    setEditAllergyTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
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
      // ── 1. 更新宝宝基础档案 ──────────────────────────────────
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
      const list = await familyApi.getMembers(currentFamily.id);
      setMembers(list);
    } catch {
      showToast("加载成员列表失败");
    } finally {
      setMembersLoading(false);
    }
  };

  /** 关闭成员弹层，同时清空邀请码 */
  const closeMembers = () => {
    setMembersOpen(false);
    setInviteCode("");
  };

  /** 生成邀请码（调用 API，code 24小时有效） */
  const handleInvite = async () => {
    if (!currentFamily) return;
    setInviteLoading(true);
    try {
      const res = await familyApi.createInviteCode(currentFamily.id);
      setInviteCode(res.code);
    } catch {
      showToast("生成邀请码失败，请重试");
    } finally {
      setInviteLoading(false);
    }
  };

  /** 复制邀请码到剪贴板 */
  const copyInviteCode = () => {
    if (!inviteCode) return;
    navigator.clipboard
      .writeText(inviteCode)
      .then(() => {
        showToast(`✓ 邀请码 ${inviteCode} 已复制`);
      })
      .catch(() => {
        showToast(`邀请码：${inviteCode}`);
      });
  };

  /** 退出登录：确认弹窗 → 清除 token → 跳转登录页 */
  const handleLogout = () => {
    if (window.confirm("确定要退出登录吗？")) {
      removeToken();
      logout();
      navigate("/login", { replace: true });
    }
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

  /** 家庭分组：家庭成员管理 + 邀请家庭成员 */
  const familyRows: SettingsRow[] = [
    {
      id: "members",
      type: "arrow",
      icon: <IconUsers />,
      iconBg: "#FFF0F4",
      label: "家庭成员管理",
      subText: members.length > 0 ? `${members.length}人` : undefined,
      onClick: openMembers,
    },
    {
      id: "invite",
      type: "arrow",
      icon: <IconShare />,
      iconBg: "#DCFCE7",
      label: "邀请家庭成员",
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
      // v1.0.0（MVP）为当前测试版版本
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
        <div className="text-[22px] font-extrabold text-[#4A3035] tracking-tight">我的</div>
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
        <SettingsGroup title="外观" rows={appearanceRows} />

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

      {/* ── 家庭成员管理弹层 ── */}
      <MembersModal
        open={membersOpen}
        members={members}
        loading={membersLoading}
        inviteCode={inviteCode}
        inviteLoading={inviteLoading}
        onInvite={handleInvite}
        onCopyCode={copyInviteCode}
        onMemberClick={(m) =>
          showToast(`${m.name ?? "未知用户"} · ${m.role === 1 ? "创建者" : m.role === 3 ? "查看者" : "编辑者"}`)
        }
        onClose={closeMembers}
      />

      {/* Toast 全局提示 */}
      {ToastNode}

      {/* spin 关键帧（供 MembersModal 旋转动画使用） */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}