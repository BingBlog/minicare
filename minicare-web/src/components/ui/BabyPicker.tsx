import BottomSheet from "./BottomSheet";
import type { Baby } from "@/api";

interface BabyPickerProps {
  open: boolean;
  babies: Baby[];
  currentBabyId: string | undefined;
  onSelect: (baby: Baby) => void;
  onLeave?: (baby: Baby) => void;
  onClose: () => void;
}

export default function BabyPicker({
  open,
  babies,
  currentBabyId,
  onSelect,
  onLeave,
  onClose,
}: BabyPickerProps) {
  return (
    <BottomSheet open={open} onClose={onClose} maxHeightVh={70}>
      <div className="px-5 pb-4">
        <div className="flex items-center justify-between pt-2 pb-4">
          <p className="text-[17px] font-bold text-[#4A3035]">切换宝宝</p>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-100 transition-colors"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="#9A8090"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ width: 20, height: 20 }}
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="space-y-3">
          {babies.map((baby) => {
            const isActive = baby.id === currentBabyId;
            return (
              <div
                key={baby.id}
                className={`rounded-xl p-4 flex items-center gap-3 cursor-pointer transition-all active:scale-[0.98] ${
                  isActive ? "ring-2 ring-[#F87098]" : ""
                }`}
                style={{
                  background: isActive ? "#FFF0F4" : "#FFFBFC",
                  border: "1px solid #F5F0F2",
                }}
                onClick={() => {
                  if (!isActive) {
                    onSelect(baby);
                    onClose();
                  }
                }}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: isActive ? "#F87098" : "#FFF0F4" }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={isActive ? "#fff" : "#F87098"}
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ width: 20, height: 20 }}
                  >
                    <path d="M12 2a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4" />
                    <path d="M5 20a7 7 0 0 1 14 0" />
                  </svg>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-[#4A3035] truncate">
                    {baby.name}
                  </p>
                  <p className="text-[12px] text-[#9A8090] truncate">
                    {baby.family_name || "家庭"} ·{" "}
                    {baby.family_role === "owner" ? "创建者" : "成员"}
                  </p>
                </div>

                {isActive ? (
                  <div className="flex-shrink-0">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#F87098"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ width: 18, height: 18 }}
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                ) : baby.family_role !== "owner" && onLeave ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onLeave(baby);
                    }}
                    className="flex-shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
                    style={{ background: "#FFF0F4", color: "#F05060" }}
                  >
                    退出
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </BottomSheet>
  );
}
