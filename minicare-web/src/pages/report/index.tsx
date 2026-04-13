/**
 * 数据分析页面
 *
 * 结构：
 *   - 页面标题「分析」+ 时间范围选择器
 *   - 横向 Tab 切换：饮食 / 尿布 / 生长 / 睡眠 / 健康
 *   - 各 Tab 内嵌图表 + 数据洞察
 *   - 右上角导出按钮
 *
 * 时间范围默认值（差异化）：
 *   - 饮食：30天
 *   - 尿布：14天
 *   - 生长：从出生
 *   - 睡眠：14天
 *   - 健康：7天
 */
import { useState, useCallback, useEffect, useMemo } from "react";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import { reportApi } from "@/api/report";
import type {
  DailyFeedingData,
  DailyDiaperData,
  DailySleepData,
  DailyHealthData,
  GrowthRecord,
} from "@/api/report";
import { FeedingTab, DiaperTab, GrowthTab, SleepTab, HealthTab } from "./tabs";

// Tab 类型定义
type TabKey = "feeding" | "diaper" | "growth" | "sleep" | "health";

// Tab 配置
const TAB_CONFIG: Array<{ key: TabKey; label: string }> = [
  { key: "growth", label: "生长" },
  { key: "feeding", label: "饮食" },
  { key: "sleep", label: "睡眠" },
  { key: "diaper", label: "尿布" },
  { key: "health", label: "健康" },
];

// 时间范围选项
const TIME_RANGES: Array<{ key: string; label: string; days: number }> = [
  { key: "7", label: "7天", days: 7 },
  { key: "14", label: "14天", days: 14 },
  { key: "30", label: "30天", days: 30 },
  { key: "90", label: "90天", days: 90 },
  { key: "180", label: "半年", days: 180 },
  { key: "365", label: "一年", days: 365 },
  // { key: "birth", label: "出生", days: 0 }, // 特殊处理
];

// 各 Tab 默认时间范围
const DEFAULT_RANGE_MAP: Record<TabKey, string> = {
  feeding: "30",
  diaper: "30",
  growth: "birth",
  sleep: "30",
  health: "30",
};

/**
 * 计算日期范围
 */
function calcDateRange(
  rangeKey: string,
  birthDate?: string | null,
): { startDate: string; endDate: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  if (rangeKey === "birth" && birthDate) {
    return { startDate: birthDate.slice(0, 10), endDate: fmt(now) };
  }

  const days = parseInt(rangeKey, 10);
  if (isNaN(days) || days <= 0) {
    // 默认 30 天
    const start = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
    return { startDate: fmt(start), endDate: fmt(now) };
  }

  const start = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  return { startDate: fmt(start), endDate: fmt(now) };
}

/** 与 TIME_RANGES 中长周期选项对应的展示前缀 */
const LONG_RANGE_LABEL: Record<string, string> = {
  "90": "近3个月",
  "180": "近半年",
  "365": "近一年",
};

/**
 * 获取时间范围描述文本
 */
function getRangeText(rangeKey: string, birthDate?: string | null): string {
  const { startDate, endDate } = calcDateRange(rangeKey, birthDate);
  const fmtCN = (d: string) => {
    const [y, m, day] = d.split("-");
    return `${parseInt(m)}月${parseInt(day)}日`;
  };

  if (rangeKey === "birth") {
    return `从出生 · ${fmtCN(startDate)}—${fmtCN(endDate)}`;
  }

  const longLabel = LONG_RANGE_LABEL[rangeKey];
  if (longLabel) {
    return `${longLabel} · ${fmtCN(startDate)}—${fmtCN(endDate)}`;
  }

  const days = parseInt(rangeKey, 10);
  return `${days}天 · ${fmtCN(startDate)}—${fmtCN(endDate)}`;
}

