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
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { familyApi, babyApi, recordsApi, authApi } from "@/api";
import type { PendingInvite } from "@/api/family";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import { FullPageSpinner } from "@/components/ui/LoadingSpinner";
import HeroSection from "./HeroSection";
import QuickActions from "./QuickActions";
import TodayTimeline from "./TodayTimeline";
import FabSheet from "./FabSheet";
import SleepBanner from "./SleepBanner";
import FeedingBanner from "./FeedingBanner";
import GuestHome from "./GuestHome";
import DailyComparison from "./DailyComparison";
import RecordActionSheet from "@/pages/records-list/RecordActionSheet";
import InviteModal from "@/components/ui/InviteModal";
import { RECORD_ROUTES, FAB_GROUPS } from "@/lib/constants";
import { useQuickActionKeys } from "@/lib/useQuickActionKeys";
import type { TodayRecord, SleepRecord } from "@/api/types";
import type { RecordItem } from "@/api";
import type { ActionRecord } from "@/pages/records-list/RecordActionSheet";
import type { BabyStat } from "./HeroSection";
import dayjs from "dayjs";

// 支持删除的记录类型（与 recordsApi 的子模块 key 保持一致）
type DeletableType =
  | "feeding"
  | "sleep"
  | "diaper"
  | "activity"
  | "health"
  | "growth"
  | "medical"
  | "symptom";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const deletableApis = recordsApi as unknown as Record<
  DeletableType,
  { remove?: (familyId: string, id: string) => Promise<void> }
>;

