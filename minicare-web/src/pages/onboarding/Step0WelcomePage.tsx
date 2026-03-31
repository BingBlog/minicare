/**
 * Onboarding Step 0 — 引导介绍页
 *
 * 内容：
 *   - Logo 圆圈 + 产品标题副标题
 *   - 三张特性卡片（结构化记录 / 一键报告 / 就医沟通）
 *   - 底部「开始创建宝宝档案」按钮
 *   - 「直接进入首页」链接
 */
import { useNavigate } from "react-router-dom";

// ── 特性卡片数据 ────────────────────────────────────────────────
const FEATURES = [
  {
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ width: 22, height: 22, color: "#F87098" }}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
    iconBg: "var(--color-primary-lt, #FFF0F4)",
    title: "结构化记录",
    desc: "饮食·睡眠·活动·尿布·生长·健康，一键记录不遗漏",
  },
  {
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ width: 22, height: 22, color: "#DDB870" }}>
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
    iconBg: "#FFF8E6",
    title: "一键生成报告",
    desc: "综合数据自动汇总，PDF 格式一键分享给医生",
  },
  {
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ width: 22, height: 22, color: "#4CAF82" }}>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
    iconBg: "#DCFCE7",
    title: "就医沟通更顺畅",
    desc: "完整数据记录，门诊时不再遗忘关键信息",
  },
];

// ── 品牌 Logo SVG ─────────────────────────────────────────────────
const BabyIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="#fff"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 46, height: 46 }}>
    <path d="M12 2a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4" />
    <path d="M5 20a7 7 0 0 1 14 0" />
    <circle cx="9" cy="10.5" r="1" fill="#fff" />
    <circle cx="15" cy="10.5" r="1" fill="#fff" />
  </svg>
);

interface Props {
  /** 点击「开始创建宝宝档案」*/
  onStart: () => void;
}

export default function Step0WelcomePage({ onStart }: Props) {
  const navigate = useNavigate();

  return (
    <div
      className="min-h-screen flex flex-col pb-8"
      style={{ background: "linear-gradient(170deg, #FFF0F4 0%, #fff 50%)" }}>
      {/* 核心介绍区 */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-6">
        {/* Logo 圆圈 */}
        <div
          className="flex items-center justify-center mb-6"
          style={{
            width: 90,
            height: 90,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #F9A8C0, #F87098)",
            boxShadow: "0 12px 32px rgba(248,112,152,.35)",
          }}>
          <BabyIcon />
        </div>

        <div className="text-[26px] font-black text-[#4A3035] tracking-tight mb-1.5 text-center">
          敏宝日记
        </div>
        <div className="text-sm text-[#9A8090] text-center mb-7">
          专为牛奶蛋白过敏宝宝家庭设计
        </div>

        {/* 特性卡片列表 */}
        <div className="w-full flex flex-col gap-3">
          {FEATURES.map((item) => (
            <div
              key={item.title}
              className="flex items-center gap-3.5 rounded-2xl px-4 py-3.5"
              style={{ background: "#fff", boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>
              <div
                className="flex items-center justify-center rounded-xl flex-shrink-0"
                style={{ width: 40, height: 40, background: item.iconBg }}>
                {item.icon}
              </div>
              <div>
                <div className="text-sm font-bold text-[#4A3035]">{item.title}</div>
                <div className="text-xs text-[#9A8090] mt-0.5">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 底部按钮区 */}
      <div className="px-6">
        <button
          onClick={onStart}
          className="w-full py-4 text-white font-bold text-base border-none cursor-pointer transition-all active:scale-[0.97]"
          style={{
            borderRadius: 50,
            background: "linear-gradient(90deg, #F87098, #F9A8C0)",
            boxShadow: "0 6px 20px rgba(248,112,152,0.4)",
          }}>
          开始创建宝宝档案
        </button>
        <div className="text-center mt-3.5 text-xs text-[#9A8090]">
          已有档案？{" "}
          <span
            className="text-[#F87098] font-semibold cursor-pointer"
            onClick={() => navigate("/", { replace: true })}>
            直接进入首页
          </span>
        </div>
      </div>
    </div>
  );
}
