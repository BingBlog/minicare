/**
 * 饮食分析 Tab
 * 展示奶量趋势线、母乳/配方奶/辅食占比堆积图、多奶粉类型时按比例的配方奶堆积图
 */
import React, { useMemo } from "react";
import { LineChart, StackedBarChart } from "@/components/charts";
import type { DailyFeedingData } from "@/api/report";
import { milkTypeOptions } from "@/pages/records/feeding/types";

interface FeedingTabProps {
  data: DailyFeedingData[] | null;
  loading: boolean;
}

const UNLABELED_MILK_KEY = "unlabeled";

/** 本地日历今天 YYYY-MM-DD（与记录 date 字段对齐，用于日均排除当日） */
function localTodayYMD(): string {
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, "0");
  const day = String(n.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 格式化日期为简短标签（MM-DD -> M/D） */
function formatDateLabel(dateStr: string): string {
  const [, month, day] = dateStr.split("-");
  return `${parseInt(month ?? "0", 10)}/${parseInt(day ?? "0", 10)}`;
}

function milkTypeLabel(key: string): string {
  if (key === UNLABELED_MILK_KEY) return "未标注";
  return milkTypeOptions.find((o) => o.key === key)?.label ?? key;
}

function milkTypeColor(key: string): string {
  return milkTypeOptions.find((o) => o.key === key)?.color ?? "#9CA3AF";
}

export function FeedingTab({ data, loading }: FeedingTabProps) {
  const milkSeries = useMemo(() => {
    if (!data?.length) return null;
    const totals: Record<string, number> = {};
    for (const d of data) {
      const m = d.formulaMlByMilkType;
      if (!m) continue;
      for (const [k, v] of Object.entries(m)) {
        totals[k] = (totals[k] ?? 0) + v;
      }
    }
    const keys = Object.keys(totals).filter((k) => totals[k] > 0);
    keys.sort((a, b) => totals[b] - totals[a]);
    const seriesColors: Record<string, string> = {};
    const seriesLabels: Record<string, string> = {};
    for (const k of keys) {
      seriesColors[k] = milkTypeColor(k);
      seriesLabels[k] = milkTypeLabel(k);
    }
    return { order: keys, seriesColors, seriesLabels };
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400 text-sm">加载中...</div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="text-gray-400 text-sm mb-2">暂无饮食数据</div>
        <div className="text-gray-300 text-xs">
          开始记录宝宝的饮食后，这里将展示分析图表
        </div>
      </div>
    );
  }

  const todayYmd = localTodayYMD();
  /** 日均统计用：不含当日，避免当天少量记录拉偏均值 */
  const hist = data.filter((d) => d.date !== todayYmd);
  const histDays = hist.length;

  const lineChartData = data.map((d) => ({
    label: formatDateLabel(d.date),
    value: d.formulaMl,
  }));

  const stackedData = data.map((d) => ({
    label: formatDateLabel(d.date),
    values: {
      母乳: d.breastCount,
      配方奶: Math.round(d.formulaMl / 90),
      辅食: d.complementaryCount,
    },
  }));

  const hasBreast = data.some((d) => d.breastCount > 0);
  const hasFormula = data.some((d) => d.formulaMl > 0);
  const hasComplementary = data.some((d) => d.complementaryCount > 0);
  const feedTypeVariety = [hasBreast, hasFormula, hasComplementary].filter(
    Boolean,
  ).length;
  const showFeedTypeDistribution = feedTypeVariety >= 2;

  const showMilkTypeStacked =
    milkSeries != null && milkSeries.order.length >= 2;

  const milkStackedData = showMilkTypeStacked
    ? data.map((d) => ({
        label: formatDateLabel(d.date),
        values: Object.fromEntries(
          milkSeries.order.map((k) => [k, d.formulaMlByMilkType?.[k] ?? 0]),
        ),
      }))
    : [];

  const totalFormulaHist = hist.reduce((sum, d) => sum + d.formulaMl, 0);
  const totalBreastHist = hist.reduce((sum, d) => sum + d.breastCount, 0);
  const totalFormulaFeedsHist = hist.reduce(
    (sum, d) => sum + (d.formulaCount ?? 0),
    0,
  );
  const totalFeedingSessionsHist = totalBreastHist + totalFormulaFeedsHist;
  const totalComplementaryHist = hist.reduce(
    (sum, d) => sum + d.complementaryCount,
    0,
  );

  const avgFormula =
    histDays > 0 ? Math.round(totalFormulaHist / histDays) : null;
  const avgFeedingSessions =
    histDays > 0 ? Math.round(totalFeedingSessionsHist / histDays) : null;
  const avgComplementary =
    histDays > 0 ? Math.round(totalComplementaryHist / histDays) : null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl p-3 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">日均奶量</div>
          {avgFormula != null ? (
            <div className="text-lg font-semibold text-[#F87098]">
              {avgFormula}
              <span className="text-xs font-normal ml-0.5">ml</span>
            </div>
          ) : (
            <div className="text-base text-gray-400">—</div>
          )}
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">日均喂奶次数</div>
          {avgFeedingSessions != null ? (
            <div className="text-lg font-semibold text-[#9B8ED8]">
              {avgFeedingSessions}
              <span className="text-xs font-normal ml-0.5">次</span>
            </div>
          ) : (
            <div className="text-base text-gray-400">—</div>
          )}
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">日均辅食次数</div>
          {histDays === 0 ? (
            <div className="text-base text-gray-400">—</div>
          ) : avgComplementary === 0 ? (
            <div className="text-[11px] text-gray-400 font-normal leading-snug mt-0.5">
              还未添加辅食
            </div>
          ) : (
            <div className="text-lg font-semibold text-[#6BCB77]">
              {avgComplementary}
              <span className="text-xs font-normal ml-0.5">次</span>
            </div>
          )}
        </div>
      </div>
      <p className="text-[10px] text-gray-400 leading-relaxed px-0.5 mt-1.5">
        日均不含当日，减少当天记录波动影响
      </p>

      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="text-sm font-medium text-gray-700 mb-3">
          配方奶量趋势
        </div>
        <LineChart
          data={lineChartData}
          height={180}
          fillArea
          smooth
          colors={{ primary: "#F87098" }}
          axis={{
            yFormat: (v) => `${Math.round(v)}ml`,
          }}
        />
      </div>

      {showFeedTypeDistribution && (
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-sm font-medium text-gray-700 mb-3">
            每日喂养类型分布
          </div>
          <StackedBarChart
            data={stackedData}
            height={180}
            seriesOrder={["母乳", "配方奶", "辅食"]}
            seriesColors={{
              母乳: "#9B8ED8",
              配方奶: "#F87098",
              辅食: "#6BCB77",
            }}
            axis={{
              yFormat: (v) => `${Math.round(v)}次`,
            }}
            showLegend
          />
        </div>
      )}

      {showMilkTypeStacked && milkSeries && (
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-sm font-medium text-gray-700 mb-3">
            每日配方奶（按奶粉类型）
          </div>
          <StackedBarChart
            data={milkStackedData}
            height={180}
            seriesOrder={milkSeries.order}
            seriesColors={milkSeries.seriesColors}
            seriesLabels={milkSeries.seriesLabels}
            axis={{
              yFormat: (v) => `${Math.round(v)}ml`,
            }}
            showLegend
          />
        </div>
      )}

      <div className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-xl p-4">
        <div className="text-sm font-medium text-gray-700 mb-2">数据洞察</div>
        <div className="text-xs text-gray-600 space-y-1">
          {avgFormula != null && avgFormula > 0 && (
            <p>
              • 宝宝日均配方奶量 {avgFormula}ml，
              {avgFormula < 500
                ? "建议关注是否摄入充足"
                : avgFormula > 1000
                  ? "奶量较高，注意观察是否有过度喂养"
                  : "处于正常范围"}
            </p>
          )}
          {avgFeedingSessions != null && avgFeedingSessions > 0 && (
            <p>
              • 日均喂奶约 {avgFeedingSessions} 次
              {totalBreastHist > 0
                ? "，母乳有助于为宝宝提供营养与免疫保护"
                : ""}
            </p>
          )}
          {avgComplementary != null && avgComplementary > 0 && (
            <p>
              • 日均辅食约 {avgComplementary} 次，建议逐步增加辅食种类和质地
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
