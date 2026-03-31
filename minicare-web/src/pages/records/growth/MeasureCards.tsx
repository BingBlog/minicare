/**
 * 生长记录 - 测量数据预览卡片（3列网格）
 *
 * 点击卡片可激活对应的测量项（联动下方输入框高亮）
 */
import React from "react";

type MeasureKey = "height" | "weight" | "head";

interface MeasureCard {
  key: MeasureKey;
  label: string;
  unit: string;
  color: string;
  icon: React.ReactNode;
  value: string;
}

// SVG 图标集合
const HeightIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="#9B8ED8"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 22, height: 22 }}>
    <path d="M12 22V2M5 7l7-5 7 5M5 17l7 5 7-5" />
  </svg>
);
const WeightIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="#F0B8C8"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 22, height: 22 }}>
    <circle cx="12" cy="8" r="3" />
    <path d="M3 21h18l-2-9H5z" />
  </svg>
);
const HeadIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="#B8D8C8"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 22, height: 22 }}>
    <circle cx="12" cy="12" r="10" />
  </svg>
);

interface Props {
  height: string;
  weight: string;
  head: string;
  activeCard: MeasureKey | null;
  onActivate: (key: MeasureKey | null) => void;
}

export default function MeasureCards({
  height,
  weight,
  head,
  activeCard,
  onActivate,
}: Props) {
  const cards: MeasureCard[] = [
    {
      key: "height",
      label: "身高/身长",
      unit: "cm",
      color: "#9B8ED8",
      icon: <HeightIcon />,
      value: height,
    },
    {
      key: "weight",
      label: "体重",
      unit: "kg",
      color: "#F0B8C8",
      icon: <WeightIcon />,
      value: weight,
    },
    {
      key: "head",
      label: "头围",
      unit: "cm",
      color: "#B8D8C8",
      icon: <HeadIcon />,
      value: head,
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-2.5 px-4 mb-3">
      {cards.map(({ key, label, unit, color, icon, value }) => (
        <button
          key={key}
          type="button"
          onClick={() => onActivate(activeCard === key ? null : key)}
          className="flex flex-col items-center py-3.5 px-2 rounded-2xl border text-center transition-all"
          style={{
            borderColor: activeCard === key ? color : "transparent",
            background: activeCard === key ? color + "18" : "#fff",
            boxShadow: "0 1px 6px rgba(200,100,120,0.08)",
          }}>
          <div className="flex items-center justify-center mb-1.5 h-7">
            {icon}
          </div>
          <div className="text-[22px] font-extrabold text-[#4A3035] leading-none">
            {value || "—"}
          </div>
          <div className="text-[12px] font-medium text-[#9A8090] mt-0.5">
            {unit}
          </div>
          <div
            className="text-[11px] mt-1"
            style={{
              color: activeCard === key ? color : "#9A8090",
              fontWeight: activeCard === key ? 600 : 400,
            }}>
            {label}
          </div>
        </button>
      ))}
    </div>
  );
}
