/**
 * 饮食记录 - Tab 选择器（奶粉 / 母乳 / 营养素 / 辅食）
 *
 * 样式对齐 ui-draft/form-feeding.html 的分段控制器风格
 */
import type { FeedTab } from "./types";

interface Tab {
  key: FeedTab;
  label: string;
}

const TABS: Tab[] = [
  { key: "formula", label: "配方奶" },
  { key: "breast", label: "母乳" },
  { key: "supplement", label: "营养素" },
  { key: "food", label: "辅食" },
];

interface Props {
  value: FeedTab;
  onChange: (tab: FeedTab) => void;
}

/**
 * 分段切换控件
 * @param value    当前激活的 Tab
 * @param onChange Tab 切换回调
 */
export default function TabSelector({ value, onChange }: Props) {
  return (
    <div
      className="mx-4 mt-3 mb-3.5 flex gap-0 rounded-2xl overflow-hidden p-[3px]"
      style={{ background: "#F0E8EA" }}>
      {TABS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className="flex-1 py-[9px] text-[13px] font-semibold rounded-[13px] transition-all"
          style={{
            background: value === key ? "#fff" : "transparent",
            color: value === key ? "#F87098" : "#9A8090",
            boxShadow: value === key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
          }}>
          {label}
        </button>
      ))}
    </div>
  );
}
