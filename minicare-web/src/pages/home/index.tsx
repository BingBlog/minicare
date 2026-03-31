/**
 * 首页
 * UI 严格对齐 minicare/ui-draft/home.html
 *
 * 组件结构（已按职责拆分）：
 * ┌─ HomePage（路由级页面，负责数据获取 + 状态管理）
 * │  ├─ HeroSection（英雄区：渐变背景 + 宝宝卡片 + 今日统计）
 * │  ├─ QuickActions（快捷记录宫格 4×2）
 * │  ├─ TodayTimeline（今日记录时间线）
 * │  └─ FabSheet（FAB 底部弹层）
 * └─ useToast（Toast 轻提示 hook）
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { familyApi, babyApi, recordsApi } from "@/api";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import { FullPageSpinner } from "@/components/ui/LoadingSpinner";
import HeroSection from "./HeroSection";
import QuickActions from "./QuickActions";
import TodayTimeline from "./TodayTimeline";
import FabSheet from "./FabSheet";
import type { TodayRecord } from "@/api/types";
import type { BabyStat } from "./HeroSection";

export default function HomePage() {
  const navigate = useNavigate();
  const { currentFamily, currentBaby, setCurrentFamily, setCurrentBaby } = useAppStore();

  const [todayRecords, setTodayRecords] = useState<TodayRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [fabOpen, setFabOpen] = useState(false);

  const { showToast, ToastNode } = useToast();

  // ── 初始化加载（家庭 → 宝宝 → 今日记录） ─────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        // 1. 确保 family 已初始化
        let family = currentFamily;
        if (!family) {
          const families = await familyApi.getMine();
          if (families.length === 0) {
            navigate("/onboarding", { replace: true });
            return;
          }
          family = families[0];
          setCurrentFamily(family);
        }

        // 2. 确保 baby 已初始化
        let baby = currentBaby;
        if (!baby) {
          try {
            baby = await babyApi.get(family.id);
            setCurrentBaby(baby);
          } catch {
            navigate("/onboarding", { replace: true });
            return;
          }
        }

        // 3. 加载今日记录（失败不影响页面展示）
        try {
          const recs = await recordsApi.today(family.id);
          setTodayRecords(recs);
        } catch {
          // 今日无记录属于正常状态，不报错
        }
      } catch (err) {
        console.error("[HomePage] 加载失败", err);
        showToast("数据加载失败，请重试");
      } finally {
        setLoading(false);
      }
    }
    load();
    // 仅在首次挂载时执行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <FullPageSpinner />;

  // ── 计算今日统计（4格数据） ────────────────────────────────────────────────
  const feedingRecs = todayRecords.filter((r) => r.type === "feeding");
  const sleepRecs = todayRecords.filter((r) => r.type === "sleep");
  const diaperRecs = todayRecords.filter((r) => r.type === "diaper");
  const symptomRecs = todayRecords.filter((r) => r.type === "symptom");

  // 今日总奶量：从 note 字段中匹配 "120ml" 格式
  const totalMl = feedingRecs.reduce((acc, r) => {
    const m = (r.note || "").match(/(\d+)\s*ml/i);
    return acc + (m ? Number(m[1]) : 0);
  }, 0);

  // 今日总睡眠：从 note 字段中匹配 "60min" 格式
  const totalSleepMin = sleepRecs.reduce((acc, r) => {
    const m = (r.note || "").match(/(\d+)\s*min/i);
    return acc + (m ? Number(m[1]) : 0);
  }, 0);
  // "—" 表示尚无睡眠记录
  const sleepH = totalSleepMin >= 60 ? `${Math.floor(totalSleepMin / 60)}` : "—";

  const babyStats: BabyStat[] = [
    { val: totalMl > 0 ? totalMl : feedingRecs.length, unit: totalMl > 0 ? "ml" : "次", label: "今日奶量" },
    { val: sleepH, unit: "h", label: "今日睡眠" },
    { val: diaperRecs.length, unit: "次", label: "换尿布" },
    { val: symptomRecs.length, unit: "项", label: "表现" },
  ];

  return (
    <div className="min-h-full bg-bg">
      {/* ── 英雄区（渐变背景 + 宝宝卡片） ── */}
      <HeroSection currentBaby={currentBaby} stats={babyStats} />

      {/* ── 内容区（白色背景，含快捷宫格和时间线） ── */}
      <div className="px-4 space-y-4 pt-3 pb-8">
        <QuickActions onMoreClick={() => setFabOpen(true)} />
        <TodayTimeline records={todayRecords} />
      </div>

      {/* ── FAB 底部弹层 ── */}
      <FabSheet open={fabOpen} onClose={() => setFabOpen(false)} />

      {/* ── Toast 轻提示 ── */}
      {ToastNode}
    </div>
  );
}
