/**
 * 报告页面
 * UI 严格对齐 minicare/ui-draft/report.html
 *
 * 结构：
 *   - 页面标题「报告」+ 副标题
 *   - RangeSelector  时间范围选择（7天 / 14天 / 30天 / 自定义）
 *   - GeneratePanel  生成综合报告面板（含加载状态）
 *   - ReportPreview  报告预览卡片（生成后展示）
 *   - HistoryList    历史报告列表
 *   - FullReportModal 完整历史报告底部弹层
 *
 * 子组件均位于 ./report/ 目录下
 */
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import RangeSelector from "./RangeSelector";
import GeneratePanel from "./GeneratePanel";
import ReportPreview from "./ReportPreview";
import HistoryList, { HISTORY_ITEMS } from "./HistoryList";
import FullReportModal from "./FullReportModal";
import type { ReportData } from "./FullReportModal";
import type { HistoryItem } from "./HistoryList";

/**
 * 根据时间范围 key 生成描述文本
 *
 * @param key - "7" | "14" | "30" | "custom"
 * @returns 如："2026年3月24日—2026年3月30日（7天）"
 */
function getRangeText(key: string): string {
  const now = new Date();
  /** 将日期格式化为 "XXXX年X月X日" */
  const fmt = (d: Date) => `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  if (key === "custom") return "自定义时间范围";
  const days = parseInt(key, 10);
  // 起始日期 = 今天 - (days - 1)，使今天包含在内
  const start = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  return `${fmt(start)}—${fmt(now)}（${days}天）`;
}

// ══ 报告页面主体 ══════════════════════════════════════════════════
export default function ReportPage() {
  const { currentBaby } = useAppStore();
  const { showToast, ToastNode } = useToast();

  /** 当前激活的时间范围 key（"7" / "14" / "30" / "custom"） */
  const [activeRange, setActiveRange] = useState("7");

  /** PDF 是否正在生成（展示 spinner） */
  const [generating, setGenerating] = useState(false);
  /** 是否已生成过报告（决定按钮文案） */
  const [generated, setGenerated] = useState(false);

  /** 完整报告弹层是否打开 */
  const [modalOpen, setModalOpen] = useState(false);
  /** 传给弹层的报告元数据 */
  const [modalData, setModalData] = useState<ReportData | null>(null);

  /** 宝宝名称，回落为「小宝」 */
  const babyName = currentBaby?.name ?? "小宝";

  /** 点击「生成报告」：模拟 2 秒 PDF 生成过程 */
  const handleGenerate = () => {
    if (generating) return;
    setGenerating(true);
    setTimeout(() => {
      setGenerating(false);
      setGenerated(true);
      showToast("✓ 综合报告已生成");
    }, 2000);
  };

  /** 点击历史报告条目：打开完整报告弹层 */
  const handleOpenHistory = (item: HistoryItem) => {
    setModalData({
      title: `${babyName} · ${item.title}`,
      // 固定附加"牛奶蛋白过敏（中度）"，实际应从 currentBaby 动态读取
      dateRange: `${item.date} · ${item.range} · 牛奶蛋白过敏（中度）`,
    });
    setModalOpen(true);
  };

  return (
    <div className="min-h-full bg-bg flex flex-col">
      {/* ── 页面标题 ── */}
      <div className="px-5 pt-12 pb-1 bg-bg flex-shrink-0">
        <div className="text-[22px] font-extrabold text-[#4A3035] tracking-tight">报告</div>
        <div className="text-[13px] text-[#9A8090] mt-0.5">生成综合报告 · 一键分享给医生</div>
      </div>

      {/* ── 可滚动内容区 ── */}
      <div className="flex-1 overflow-y-auto pb-28">
        {/* 时间范围区块 */}
        <div className="text-[12px] font-semibold text-[#9A8090] px-5 pb-1.5 tracking-[.5px]" style={{ paddingTop: 14 }}>
          时间范围
        </div>
        <RangeSelector activeKey={activeRange} onChange={setActiveRange} />

        {/* 生成综合报告区块 */}
        <div className="text-[12px] font-semibold text-[#9A8090] px-5 pb-1.5 tracking-[.5px]" style={{ paddingTop: 14 }}>
          生成综合报告
        </div>
        <GeneratePanel rangeText={getRangeText(activeRange)} generating={generating} generated={generated} onGenerate={handleGenerate} />

        {/* 报告预览区块（生成后才显示） */}
        {generated && (
          <>
            <div className="text-[12px] font-semibold text-[#9A8090] px-5 pb-1.5 tracking-[.5px]" style={{ paddingTop: 14 }}>
              报告预览
            </div>
            <ReportPreview
              babyName={babyName}
              rangeText={getRangeText(activeRange)}
              onShare={() => showToast("调用系统分享面板")}
              onSave={() => showToast("报告已保存到文件")}
            />
          </>
        )}

        {/* 历史报告区块 */}
        <div className="text-[12px] font-semibold text-[#9A8090] px-5 pb-1.5 tracking-[.5px]" style={{ paddingTop: 14 }}>
          历史报告
        </div>
        <HistoryList items={HISTORY_ITEMS} onOpen={handleOpenHistory} />

        <div className="h-6" />
      </div>

      {/* ── 完整历史报告弹层 ── */}
      <FullReportModal
        open={modalOpen}
        data={modalData}
        onClose={() => setModalOpen(false)}
        onShare={() => {
          setModalOpen(false);
          showToast("调用系统分享面板");
        }}
        onSave={() => {
          setModalOpen(false);
          showToast("报告已保存到文件");
        }}
      />

      {/* Toast 全局提示 */}
      {ToastNode}

      {/* spin 关键帧（供 GeneratePanel 旋转动画使用） */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