// ══ 分析页面主体 ══════════════════════════════════════════════════
export default function AnalysisPage() {
  const { currentBaby, currentFamily } = useAppStore();
  const { showToast, ToastNode } = useToast();

  // 当前激活的 Tab
  const [activeTab, setActiveTab] = useState<TabKey>("feeding");

  // 各 Tab 的时间范围（差异化）
  const [rangeMap, setRangeMap] =
    useState<Record<TabKey, string>>(DEFAULT_RANGE_MAP);

  // 各 Tab 独立的图表数据状态
  const [feedingData, setFeedingData] = useState<DailyFeedingData[] | null>(null);
  const [diaperData, setDiaperData] = useState<DailyDiaperData[] | null>(null);
  const [sleepData, setSleepData] = useState<DailySleepData[] | null>(null);
  const [healthData, setHealthData] = useState<DailyHealthData[] | null>(null);
  const [growthData, setGrowthData] = useState<GrowthRecord[] | null>(null);
  const [loading, setLoading] = useState(false);

  const babyGender = currentBaby?.gender as "male" | "female" | null;
  const babyBirthDate = currentBaby?.birth_date;

  // 当前 Tab 的时间范围
  const currentRange = rangeMap[activeTab];

  // 加载当前 Tab 的数据（只请求该 Tab 对应的接口）
  const loadChartData = useCallback(async () => {
    if (!currentFamily?.id || !currentBaby?.id) return;

    setLoading(true);
    const { startDate, endDate } = calcDateRange(currentRange, babyBirthDate);
    const params = { babyId: currentBaby.id, startDate, endDate };

    try {
      switch (activeTab) {
        case "feeding": {
          const res = await reportApi.getFeedingChartData(currentFamily.id, params);
          setFeedingData(res.daily);
          break;
        }
        case "diaper": {
          const res = await reportApi.getDiaperChartData(currentFamily.id, params);
          setDiaperData(res.daily);
          break;
        }
        case "sleep": {
          const res = await reportApi.getSleepChartData(currentFamily.id, params);
          setSleepData(res.daily);
          break;
        }
        case "health": {
          const res = await reportApi.getHealthChartData(currentFamily.id, params);
          setHealthData(res.daily);
          break;
        }
        case "growth": {
          const res = await reportApi.getGrowthChartData(currentFamily.id, params);
          setGrowthData(res.records);
          break;
        }
      }
    } catch (e) {
      console.error("[analysis] loadChartData error", e);
      showToast("数据加载失败，请重试");
    } finally {
      setLoading(false);
    }
  }, [
    activeTab,
    currentFamily?.id,
    currentBaby?.id,
    currentRange,
    babyBirthDate,
    showToast,
  ]);

  // Tab 切换或时间范围变化时加载数据
  useEffect(() => {
    loadChartData();
  }, [loadChartData]);

  // 切换 Tab（同时清空目标 Tab 的旧数据，触发重新加载）
  const handleTabChange = useCallback((tab: TabKey) => {
    setActiveTab(tab);
    // 清空目标 Tab 的数据，避免展示上一个时间范围的旧数据
    switch (tab) {
      case "feeding": setFeedingData(null); break;
      case "diaper":  setDiaperData(null);  break;
      case "sleep":   setSleepData(null);   break;
      case "health":  setHealthData(null);  break;
      case "growth":  setGrowthData(null);  break;
    }
  }, []);

  // 切换时间范围
  const handleRangeChange = useCallback(
    (rangeKey: string) => {
      setRangeMap((prev) => ({
        ...prev,
        [activeTab]: rangeKey,
      }));
    },
    [activeTab],
  );

  // 导出报告
  const handleExport = useCallback(() => {
    // TODO: 实现导出功能（PNG/PDF）
    showToast("导出功能开发中");
  }, [showToast]);

  return (
    <div className="min-h-full bg-bg flex flex-col">
      {/* ── 页面标题 ── */}
      <div className="px-5 pt-12 pb-2 bg-bg flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="text-[22px] font-extrabold text-[#4A3035] tracking-tight">
            分析
          </div>
          <button
            onClick={handleExport}
            className="text-sm text-[#F87098] font-medium">
            导出
          </button>
        </div>
        <div className="text-[13px] text-[#9A8090] mt-0.5">
          {currentBaby?.name ?? "宝宝"}的数据洞察
        </div>
      </div>

      {/* ── 横向 Tab 导航 ── */}
      <div className="px-5 py-2 bg-bg flex-shrink-0 border-b border-gray-100">
        <div className="flex gap-1 overflow-x-auto scrollbar-hide">
          {TAB_CONFIG.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`px-4 py-2 text-sm font-medium rounded-full whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? "bg-[#F87098] text-white"
                  : "bg-gray-100 text-gray-600"
              }`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 时间范围选择器 ── */}
      <div className="px-5 py-2 bg-bg flex-shrink-0">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {TIME_RANGES.map((range) => {
            // 生长 Tab 隐藏非"从出生"的选项
            if (activeTab === "growth" && range.key !== "birth") return null;

            return (
              <button
                key={range.key}
                onClick={() => handleRangeChange(range.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                  currentRange === range.key
                    ? "bg-[#F87098]/10 text-[#F87098] border border-[#F87098]/30"
                    : "bg-white text-gray-500 border border-gray-200"
                }`}>
                {range.label}
              </button>
            );
          })}
        </div>
        <div className="text-xs text-gray-400 mt-1.5">
          {getRangeText(currentRange, babyBirthDate)}
        </div>
      </div>

      {/* ── 可滚动内容区 ── */}
      <div className="flex-1 overflow-y-auto pb-28 px-5 py-4">
        {activeTab === "feeding" && (
          <FeedingTab
            data={feedingData}
            loading={loading}
          />
        )}
        {activeTab === "diaper" && (
          <DiaperTab
            data={diaperData}
            loading={loading}
          />
        )}
        {activeTab === "growth" && (
          <GrowthTab
            data={growthData}
            loading={loading}
            babyGender={babyGender}
            babyBirthDate={babyBirthDate ?? null}
          />
        )}
        {activeTab === "sleep" && (
          <SleepTab data={sleepData} loading={loading} />
        )}
        {activeTab === "health" && (
          <HealthTab
            data={healthData}
            loading={loading}
          />
        )}
      </div>

      {/* Toast 全局提示 */}
      {ToastNode}
    </div>
  );
}
