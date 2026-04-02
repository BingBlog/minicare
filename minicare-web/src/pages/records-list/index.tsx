/**
 * 记录页面
 * UI 严格对齐 minicare/ui-draft/records.html
 *
 * 组件结构（已按职责拆分）：
 * ┌─ RecordsPage（路由级页面，负责数据获取 + 状态管理）
 * │  ├─ FilterBar（顶部横向筛选栏）          → @/components/record/FilterChip
 * │  ├─ RecordGroup × N（按日期分组的记录组） → ./records-list/RecordGroup
 * │  │  └─ RecordListItem × N（单条记录）    → ./records-list/RecordListItem
 * │  ├─ RecordActionSheet（操作弹层）         → ./records-list/RecordActionSheet
 * │  ├─ EmptyState（空状态占位）              → @/components/ui/EmptyState
 * │  └─ LoadingSpinner                        → @/components/ui/LoadingSpinner
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { recordsApi } from "@/api";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import { InlineSpinner } from "@/components/ui/LoadingSpinner";
import EmptyState from "@/components/ui/EmptyState";
import { FilterBar } from "@/components/record/FilterChip";
import RecordGroup from "./RecordGroup";
import RecordActionSheet from "./RecordActionSheet";
import { getRecordTime, getDateKey, getDateLabel, getRecordType } from "@/lib/utils";
import { RECORD_ROUTES } from "@/lib/constants";
import {
  IconMilk, IconMoon, IconDroplets, IconActivity,
  IconHeart, IconSmile, IconRuler, IconStethoscope,
} from "@/components/ui/icons";
import type { RecordItem } from "@/api";
import type { FilterChipOption } from "@/components/record/FilterChip";
import type { ActionRecord } from "./RecordActionSheet";

// ── 支持的记录类型（对应 API 模块名称） ────────────────────────────────────
type RecordTypeKey = "feeding" | "sleep" | "diaper" | "activity" | "health" | "growth" | "medical" | "symptom";

/** 所有支持的记录类型 key */
const ALL_TYPE_KEYS: RecordTypeKey[] = ["feeding", "sleep", "diaper", "activity", "health", "growth", "medical", "symptom"];

// ── 筛选栏配置（不含「今天」，今天已提升为标题行独立按钮） ────────────────
const FILTER_CHIPS: FilterChipOption[] = [
  { key: "all",      label: "全部" },
  { key: "feeding",  label: "饮食",  icon: <IconMilk size={12} color="currentColor" /> },
  { key: "sleep",    label: "睡眠",  icon: <IconMoon size={12} color="currentColor" /> },
  { key: "activity", label: "活动",  icon: <IconActivity size={12} color="currentColor" /> },
  { key: "diaper",   label: "尿布",  icon: <IconDroplets size={12} color="currentColor" /> },
  { key: "health",   label: "健康",  icon: <IconHeart size={12} color="currentColor" /> },
  { key: "symptom",  label: "表现",  icon: <IconSmile size={12} color="currentColor" /> },
  { key: "growth",   label: "生长",  icon: <IconRuler size={12} color="currentColor" /> },
  { key: "medical",  label: "医疗",  icon: <IconStethoscope size={12} color="currentColor" /> },
];

