/**
 * MembersModal 家庭成员管理底部弹层（v2 手机号邀请）
 *
 * 展示：
 *   - 标题行（家庭成员管理 + 邀请成员按钮）
 *   - 手机号输入内联表单（点击「邀请成员」后展开）
 *   - 当前成员列表（active 成员，含头像、名字、角色徽章）
 *   - 待接受列表（pending 成员，显示脱敏手机号 + 撤销按钮）
 *   - 角色权限说明卡片
 *   - 关闭按钮
 *
 * 角色体系（role 字段，Migration 008: VARCHAR）：
 *   'owner'  = 创建者：可邀请/移除成员
 *   'member' = 成员：可查看和新增记录
 *
 * 成员状态（status 字段，Migration 008: VARCHAR）：
 *   'pending' = 待接受（对方尚未登录激活）
 *   'active'  = 正式成员
 *
 * 被引用：ProfilePage.tsx
 */
import { useState } from "react";
import type { FamilyMember } from "@/api";
import {
  ROLE_TEXT,
  ROLE_AVATAR_STYLE,
  ROLE_BADGE_STYLE,
  ROLE_ICON_COLOR,
} from "@/lib/constants";

// ── SVG 图标 ──────────────────────────────────────────────────────

const IconUserSingle = ({ color = "currentColor" }: { color?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 20, height: 20 }}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const IconPlus = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 14, height: 14 }}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

/** X 关闭/取消图标（用于撤销邀请按钮） */
const IconX = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 13, height: 13 }}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

/** 加载旋转图标 */
const IconSpinner = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 18, height: 18, animation: "spin 1s linear infinite" }}>
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

/** 警告图标（用于确认弹层） */
const IconAlertCircle = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="#F05060"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 36, height: 36 }}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

// ── 工具函数 ──────────────────────────────────────────────────────

/** 手机号脱敏：138****5678 */
function maskPhone(phone: string): string {
  if (!phone || phone.length < 7) return phone;
  return phone.slice(0, 3) + "****" + phone.slice(-4);
}

/** 时间格式化 */
function timeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days >= 1) return `${days}天前`;
  const hours = Math.floor(diff / 3600000);
  if (hours >= 1) return `${hours}小时前`;
  return "刚刚";
}

/** 手机号格式校验 */
function isValidPhone(phone: string): boolean {
  return /^1[3-9]\d{9}$/.test(phone);
}

// ── 内置确认弹层（风格对齐整体设计） ─────────────────────────────

