/**
 * 首页
 * UI 严格对齐 minicare/ui-draft/home.html
 *
 * 组件结构（已按职责拆分）：
 * ┌─ HomePage（路由级页面，负责数据获取 + 状态管理）
 * │  ├─ HeroSection（英雄区：渐变背景 + 宝宝卡片 + 今日统计）
 * │  ├─ QuickActions（快捷记录宫格 4×2）
 * │  ├─ TodayTimeline（今日记录时间线）
 * │  ├─ RecordActionSheet（点击时间线条目后弹出的操作弹层）
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
import RecordActionSheet from "@/pages/records-list/RecordActionSheet";
import { RECORD_ROUTES } from "@/lib/constants";
import type { TodayRecord } from "@/api/types";
import type { BabyStat } from "./HeroSection";

// 支持删除的记录类型（与 recordsApi 的子模块 key 保持一致）
type DeletableType = "feeding" | "sleep" | "diaper" | "activity" | "health" | "growth" | "medical" | "symptom";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const deletableApis = recordsApi as unknown as Record<DeletableType, { remove?: (familyId: string, id: string) => Promise<void> }>;

export default function HomePage() {
  const navigate = useNavigate();
  const { currentFamily, currentBaby, setCurrentFamily, setCurrentBaby } = useAppStore();

  const [todayRecords, setTodayRecords] = useState<TodayRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [fabOpen, setFabOpen] = useState(false);

  // 时间线记录操作弹层
  const [selectedRecord, setSelectedRecord] = useState<TodayRecord | null>(null);
  const [actionOpen, setActionOpen] = useState(false);

  const { showToast, ToastNode } = useToast();

  // 加载今日记录（可复用，删除后刷新）
  const loadTodayRecords = async (familyId: string) => {
    try {
      const recs = await recordsApi.today(familyId);
      setTodayRecords(recs);
    } catch {
      // 今日无记录属于正常状态，不报错
    }
  };

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

        // 3. 加载今日记录
        await loadTodayRecords(family.id);
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

  // 今日总奶量：从 detail.feed_type / detail.formula_ml 读取结构化字段
  const totalMl = feedingRecs.reduce((acc, r) => {
    const d = (r.detail ?? {}) as Record<string, unknown>;
    if (d.feed_type === "formula" && d.formula_ml) return acc + Number(d.formula_ml);
    return acc;
  }, 0);

  // 今日总睡眠：从 detail.duration_min 读取（已结束的睡眠才有值）
  const totalSleepMin = sleepRecs.reduce((acc, r) => {
    const d = (r.detail ?? {}) as Record<string, unknown>;
    if (d.duration_min) return acc + Number(d.duration_min);
    return acc;
  }, 0);
  // "—" 表示尚无睡眠记录
  const sleepH = totalSleepMin >= 60 ? `${Math.floor(totalSleepMin / 60)}` : "—";

  const babyStats: BabyStat[] = [
    { val: totalMl > 0 ? totalMl : feedingRecs.length, unit: totalMl > 0 ? "ml" : "次", label: "今日奶量" },
    { val: sleepH, unit: "h", label: "今日睡眠" },
    { val: diaperRecs.length, unit: "次", label: "换尿布" },
    { val: symptomRecs.length, unit: "项", label: "表现" },
  ];

  // ── 时间线操作处理 ────────────────────────────────────────────────────────

  const handleRecordClick = (record: TodayRecord) => {
    setSelectedRecord(record);
    setActionOpen(true);
  };

  const handleEdit = (record: TodayRecord) => {
    const route = RECORD_ROUTES[record.type];
    if (!route) {
      showToast("暂不支持编辑该类型记录");
      return;
    }
    // 跳转表单页，带上 record 数据（表单页通过 location.state.record 读取）
    // TodayRecord 不包含完整字段，传递 id + type，表单页按需加载
    navigate(route, { state: { record: { id: record.id, type: record.type } } });
  };

  const handleDelete = async (record: TodayRecord) => {
    if (!currentFamily) return;
    const type = record.type as DeletableType;
    const api = deletableApis[type];
    if (!api?.remove) {
      showToast("暂不支持删除该类型记录");
      return;
    }
    try {
      await api.remove(currentFamily.id, record.id);
      // 乐观更新：立即从列表移除
      setTodayRecords((prev) => prev.filter((r) => r.id !== record.id));
      showToast("✓ 记录已删除");
    } catch {
      showToast("删除失败，请重试");
    }
  };

  return (
    <div className="min-h-full bg-bg">
      {/* ── 英雄区（渐变背景 + 宝宝卡片） ── */}
      <HeroSection currentBaby={currentBaby} stats={babyStats} />

      {/* ── 内容区（白色背景，含快捷宫格和时间线） ── */}
      <div className="px-4 space-y-4 pt-3 pb-8">
        <QuickActions onMoreClick={() => setFabOpen(true)} />
        <TodayTimeline records={todayRecords} onRecordClick={handleRecordClick} />
      </div>

      {/* ── FAB 底部弹层 ── */}
      <FabSheet open={fabOpen} onClose={() => setFabOpen(false)} />

      {/* ── 时间线记录操作弹层 ── */}
      <RecordActionSheet
        open={actionOpen}
        record={selectedRecord}
        onClose={() => setActionOpen(false)}
        onEdit={(rec) => handleEdit(rec as TodayRecord)}
        onDelete={(rec) => handleDelete(rec as TodayRecord)}
      />

      {/* ── Toast 轻提示 ── */}
      {ToastNode}
    </div>
  );
}