export default function RecordsPage() {
  const navigate = useNavigate();
  const { currentFamily, currentBaby } = useAppStore();
  const { showToast, ToastNode } = useToast();

  const [records, setRecords] = useState<RecordItem[]>([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [todayOnly, setTodayOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  // 当前被操作的记录（用于 ActionSheet）
  const [selectedRecord, setSelectedRecord] = useState<RecordItem | null>(null);
  const [actionOpen, setActionOpen] = useState(false);

  // 刷新触发器（手动触发重新加载，仅在乐观更新失败时使用）
  const [refreshKey, setRefreshKey] = useState(0);

  // recordsApi 的各模块接口（类型断言：统一泛型签名）
  // 注意：各子 API 返回的具体记录类型（FeedingRecord 等）均符合 RecordItem 结构
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detailedApis = recordsApi as unknown as Record<
    RecordTypeKey,
    {
      list: (familyId: string, babyId: string, params?: { limit?: number; offset?: number }) => Promise<RecordItem[]>;
      remove?: (familyId: string, id: string) => Promise<void>;
    }
  >;

  // ── 数据加载（依赖 currentFamily / currentBaby / activeFilter / todayOnly / refreshKey） ─
  useEffect(() => {
    async function load() {
      if (!currentFamily || !currentBaby) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        let allRecs: RecordItem[] = [];

        if (activeFilter === "all") {
          // 并发加载所有类型（使用 allSettled 避免某一类失败影响其他）
          const results = await Promise.allSettled(
            ALL_TYPE_KEYS.map((t) =>
              detailedApis[t]?.list(currentFamily.id, currentBaby!.id, { limit: 30 }) ?? Promise.resolve([])
            )
          );
          results.forEach((r) => {
            if (r.status === "fulfilled") allRecs = allRecs.concat(r.value);
          });
        } else {
          // 只加载指定类型（单类型 API 提高响应速度）
          const t = activeFilter as RecordTypeKey;
          if (detailedApis[t]) {
            allRecs = await detailedApis[t].list(currentFamily.id, currentBaby!.id, { limit: 50 });
          }
        }

        // 按时间降序（最新在前）
        allRecs.sort((a, b) => {
          return new Date(getRecordTime(b)).getTime() - new Date(getRecordTime(a)).getTime();
        });

        // 「今天」时间过滤（由标题行切换按钮驱动，与类型筛选正交）
        if (todayOnly) {
          const todayKey = getDateKey(new Date().toISOString());
          allRecs = allRecs.filter((r) => getDateKey(getRecordTime(r)) === todayKey);
        }

        setRecords(allRecs);
      } catch {
        setRecords([]);
        showToast("加载记录失败，请重试");
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFamily, currentBaby, activeFilter, todayOnly, refreshKey]);

  // ── 无家庭/宝宝时的占位 ───────────────────────────────────────────────────
  if (!currentFamily || !currentBaby) {
    return (
      <div className="min-h-full bg-bg flex flex-col">
        <div style={{ height: 52, background: "#fff" }} />
        <div className="flex-1 flex items-center justify-center">
          <EmptyState emoji="👨‍👩‍👧" title="请先创建家庭和添加宝宝" />
        </div>
      </div>
    );
  }

  // ── 按日期分组 ────────────────────────────────────────────────────────────
  const todayKey = getDateKey(new Date().toISOString());
  const dateMap = new Map<string, RecordItem[]>();

  for (const rec of records) {
    const dk = getDateKey(getRecordTime(rec));
    if (!dateMap.has(dk)) dateMap.set(dk, []);
    dateMap.get(dk)!.push(rec);
  }

  const grouped = Array.from(dateMap.entries()).map(([dk, items]) => ({
    dateKey: dk,
    dateLabel: getDateLabel(getRecordTime(items[0])),
    isToday: dk === todayKey,
    items,
  }));

  // ── 操作记录处理 ──────────────────────────────────────────────────────────
  const handleRecordClick = (record: RecordItem) => {
    setSelectedRecord(record);
    setActionOpen(true);
  };

  const handleEdit = (record: ActionRecord) => {
    const r = record as RecordItem;
    const type = getRecordType(r);
    const route = RECORD_ROUTES[type];
    if (!route) {
      showToast("暂不支持编辑该类型记录");
      return;
    }
    // 跳转到对应表单页，携带 record 作为 state（表单页通过 location.state.record 读取）
    navigate(route, { state: { record: r } });
  };

  const handleDelete = async (record: ActionRecord) => {
    const r = record as RecordItem;
    if (!currentFamily) return;
    const type = getRecordType(r) as RecordTypeKey;
    const api = detailedApis[type];
    if (!api?.remove) {
      showToast("暂不支持删除该类型记录");
      return;
    }
    try {
      await api.remove(currentFamily.id, r.id);
      // 乐观更新：立即从列表移除，无需重新请求接口
      setRecords((prev) => prev.filter((item) => item.id !== r.id));
      showToast("✓ 记录已删除");
    } catch {
      showToast("删除失败，请重试");
    }
  };

  return (
    <div className="min-h-full bg-bg flex flex-col">
      {/* ── 筛选栏 ── */}
      <FilterBar
        options={FILTER_CHIPS}
        activeKey={activeFilter}
        onChange={setActiveFilter}
        count={loading ? undefined : records.length}
        todayOnly={todayOnly}
        onToggleToday={() => setTodayOnly((v) => !v)}
      />

      {/* ── 记录列表 ── */}
      <div className="flex-1 overflow-y-auto pb-24">
        {loading ? (
          <div className="flex justify-center py-16">
            <InlineSpinner />
          </div>
        ) : records.length === 0 ? (
          <EmptyState emoji="📋" title="暂无记录" subtitle={"点击底部 + 按钮开始记录\n宝宝的每一天"} />
        ) : (
          <>
            {grouped.map((group) => (
              <RecordGroup key={group.dateKey} group={group} onRecordClick={handleRecordClick} />
            ))}

            {/* 底部提示文字 */}
            <div className="text-center text-[11px] text-[#C0A8AD] py-3">点击记录卡片可编辑或删除</div>
            <div className="h-4" />
          </>
        )}
      </div>

      {/* ── 记录操作弹层 ── */}
      <RecordActionSheet
        open={actionOpen}
        record={selectedRecord}
        onClose={() => setActionOpen(false)}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {/* Toast */}
      {ToastNode}
    </div>
  );
}