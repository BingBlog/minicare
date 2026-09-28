import BottomSheet from "./BottomSheet";
import { familyApi } from "@/api";
import type { PendingInvite } from "@/api/family";

interface InviteModalProps {
  invites: PendingInvite[];
  open: boolean;
  onAccept?: (invites: PendingInvite[]) => void;
  onDecline?: () => void;
  showToast: (msg: string) => void;
}

export default function InviteModal({
  invites,
  open,
  onAccept,
  onDecline,
  showToast,
}: InviteModalProps) {
  if (!open || invites.length === 0) return null;

  const handleAccept = async () => {
    try {
      for (const inv of invites) {
        await familyApi.acceptInvite(inv.id);
      }
      showToast("已加入家庭");
      onAccept?.(invites);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "操作失败");
    }
  };

  const handleDecline = async () => {
    try {
      for (const inv of invites) {
        await familyApi.declineInvite(inv.id);
      }
      showToast("已拒绝邀请");
      onDecline?.();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "操作失败");
    }
  };

  return (
    <BottomSheet open={open} onClose={() => {}} maxHeightVh={60}>
      <div className="px-5 pb-4">
        <div className="flex flex-col items-center pt-2 pb-5">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
            style={{ background: "#FFF0F4" }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="#F87098"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ width: 28, height: 28 }}
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <p className="text-[17px] font-bold text-[#4A3035] mb-1">家庭邀请</p>
        </div>

        <div className="space-y-3 mb-5">
          {invites.map((inv) => (
            <div
              key={inv.id}
              className="rounded-xl p-4"
              style={{ background: "#FFFBFC", border: "1px solid #F5F0F2" }}
            >
              <p className="text-[15px] font-semibold text-[#4A3035]">
                {inv.family_name}
              </p>
              {inv.inviter_name && (
                <p className="text-[13px] text-[#9A8090] mt-1">
                  邀请人：{inv.inviter_name}
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleDecline}
            className="flex-1 py-3.5 rounded-2xl text-[15px] font-semibold border-none cursor-pointer transition-all active:scale-[0.98]"
            style={{ background: "#F5F0F2", color: "#9A8090" }}
          >
            拒绝
          </button>
          <button
            type="button"
            onClick={handleAccept}
            className="flex-1 py-3.5 rounded-2xl text-[15px] font-semibold border-none cursor-pointer transition-all active:scale-[0.98]"
            style={{ background: "#F87098", color: "#fff" }}
          >
            接受邀请
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
