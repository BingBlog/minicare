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
        {/* 叉勺：饮食记录 */}
        <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
        <line x1="7" y1="2" x2="7" y2="11" />
        <path d="M21 2c0 4.4-3.6 8-8 8v12" />
      </svg>
    ),
    iconBg: "var(--color-primary-lt, #FFF0F4)",
    title: "饮食与表现追踪",
    desc: "记录每次进食与宝宝反应，轻松找到规律",
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
        {/* 用户组：家庭协作 */}
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    iconBg: "#FFF8E6",
    title: "全家一起记录",
    desc: "爸妈、祖辈同步记录，不漏一次喂奶、一个细节",
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
        {/* 趋势折线图：数据分析 */}
        <polyline points="22 12 18 8 13 13 9 9 2 16" />
        <line x1="2" y1="20" x2="22" y2="20" />
      </svg>
    ),
    iconBg: "#DCFCE7",
    title: "数据分析与科学喂养",
    desc: "生长曲线、喂养规律一目了然，每天都在进步",
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
          记录每一口，呵护每一天
        </div>

        {/* 特性卡片列表 */}
        <div className="w-full flex flex-col gap-3">
          {FEATURES.map((item) => (
            <div
              key={item.title}
              className="flex items-center gap-3.5 rounded-2xl px-4 py-3.5"
              style={{
                background: "#fff",
                boxShadow: "0 1px 6px rgba(200,100,120,0.08)",
              }}>
              <div
                className="flex items-center justify-center rounded-xl flex-shrink-0"
                style={{ width: 40, height: 40, background: item.iconBg }}>
                {item.icon}
              </div>
              <div>
                <div className="text-sm font-bold text-[#4A3035]">
                  {item.title}
                </div>
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
