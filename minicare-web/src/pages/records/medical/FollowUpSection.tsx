/**
 * 医疗记录 - 下次复查提醒区域（可选设置复查日期和通知）
 */

import DatePicker from "@/components/DatePicker";
import { nowDate } from "@/pages/records/shared";

const IconBell = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 14, height: 14 }}>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

interface Props {
  followUpDate: string;
  followUpEnabled: boolean;
  onDateChange: (v: string) => void;
  onToggle: () => void;
}

export default function FollowUpSection({ followUpDate, followUpEnabled, onDateChange, onToggle }: Props) {
  return (
    <div
      className="mx-4 mb-3 rounded-2xl overflow-hidden"
      style={{
        background: "#FFFBEB",
        border: "1.5px solid #FCD34D",
        padding: "14px 16px",
      }}>
      <div className="flex items-center gap-1.5 mb-3">
        <IconBell />
        <span className="text-[13px] font-bold" style={{ color: "#B45309" }}>
          设置复查日期提醒
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[13px] text-[#4A3035] flex-1">复查日期</span>
        <div className="rounded-lg px-2 py-1" style={{ border: "1px solid #E5D8DA", background: "#fff" }}>
          <DatePicker value={followUpDate || nowDate()} onChange={onDateChange} min={nowDate()} label="" />
        </div>
        {/* Toggle */}
        <button
          type="button"
          onClick={onToggle}
          className="flex-shrink-0 rounded-full transition-all"
          style={{
            width: 44,
            height: 24,
            background: followUpEnabled ? "#F87098" : "#E5D8DA",
            position: "relative",
            border: "none",
          }}>
          <div
            className="absolute top-0.5 rounded-full bg-white transition-all"
            style={{
              width: 20,
              height: 20,
              left: followUpEnabled ? 22 : 2,
              boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
            }}
          />
        </button>
      </div>
      <div className="text-[11px] mt-2" style={{ color: "#9A8090" }}>
        届时将发送本地通知（需开启通知权限）
      </div>
    </div>
  );
}