interface ConfirmSheetProps {
  open: boolean;
  title: string;
  desc?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmSheet({
  open,
  title,
  desc,
  confirmLabel = "确认",
  cancelLabel = "取消",
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex items-end z-[70]"
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

        {/* 图标 + 标题 + 描述 */}
        <div className="flex flex-col items-center px-6 pt-5 pb-6 text-center">
          <div
            className="flex items-center justify-center rounded-full mb-4"
            style={{
              width: 64,
              height: 64,
              background: danger ? "#FFF0F2" : "#FFF0F4",
            }}>
            <IconAlertCircle />
          </div>
          <div className="text-[17px] font-bold text-[#4A3035] mb-1.5 leading-snug">
            {title}
          </div>
          {desc && (
            <div className="text-[13px] text-[#9A8090] leading-relaxed">
              {desc}
            </div>
          )}
        </div>

        {/* 操作按钮组 */}
        <div className="px-4 flex flex-col gap-2.5">
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className="w-full py-3.5 rounded-2xl text-[15px] font-bold border-none cursor-pointer transition-all active:scale-[0.97] flex items-center justify-center gap-2"
            style={{
              background: danger ? "#F05060" : "#F87098",
              color: "#fff",
              opacity: loading ? 0.7 : 1,
            }}>
            {loading ? <IconSpinner /> : confirmLabel}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="w-full py-3.5 rounded-2xl text-[14px] font-semibold border-none cursor-pointer transition-all active:scale-[0.97]"
            style={{ background: "#F5F0F2", color: "#9A8090" }}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 类型定义 ──────────────────────────────────────────────────────

interface MembersModalProps {
  /** 是否显示弹层 */
  open: boolean;
  /** 家庭成员列表（含 active + pending，由父组件通过 API 获取） */
  members: FamilyMember[];
  /** 是否正在加载成员列表 */
  loading: boolean;
  /** 当前用户是否为家庭 Owner（控制邀请/移除入口显隐） */
  isOwner: boolean;
  /** 按手机号邀请成员 */
  onInviteByPhone: (phone: string) => Promise<void>;
  /** 移除成员或撤销邀请（memberId 为 family_member.id） */
  onRemoveMember: (memberId: string) => Promise<void>;
  /** 关闭弹层回调 */
  onClose: () => void;
}

// ── 确认弹层状态结构 ───────────────────────────────────────────────
interface ConfirmState {
  open: boolean;
  memberId: string;
  memberName: string;
  isPending: boolean;
}

const CONFIRM_INIT: ConfirmState = {
  open: false,
  memberId: "",
  memberName: "",
  isPending: false,
};

/**
 * 家庭成员管理底部弹层（v2 手机号邀请）
 */
export default function MembersModal({
  open,
  members,
  loading,
  isOwner,
  onInviteByPhone,
  onRemoveMember,
  onClose,
}: MembersModalProps) {
  // ── 手机号输入表单状态 ──────────────────────────────────────────
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState("");

  // ── 确认弹层状态 ──────────────────────────────────────────────
  const [confirm, setConfirm] = useState<ConfirmState>(CONFIRM_INIT);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // ── 成员列表分组 ──────────────────────────────────────────────
  const activeMembers = members.filter(
    (m) => m.status === 'active' || m.status === undefined,
  );
  const pendingMembers = members.filter((m) => m.status === 'pending');

  /** 关闭并重置表单 */
  const handleClose = () => {
    setShowInviteForm(false);
    setInvitePhone("");
    setInviteError("");
    onClose();
  };

  /** 发送邀请 */
  const handleInviteSubmit = async () => {
    if (!isValidPhone(invitePhone)) {
      setInviteError("请输入正确的 11 位手机号");
      return;
    }
    setInviteSubmitting(true);
    setInviteError("");
    try {
      await onInviteByPhone(invitePhone);
      setInvitePhone("");
      setShowInviteForm(false);
    } catch (e: unknown) {
      setInviteError(e instanceof Error ? e.message : "邀请失败，请重试");
    } finally {
      setInviteSubmitting(false);
    }
  };

  /** 打开确认弹层（移除成员 / 撤销邀请） */
  const openConfirm = (member: FamilyMember, isPending: boolean) => {
    const name = isPending
      ? member.invite_phone
        ? maskPhone(member.invite_phone)
        : member.phone
          ? maskPhone(member.phone)
          : "该联系人"
      : (member.name ?? "该成员");

    setConfirm({
      open: true,
      memberId: member.id,
      memberName: name,
      isPending,
    });
  };

  /** 确认执行移除/撤销 */
  const handleConfirm = async () => {
    setConfirmLoading(true);
    try {
      await onRemoveMember(confirm.memberId);
    } catch {
      // 错误由父组件 Toast 处理
    } finally {
      setConfirmLoading(false);
      setConfirm(CONFIRM_INIT);
    }
  };

  if (!open) return null;

  return (
    <>
      {/* ── 主弹层 ── */}
      <div
        className="fixed inset-0 z-50 flex items-end"
        style={{ background: "rgba(0,0,0,0.45)" }}
        onClick={(e) => {
          if (e.target === e.currentTarget) handleClose();
        }}>
        <div
          className="w-full bg-white rounded-t-3xl"
          style={{
            maxWidth: 430,
            margin: "0 auto",
            maxHeight: "92%",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
            overflowY: "auto",
          }}>
          {/* 把手 */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-gray-200" />
          </div>

          {/* ── 标题行 ── */}
          <div className="flex items-center justify-between px-5 py-3">
            <div className="text-[17px] font-bold text-[#4A3035]">
              家庭成员管理
            </div>
            {isOwner && (
              <button
                type="button"
                onClick={() => {
                  setShowInviteForm((v) => !v);
                  setInviteError("");
                  setInvitePhone("");
                }}
                className="flex items-center gap-1 border-none bg-transparent cursor-pointer text-[13px] font-semibold"
                style={{ color: "#F87098" }}>
                <IconPlus />
                邀请成员
              </button>
            )}
          </div>

          {/* ── 手机号输入表单（内联展开）── */}
          {isOwner && showInviteForm && (
            <div
              className="mx-4 mb-3 px-4 py-3.5 rounded-2xl"
              style={{ background: "#FFF0F4", border: "1px solid #F8C8D4" }}>
              <div className="text-[12px] font-semibold text-[#9A8090] mb-2">
                输入对方手机号
              </div>
              <div className="flex gap-2">
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={11}
                  placeholder="请输入 11 位手机号"
                  value={invitePhone}
                  onChange={(e) => {
                    setInvitePhone(
                      e.target.value.replace(/\D/g, "").slice(0, 11),
                    );
                    setInviteError("");
                  }}
                  className="flex-1 px-3 py-2.5 rounded-xl text-[14px] border-none outline-none"
                  style={{
                    background: "#fff",
                    boxShadow: "0 0 0 1.5px #F0D0DA",
                    color: "#4A3035",
                  }}
                />
                <button
                  type="button"
                  disabled={invitePhone.length !== 11 || inviteSubmitting}
                  onClick={handleInviteSubmit}
                  className="px-4 py-2.5 rounded-xl text-[13px] font-bold border-none cursor-pointer transition-all active:scale-95"
                  style={{
                    background:
                      invitePhone.length === 11 && !inviteSubmitting
                        ? "#F87098"
                        : "#F0C8D0",
                    color: "#fff",
                    minWidth: 64,
                  }}>
                  {inviteSubmitting ? <IconSpinner /> : "发送"}
                </button>
              </div>
              {inviteError && (
                <div
                  className="text-[12px] mt-1.5"
                  style={{ color: "#E04060" }}>
                  {inviteError}
                </div>
              )}
              <div className="text-[11px] text-[#C0A8AD] mt-2">
                对方登录后将自动加入家庭，无需任何操作
              </div>
            </div>
          )}

          {/* ── 当前成员列表 ── */}
          <div className="text-[12px] font-semibold text-[#9A8090] px-5 pb-1.5">
            当前成员
            {activeMembers.length > 0 ? `（${activeMembers.length}人）` : ""}
          </div>
          <div
            className="mx-4 bg-white rounded-2xl overflow-hidden mb-3"
            style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.07)" }}>
            {loading ? (
              <div className="flex items-center justify-center py-8 text-[#9A8090] text-sm gap-2">
                <IconSpinner />
                加载中…
              </div>
            ) : activeMembers.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-[#9A8090] text-sm">
                暂无成员数据
              </div>
            ) : (
              activeMembers.map((member, i) => {
                const role = member.role ?? 'member';
                const name = member.name ?? "未知用户";
                const sub = member.is_self
                  ? `${member.phone ? member.phone + " · " : ""}本账号`
                  : member.joined_at
                    ? `${member.phone ? member.phone + " · " : ""}已加入 ${timeAgo(member.joined_at)}`
                    : (member.phone ?? "");

                const canRemove = isOwner && role !== 'owner' && !member.is_self;

                return (
                  <div
                    key={member.id}
                    className="flex items-center gap-3.5 px-5 py-3.5"
                    style={i > 0 ? { borderTop: ".5px solid #F5F0F2" } : {}}>
                    {/* 头像 */}
                    <div
                      className="flex items-center justify-center rounded-full flex-shrink-0"
                      style={{
                        width: 44,
                        height: 44,
                        ...ROLE_AVATAR_STYLE[role],
                      }}>
                      <IconUserSingle color={ROLE_ICON_COLOR[role]} />
                    </div>

                    {/* 名字 + 副标题 */}
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-bold text-[#4A3035] truncate">
                        {name}
                      </div>
                      {sub && (
                        <div className="text-[12px] text-[#9A8090] mt-0.5 truncate">
                          {sub}
                        </div>
                      )}
                    </div>

                    {/* 角色徽章 */}
                    <div
                      className="px-2.5 py-0.5 rounded-full text-[11px] font-bold flex-shrink-0"
                      style={ROLE_BADGE_STYLE[role]}>
                      {ROLE_TEXT[role] ?? "成员"}
                    </div>

                    {/* 移除按钮（仅 Owner 可见，不可移除创建者和自身） */}
                    {canRemove && (
                      <button
                        type="button"
                        onClick={() => openConfirm(member, false)}
                        className="ml-1 flex-shrink-0 flex items-center justify-center border-none cursor-pointer rounded-full transition-all active:scale-90"
                        style={{
                          width: 24,
                          height: 24,
                          background: "#FFF0F4",
                          color: "#F05060",
                        }}
                        title="移除成员">
                        <IconX />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* ── 待接受列表（pending 成员）── */}
          {pendingMembers.length > 0 && (
            <>
              <div className="text-[12px] font-semibold text-[#9A8090] px-5 pb-1.5">
                待接受（{pendingMembers.length}人）
              </div>
              <div
                className="mx-4 bg-white rounded-2xl overflow-hidden mb-3"
                style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.07)" }}>
                {pendingMembers.map((member, i) => {
                  const displayPhone = member.invite_phone
                    ? maskPhone(member.invite_phone)
                    : member.phone
                      ? maskPhone(member.phone)
                      : "未知号码";

                  return (
                    <div
                      key={member.id}
                      className="flex items-center gap-3.5 px-5 py-3.5"
                      style={i > 0 ? { borderTop: ".5px solid #F5F0F2" } : {}}>
                      {/* 头像（灰色，未激活状态） */}
                      <div
                        className="flex items-center justify-center rounded-full flex-shrink-0"
                        style={{
                          width: 44,
                          height: 44,
                          background: "#F5F0F2",
                        }}>
                        <IconUserSingle color="#C0A8AD" />
                      </div>

                      {/* 手机号 */}
                      <div className="flex-1 min-w-0">
                        <div className="text-[15px] font-bold text-[#4A3035] truncate">
                          {displayPhone}
                        </div>
                        <div className="text-[12px] text-[#C0A8AD] mt-0.5">
                          等待对方登录接受
                        </div>
                      </div>

                      {/* 「待接受」徽章 */}
                      <div
                        className="px-2.5 py-0.5 rounded-full text-[11px] font-bold flex-shrink-0 mr-1"
                        style={{ background: "#F5F0F2", color: "#C0A8AD" }}>
                        待接受
                      </div>

                      {/* 撤销按钮（仅 Owner） */}
                      {isOwner && (
                        <button
                          type="button"
                          onClick={() => openConfirm(member, true)}
                          className="flex-shrink-0 flex items-center justify-center border-none cursor-pointer rounded-full transition-all active:scale-90"
                          style={{
                            width: 24,
                            height: 24,
                            background: "#F5F0F2",
                            color: "#9A8090",
                          }}
                          title="撤销邀请">
                          <IconX />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ── 权限说明卡片 ── */}
          <div
            className="mx-4 mb-3 px-4 py-3.5 rounded-xl text-[12px] leading-relaxed"
            style={{ background: "#FFF0F4", color: "#9A8090" }}>
            <span style={{ color: "#F87098", fontWeight: 700 }}>
              角色说明：
            </span>
            创建者可管理所有成员权限；
            <span style={{ color: "#4A90D9", fontWeight: 600 }}>成员</span>
            可查看和新增记录。
          </div>

          {/* ── 关闭按钮 ── */}
          <div className="px-4 mt-1 mb-2">
            <button
              type="button"
              onClick={handleClose}
              className="w-full py-3.5 text-[#9A8090] font-semibold text-sm border-none cursor-pointer transition-all active:scale-[0.97] rounded-2xl"
              style={{ background: "#F5F0F2" }}>
              关闭
            </button>
          </div>
        </div>
      </div>

      {/* ── 移除/撤销确认弹层（覆盖在主弹层之上） ── */}
      <ConfirmSheet
        open={confirm.open}
        title={
          confirm.isPending
            ? `撤销对 ${confirm.memberName} 的邀请？`
            : `移除「${confirm.memberName}」？`
        }
        desc={
          confirm.isPending
            ? "撤销后对方将无法通过此邀请加入家庭，如需再次邀请可重新发送。"
            : "移除后该成员将无法查看或记录家庭数据，如需再次加入需重新邀请。"
        }
        confirmLabel={confirm.isPending ? "撤销邀请" : "移除成员"}
        cancelLabel="再想想"
        danger
        loading={confirmLoading}
        onConfirm={handleConfirm}
        onCancel={() => setConfirm(CONFIRM_INIT)}
      />

      {/* spin 关键帧 */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
