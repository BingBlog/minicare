/**
 * Onboarding Step 2 — 创建成功页
 *
 * 内容：
 *   - 动画勾选圆圈（ob-scale-in 关键帧）
 *   - 成功标题 + 引导文案
 *   - 宝宝信息卡片（姓名、性别月龄、过敏标签）
 *   - 「进入首页，开始记录」按钮
 */
import { useNavigate } from "react-router-dom";
import type { AllergyLevel } from "@/api";

const SEVERITY_LABELS: Record<AllergyLevel, string> = {
  mild: "轻度",
  moderate: "中度",
  severe: "重度",
  unknown: "未知程度",
};

interface Props {
  babyName: string;
  gender: "male" | "female";
  /** 出生日期字符串（YYYY-MM-DD），用于计算月龄 */
  birthDate: string;
  allergyLevel: AllergyLevel | "";
}

function calcAge(birthDate: string): string {
  if (!birthDate) return "";
  const birth = new Date(birthDate);
  const now = new Date();
  const months =
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth());
  return months > 0 ? `${months}个月` : "";
}

export default function Step2SuccessPage({
  babyName,
  gender,
  birthDate,
  allergyLevel,
}: Props) {
  const navigate = useNavigate();
  const genderText = gender === "male" ? "男宝宝" : "女宝宝";
  const ageText = calcAge(birthDate);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-8 py-10"
      style={{ background: "linear-gradient(170deg, #FFF0F4 0%, #fff 60%)" }}>
      {/* 成功动画圆圈 */}
      <div
        className="flex items-center justify-center mb-6"
        style={{
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #F9A8C0, #F87098)",
          boxShadow: "0 10px 28px rgba(248,112,152,.4)",
          animation: "ob-scale-in .5s cubic-bezier(.175,.885,.32,1.275) both",
        }}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fff"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ width: 40, height: 40 }}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>

      <div className="text-[22px] font-black text-[#4A3035] mb-2 text-center">
        宝宝档案已创建！
      </div>
      <div className="text-sm text-[#9A8090] text-center leading-relaxed mb-8">
        开始用敏宝日记记录宝宝的
        <br />
        每一天，就医时不再烦恼
      </div>

      {/* 宝宝信息卡片 */}
      <div
        className="w-full flex flex-col items-center rounded-2xl px-5 py-5 mb-7"
        style={{
          background: "#fff",
          boxShadow: "0 4px 20px rgba(200,100,120,0.12)",
        }}>
        {/* 头像 */}
        <div
          className="flex items-center justify-center rounded-full mb-3"
          style={{
            width: 64,
            height: 64,
            background: "linear-gradient(135deg, #F9A8C0, #F87098)",
          }}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ width: 32, height: 32 }}>
            <path d="M12 2a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4" />
            <path d="M5 20a7 7 0 0 1 14 0" />
          </svg>
        </div>

        {/* 信息 */}
        <div className="text-lg font-extrabold text-[#4A3035] text-center">
          {babyName || "小宝"}
        </div>
        <div className="text-xs text-[#9A8090] mt-1 text-center">
          {genderText}
          {ageText ? ` · ${ageText}` : ""}
        </div>
      </div>

      {/* 进入首页按钮 */}
      <button
        onClick={() => navigate("/", { replace: true })}
        className="w-full py-4 text-white font-bold text-base border-none cursor-pointer transition-all active:scale-[0.97]"
        style={{
          borderRadius: 50,
          background: "linear-gradient(90deg, #F87098, #F9A8C0)",
          boxShadow: "0 6px 20px rgba(248,112,152,0.4)",
        }}>
        进入首页，开始记录
      </button>

      {/* 动画关键帧 */}
      <style>{`
        @keyframes ob-scale-in {
          from { transform: scale(0.3); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
      `}</style>
    </div>
  );
}