export default function HomePage() {
  const navigate = useNavigate();
  const { token, currentFamily, currentBaby, setCurrentFamily, setCurrentBaby, setAllBabies } =
    useAppStore();

  // 游客模式：未登录时展示 GuestHome
  if (!token) {
    return <GuestHome />;
  }

  // 快捷区已用的 key（用于动态过滤 FAB 弹层）
  const { keys: quickKeys } = useQuickActionKeys();

  // 动态过滤首页「更多」弹层：排除已在快捷区的功能（§5.8.6）
  const filteredFabGroups = FAB_GROUPS
    .map((g) => ({ ...g, keys: g.keys.filter((k) => !quickKeys.includes(k)) }))
    .filter((g) => g.keys.length > 0);
  const filteredFabCount = filteredFabGroups.reduce((acc, g) => acc + g.keys.length, 0);

  const [todayRecords, setTodayRecords] = useState<TodayRecord[]>([]);
  const [yesterdayRecords, setYesterdayRecords] = useState<TodayRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [fabOpen, setFabOpen] = useState(false);

  // 进行中的睡眠记录（用于展示 SleepBanner）
  const [ongoingSleep, setOngoingSleep] = useState<SleepRecord | null>(null);

  // 时间线记录操作弹层
  const [selectedRecord, setSelectedRecord] = useState<ActionRecord | null>(
    null,
  );
  const [actionOpen, setActionOpen] = useState(false);

  // ── 邀请相关状态 ─────────────────────────────────────────────────────
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [needsOnboardingReason, setNeedsOnboardingReason] = useState<'no_family' | 'no_baby'>('no_family');

  const { showToast, ToastNode } = useToast();

  // 检查待处理邀请
  const checkPendingInvites = useCallback(async () => {
    if (!token) return;
    try {
      const invites = await familyApi.getPendingInvites();
      if (invites.length > 0) {
        setPendingInvites(invites);
        setInviteModalOpen(true);
      }
    } catch {
      // 静默失败
    }
  }, [token]);

  // 接受邀请后的处理
  const handleInviteAccept = useCallback(async () => {
    setPendingInvites([]);
    setInviteModalOpen(false);
    try {
      const babies = await babyApi.getMine();
      if (babies.length > 0) {
        setAllBabies(babies);
        const baby = babies[0];
        const family = { id: baby.family_id, name: baby.family_name || '', role: baby.family_role || 'member', createdAt: '' };
        setCurrentFamily(family);
        setCurrentBaby(baby);
        setNeedsOnboarding(false);
        loadTodayRecords(family.id);
        loadYesterdayRecords(family.id);
      }
    } catch {
      // 静默失败
    }
  }, [setCurrentFamily, setCurrentBaby, setAllBabies]);

  const handleInviteDecline = useCallback(() => {
    setPendingInvites([]);
    setInviteModalOpen(false);
  }, []);

  // 加载今日记录（可复用，删除后刷新）
  const loadTodayRecords = async (familyId: string) => {
    try {
      const recs = await recordsApi.today(familyId);
      setTodayRecords(recs);
    } catch {
      // 今日无记录属于正常状态，不报错
    }
  };

  const loadYesterdayRecords = async (familyId: string) => {
    try {
      const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
      const recs = await recordsApi.today(familyId, yesterday);
      setYesterdayRecords(recs);
    } catch {
      // 昨日无记录属于正常状态，不报错
    }
  };

  // ── 初始化加载（家庭 → 宝宝 → 今日记录） ─────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        try {
          await authApi.checkToken();
        } catch {
          useAppStore.getState().logout();
          navigate("/login", { replace: true });
          return;
        }

        // 1. 确保 family 已初始化
        let family = currentFamily;
        if (!family) {
          const families = await familyApi.getMine();
          if (families.length === 0) {
            // 检查是否存在待处理的邀请
            try {
              const invites = await familyApi.getPendingInvites();
              if (invites.length > 0) {
                setPendingInvites(invites);
                setInviteModalOpen(true);
                setLoading(false);
                return;
              }
            } catch {
              // 静默失败
            }
            setNeedsOnboarding(true);
            setNeedsOnboardingReason('no_family');
            setLoading(false);
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
            setNeedsOnboarding(true);
            setNeedsOnboardingReason('no_baby');
            setLoading(false);
            return;
          }
        }

        // 3. 并发加载：今日记录 + 昨日记录 + 进行中睡眠 + 检查邀请 + 加载所有宝宝
        await Promise.all([
          loadTodayRecords(family.id),
          loadYesterdayRecords(family.id),
          recordsApi.sleep
            .getOngoing(family.id, baby.id)
            .then((rec) => setOngoingSleep(rec))
            .catch(() => {
              /* 查询失败不影响主流程 */
            }),
          checkPendingInvites(),
          babyApi.getMine()
            .then((babies) => setAllBabies(babies))
            .catch(() => {
              /* 查询失败不影响主流程 */
            }),
        ]);
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

  // ── 已登录但无家庭/宝宝 → 引导建档 ────────────────────────────────────────
  if (needsOnboarding) {
    return (
      <div className="min-h-full bg-bg">
        <div className="px-5 pt-12 pb-4">
          <div className="text-[22px] font-extrabold text-[#4A3035] tracking-tight">
            敏宝日记
          </div>
        </div>
        <div className="px-4">
          <div
            className="rounded-2xl p-6 text-center"
            style={{ background: '#FFFBFC', border: '1px solid #F5F0F2' }}
          >
            <p className="text-[17px] font-bold text-[#4A3035] mb-2">
              {needsOnboardingReason === 'no_baby' ? '请创建宝宝档案' : '欢迎加入敏宝日记'}
            </p>
            <p className="text-[13px] text-[#9A8090] mb-4">
              {needsOnboardingReason === 'no_baby'
                ? '你已加入家庭，创建宝宝档案后即可开始记录'
                : '创建宝宝档案，开始记录宝宝的成长点滴'}
            </p>
            <button
              type="button"
              onClick={() => navigate('/onboarding', { state: { mode: needsOnboardingReason === 'no_baby' ? 'invited' : undefined } })}
              className="w-full py-3.5 rounded-2xl text-[15px] font-semibold border-none cursor-pointer transition-all active:scale-[0.98]"
              style={{ background: '#F87098', color: '#fff' }}
            >
              创建宝宝档案
            </button>
          </div>
        </div>
        <InviteModal
          invites={pendingInvites}
          open={inviteModalOpen}
          showToast={showToast}
          onAccept={handleInviteAccept}
          onDecline={handleInviteDecline}
        />
        {ToastNode}
      </div>
    );
  }

  // ── 计算今日统计（4格数据） ────────────────────────────────────────────────
  const feedingRecs = todayRecords.filter((r) => r.type === "feeding");
  const sleepRecs = todayRecords.filter((r) => r.type === "sleep");
  const diaperRecs = todayRecords.filter((r) => r.type === "diaper");
  const symptomRecs = todayRecords.filter((r) => r.type === "symptom");

  // 今日总奶量：从 detail.feed_type / detail.formula_ml 读取结构化字段
  const totalMl = feedingRecs.reduce((acc, r) => {
    const d = (r.detail ?? {}) as Record<string, unknown>;
    if (d.feed_type === "formula" && d.formula_ml)
      return acc + Number(d.formula_ml);
    return acc;
  }, 0);

  // 今日总睡眠：从 detail.duration_min 读取（已结束的睡眠才有值；ongoing 无时长不计入）
  const totalSleepMin = sleepRecs.reduce((acc, r) => {
    const d = (r.detail ?? {}) as Record<string, unknown>;
    if (d.duration_min != null && d.duration_min !== "") {
      const n = Number(d.duration_min);
      if (!Number.isNaN(n)) return acc + n;
    }
    return acc;
  }, 0);
  /** 不足 1 小时用「分」；满 1 小时若有零头分钟则显示如 1h56m，避免只显示整小时丢掉余数 */
  const sleepStat: BabyStat = (() => {
    if (totalSleepMin <= 0) return { val: "—", unit: "", label: "今日睡眠" };
    if (totalSleepMin < 60)
      return { val: `${totalSleepMin}`, unit: "分", label: "今日睡眠" };
    const h = Math.floor(totalSleepMin / 60);
    const m = totalSleepMin % 60;
    if (m === 0) return { val: `${h}`, unit: "h", label: "今日睡眠" };
    return { val: `${h}h${m}`, unit: "m", label: "今日睡眠" };
  })();

  const babyStats: BabyStat[] = [
    feedingRecs.length > 0
      ? {
          val: totalMl > 0 ? totalMl : feedingRecs.length,
          unit: totalMl > 0 ? "ml" : "次",
          label: "今日奶量",
        }
      : { val: "—", unit: "", label: "今日奶量" },
    sleepStat,
    diaperRecs.length > 0
      ? { val: diaperRecs.length, unit: "次", label: "换尿布" }
      : { val: "—", unit: "", label: "换尿布" },
    symptomRecs.length > 0
      ? { val: symptomRecs.length, unit: "项", label: "表现" }
      : { val: "—", unit: "", label: "表现" },
  ];

  // ── 时间线操作处理 ────────────────────────────────────────────────────────

  const handleRecordClick = (record: RecordItem) => {
    setSelectedRecord(record);
    setActionOpen(true);
  };

  const handleEdit = (record: ActionRecord) => {
    const t = record.type;
    if (!t) {
      showToast("暂不支持编辑该类型记录");
      return;
    }
    const route = RECORD_ROUTES[t];
    if (!route) {
      showToast("暂不支持编辑该类型记录");
      return;
    }
    // 跳转表单页，带上 record 数据（表单页通过 location.state.record 读取）
    navigate(route, { state: { record: { id: record.id, type: t } } });
  };

  const handleDelete = async (record: ActionRecord) => {
    if (!currentFamily) return;
    const t = record.type;
    if (!t) {
      showToast("暂不支持删除该类型记录");
      return;
    }
    const type = t as DeletableType;
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

  // ── 计算最近一次喂奶时间（formula / breast / complementary 均算）────────────
  const lastFeedingTime = (() => {
    const recs = todayRecords.filter((r) => r.type === "feeding");
    if (recs.length === 0) return null;
    return [...recs].sort(
      (a, b) => dayjs(b.time).diff(dayjs(a.time)),
    )[0].time;
  })();

  // ── 组合横幅（睡眠 + 喂奶，有就显示，无则不显示） ─────────────────────────
  const hasBanners = !!(ongoingSleep || lastFeedingTime);
  const bannersNode = hasBanners ? (
    <div style={{ paddingBottom: 28 }}>
      {ongoingSleep && currentFamily && (
        <SleepBanner
          familyId={currentFamily.id}
          ongoingRecord={ongoingSleep}
          onEnded={() => {
            setOngoingSleep(null);
            if (currentFamily) loadTodayRecords(currentFamily.id);
          }}
        />
      )}
      {lastFeedingTime && (
        <FeedingBanner lastFeedingTime={lastFeedingTime} />
      )}
    </div>
  ) : undefined;

  return (
    <div className="min-h-full bg-bg">
      {/* ── 英雄区（渐变背景 + 宝宝卡片 + 状态横幅） ── */}
      <HeroSection
        currentBaby={currentBaby}
        stats={babyStats}
        banners={bannersNode}
      />

      {/* ── 内容区（白色背景，含快捷宫格和时间线） ── */}
      <div className="px-4 space-y-4 pt-3 pb-28">
        <QuickActions
          onMoreClick={() => setFabOpen(true)}
          fabCount={filteredFabCount}
        />
        <DailyComparison
          todayRecords={todayRecords}
          yesterdayRecords={yesterdayRecords}
        />
        <TodayTimeline
          records={todayRecords}
          onRecordClick={handleRecordClick}
        />
      </div>

      {/* ── FAB 底部弹层（动态过滤，排除快捷区已有功能） ── */}
      <FabSheet open={fabOpen} onClose={() => setFabOpen(false)} groups={filteredFabGroups.length > 0 ? filteredFabGroups : FAB_GROUPS} />

      {/* ── 时间线记录操作弹层 ── */}
      <RecordActionSheet
        open={actionOpen}
        record={selectedRecord}
        onClose={() => setActionOpen(false)}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {/* ── 邀请弹层 ── */}
      <InviteModal
        invites={pendingInvites}
        open={inviteModalOpen}
        showToast={showToast}
        onAccept={handleInviteAccept}
        onDecline={handleInviteDecline}
      />

      {/* ── Toast 轻提示 ── */}
      {ToastNode}
    </div>
  );
}
