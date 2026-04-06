/**
 * 睡眠记录表单页（入口）
 *
 * UI 对齐 ui-draft/form-sleep.html
 *
 * 子组件：
 *  - TimerMode      计时模式（圆形计时 + 开始/结束按钮）
 *  - ManualMode     补录模式（日期 + 入睡/醒来时间）
 *  - QualitySection 睡眠质量（两模式均显示）
 *
 * ═══════════ 计时模式流程 ═══════════
 *  1. 页面加载时先查询 getOngoing，若有则恢复计时（断线重连）
 *  2. 点「开始计时」→ 立即调用 startSleep API → 记录 ongoingId
 *  3. 点「结束睡眠」→
 *     - 若计时 < 3 分钟：弹二次确认弹窗
 *       - 「仍然保存」→ 调用 endSleep 正常保存
 *       - 「继续计时」→ 恢复计时，同时删除服务端 ongoing 记录（避免孤立）
 *     - 若计时 ≥ 3 分钟：直接调用 endSleep API → 结束后跳回
 *  4. 计时模式不显示「保存记录」按钮；结束后自动保存
 *
 * ═══════════ 补录/编辑模式流程 ═══════════
 *  手动填写日期 + 时间范围 → 点「保存记录」→ 调用 startSleep + endSleep
 *  编辑模式直接 PATCH 更新
 */
import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAppStore } from "@/lib/store";
import { recordsApi } from "@/api";
import type { SleepRecord, SleepQuality } from "@/api/types";

import { IconMoon, IconTrash } from "@/components/ui/icons";
import TimerMode from "./TimerMode";
import ManualMode from "./ManualMode";
import QualitySection from "./QualitySection";
import {
  NavBar,
  NoteCard,
  SubmitBar,
  ToastMessage,
  nowTime,
  nowDate,
  useToastMsg,
} from "../shared";

type SleepMode = "timer" | "manual";

/** 从 ISO 时间提取本地 HH:mm */
function isoToLocalTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

/** Date 对象 → 本地时间字符串（不带 Z，如 '2026-04-01T07:18:00'），全链路 CST */
function dateToLocalISO(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 入睡/醒来分属两日时的本地时间串 → 后端 ISO 字段 */
function buildLocalISOPair(
  startDateStr: string,
  startTime: string,
  endDateStr: string,
  endTime: string,
): { startISO: string; endISO: string } {
  return {
    startISO: `${startDateStr}T${startTime}:00`,
    endISO: `${endDateStr}T${endTime}:00`,
  };
}

function calcDurationMinFromRange(
  startDateStr: string,
  startTime: string,
  endDateStr: string,
  endTime: string,
): number {
  const startMs = new Date(`${startDateStr}T${startTime}:00`).getTime();
  const endMs = new Date(`${endDateStr}T${endTime}:00`).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return 0;
  return Math.round((endMs - startMs) / 60000);
}

/** 将秒数格式化为「X 分 Y 秒」或「X 秒」的可读文案 */
function formatShortDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return `${m} 分 ${s} 秒`;
  return `${s} 秒`;
}

// ── 二次确认弹窗（时间太短） ────────────────────────────────────────
interface ShortSleepDialogProps {
  seconds: number;
  onKeepTiming: () => void;
  onSaveAnyway: () => void;
  loading: boolean;
}

function ShortSleepDialog({ seconds, onKeepTiming, onSaveAnyway, loading }: ShortSleepDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.4)" }}
      onClick={onKeepTiming}>
      <div
        className="w-full max-w-sm mb-6 mx-4 bg-white rounded-2xl overflow-hidden"
        style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}
        onClick={(e) => e.stopPropagation()}>
        {/* 标题区 */}
        <div className="px-5 pt-5 pb-3 text-center">
          <div className="flex justify-center mb-2">
            <IconMoon size={36} color="#9A8090" />
          </div>
          <h3 className="text-[16px] font-bold text-[#4A3035]">睡眠时间太短</h3>
          <p className="mt-1.5 text-[13px] text-[#7A5A60] leading-relaxed">
            本次睡眠仅 <span className="font-semibold text-[#F87098]">{formatShortDuration(seconds)}</span>，
            可能是误触了结束按钮。
          </p>
        </div>

        {/* 分割线 */}
        <div style={{ height: "0.5px", background: "#F5EEF0" }} />

        {/* 操作按钮 */}
        <div className="flex">
          <button
            type="button"
            onClick={onKeepTiming}
            disabled={loading}
            className="flex-1 py-4 text-[15px] font-semibold"
            style={{
              color: "#9A8090",
              borderRight: "0.5px solid #F5EEF0",
            }}>
            继续计时
          </button>
          <button
            type="button"
            onClick={onSaveAnyway}
            disabled={loading}
            className="flex-1 py-4 text-[15px] font-semibold flex items-center justify-center gap-1.5"
            style={{ color: "#F87098" }}>
            {loading && (
              <svg className="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 14, height: 14 }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            )}
            仍然保存
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 取消计时确认弹窗 ────────────────────────────────────────────────
interface CancelTimerDialogProps {
  onKeep: () => void;
  onConfirm: () => void;
  loading: boolean;
}

function CancelTimerDialog({ onKeep, onConfirm, loading }: CancelTimerDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.4)" }}
      onClick={onKeep}>
      <div
        className="w-full max-w-sm mb-6 mx-4 bg-white rounded-2xl overflow-hidden"
        style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}
        onClick={(e) => e.stopPropagation()}>
        {/* 标题区 */}
        <div className="px-5 pt-5 pb-3 text-center">
          <div className="flex justify-center mb-2">
            <IconTrash size={32} color="#9A8090" />
          </div>
          <h3 className="text-[16px] font-bold text-[#4A3035]">取消本次计时？</h3>
          <p className="mt-1.5 text-[13px] text-[#7A5A60] leading-relaxed">
            已记录的时间将不会保存，此操作不可撤销。
          </p>
        </div>

        {/* 分割线 */}
        <div style={{ height: "0.5px", background: "#F5EEF0" }} />

        {/* 操作按钮 */}
        <div className="flex">
          <button
            type="button"
            onClick={onKeep}
            disabled={loading}
            className="flex-1 py-4 text-[15px] font-semibold"
            style={{
              color: "#9A8090",
              borderRight: "0.5px solid #F5EEF0",
            }}>
            继续计时
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-4 text-[15px] font-semibold flex items-center justify-center gap-1.5"
            style={{ color: "#F87098" }}>
            {loading && (
              <svg className="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 14, height: 14 }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            )}
            确认取消
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 短时睡眠阈值（秒） ───────────────────────────────────────────────
const SHORT_SLEEP_THRESHOLD_SECONDS = 3 * 60; // 3 分钟

export default function SleepFormPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentFamily, currentBaby } = useAppStore();
  const { toast, showToast } = useToastMsg();

  // 编辑模式：从路由 state 中读取原始记录
  const editRecord = location.state?.record as SleepRecord | undefined;
  const isEditMode = Boolean(editRecord);

  // ── 模式切换 ────────────────────────────────────────────────────
  const [mode, setMode] = useState<SleepMode>(isEditMode ? "manual" : "timer");

  // ── 计时模式状态 ────────────────────────────────────────────────
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerStartTime, setTimerStartTime] = useState<Date | null>(null);
  /** 计时模式下服务端返回的进行中记录 ID（用于 endSleep） */
  const [ongoingId, setOngoingId] = useState<string | null>(null);
  /** 计时已结束（endSleep 已成功调用） */
  const [timerStopped, setTimerStopped] = useState(false);
  /** 正在调用 startSleep / endSleep API */
  const [timerApiLoading, setTimerApiLoading] = useState(false);
  /** 页面首次加载时查询 ongoing，防止重复渲染时多次查询 */
  const ongoingCheckedRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── 二次确认弹窗状态（时间太短） ──────────────────────────────────
  const [shortSleepDialogOpen, setShortSleepDialogOpen] = useState(false);
  const [shortSleepDialogLoading, setShortSleepDialogLoading] = useState(false);
  /** 弹窗打开时快照的计时秒数（供弹窗文案显示） */
  const [shortSleepSeconds, setShortSleepSeconds] = useState(0);

  // ── 取消计时弹窗状态 ─────────────────────────────────────────────
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelDialogLoading, setCancelDialogLoading] = useState(false);

  // 计时器 tick：每秒 +1
  useEffect(() => {
    if (timerRunning) {
      intervalRef.current = setInterval(() => {
        setTimerSeconds((s) => s + 1);
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [timerRunning]);

  /**
   * 页面挂载时：查询是否有进行中的睡眠记录
   * 若有则恢复计时（刷新页面也能继续）
   */
  useEffect(() => {
    if (isEditMode || ongoingCheckedRef.current) return;
    if (!currentFamily || !currentBaby) return;
    ongoingCheckedRef.current = true;

    recordsApi.sleep.getOngoing(currentFamily.id, currentBaby.id).then((ongoing) => {
      if (!ongoing) return;
      const start = new Date(ongoing.start_time);
      const elapsedSeconds = Math.floor((Date.now() - start.getTime()) / 1000);
      setTimerStartTime(start);
      setTimerSeconds(Math.max(0, elapsedSeconds));
      setOngoingId(ongoing.id);
      setTimerRunning(true);
    }).catch(() => {
      // 查询失败静默处理，不影响正常使用
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFamily, currentBaby]);

  /**
   * 点「开始计时」→ 立即调用 startSleep API
   */
  const handleTimerStart = async () => {
    if (!currentFamily || !currentBaby) {
      showToast("请先完成宝宝建档");
      return;
    }
    if (timerApiLoading) return;
    setTimerApiLoading(true);
    try {
      const startDate = new Date();
      const { id } = await recordsApi.sleep.startSleep(currentFamily.id, {
        baby_id: currentBaby.id,
        start_time: dateToLocalISO(startDate),
      });
      setOngoingId(id);
      setTimerStartTime(startDate);
      setTimerSeconds(0);
      setTimerRunning(true);
      setTimerStopped(false);
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string };
      // 409：该宝宝已有进行中的记录，重新查询后恢复
      if (e?.statusCode === 409 || e?.message?.includes("已有进行中")) {
        try {
          const ongoing = await recordsApi.sleep.getOngoing(currentFamily.id, currentBaby.id);
          if (ongoing) {
            const start = new Date(ongoing.start_time);
            setTimerStartTime(start);
            setTimerSeconds(Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000)));
            setOngoingId(ongoing.id);
            setTimerRunning(true);
            setTimerStopped(false);
            showToast("已恢复进行中的睡眠计时");
            return;
          }
        } catch { /* ignore */ }
      }
      showToast(err instanceof Error ? err.message : "开始计时失败，请重试");
    } finally {
      setTimerApiLoading(false);
    }
  };

  /**
   * 实际执行 endSleep API 调用（供"结束睡眠"和"弹窗-仍然保存"共用）
   */
  const doEndSleep = async () => {
    if (!currentFamily || !ongoingId) return;
    setTimerApiLoading(true);
    try {
      await recordsApi.sleep.endSleep(currentFamily.id, ongoingId, {
        end_time: dateToLocalISO(new Date()),
        quality: sleepQuality,
        note: note || undefined,
      });
      setTimerStopped(true);
      setShortSleepDialogOpen(false);
      showToast("✓ 睡眠记录已保存");
      setTimeout(() => navigate(-1), 1400);
    } catch (err) {
      // 结束失败：恢复计时
      setTimerRunning(true);
      showToast(err instanceof Error ? err.message : "结束计时失败，请重试");
    } finally {
      setTimerApiLoading(false);
      setShortSleepDialogLoading(false);
    }
  };

  /**
   * 点「结束睡眠」：
   *   < 3 分钟 → 暂停本地计时 + 弹二次确认（秒数保留，方便「继续计时」接续）
   *   ≥ 3 分钟 → 直接结束
   */
  const handleTimerStop = () => {
    if (!currentFamily || !ongoingId) {
      showToast("未找到进行中的睡眠记录");
      return;
    }
    if (timerApiLoading) return;

    // 暂停本地计时器（秒数不重置，「继续计时」时从此处接续）
    setTimerRunning(false);

    if (timerSeconds < SHORT_SLEEP_THRESHOLD_SECONDS) {
      // 时间太短：快照当前秒数 → 弹确认
      setShortSleepSeconds(timerSeconds);
      setShortSleepDialogOpen(true);
    } else {
      // 正常结束
      doEndSleep();
    }
  };

  /**
   * 弹窗「继续计时」：关闭弹窗，恢复本地计时器，服务端 ongoing 记录保留不动。
   * 此操作等同于「误触了结束按钮，什么都没发生」。
   */
  const handleKeepTiming = () => {
    setShortSleepDialogOpen(false);
    // 恢复本地计时，秒数从弹窗前暂停的位置继续（timerSeconds 未被重置）
    setTimerRunning(true);
  };

  /**
   * TimerMode 按钮「继续计时」：直接恢复本地计时，不调用任何 API。
   * 与 handleKeepTiming 动作相同，但是不需要关闭弹窗（弹窗已经关闭）。
   */
  const handleTimerResume = () => {
    setTimerRunning(true);
  };

  /**
   * 点「取消本次计时」→ 暂停计时器，弹取消确认弹窗
   */
  const handleCancelRequest = () => {
    if (timerApiLoading) return;
    setTimerRunning(false);
    setCancelDialogOpen(true);
  };

  /**
   * 取消弹窗「继续计时」：关闭弹窗，恢复计时
   */
  const handleCancelDialogKeep = () => {
    setCancelDialogOpen(false);
    setTimerRunning(true);
  };

  /**
   * 取消弹窗「确认取消」：
   *   1. 调用 remove API 删除服务端 ongoing 记录（防孤立数据）
   *   2. 成功 → 重置所有计时状态回 idle
   *   3. 失败 → Toast 提示，恢复计时（数据不丢失）
   */
  const handleCancelConfirm = async () => {
    if (!currentFamily || !ongoingId) {
      // 没有服务端记录（理论上不会走到这里），直接重置
      setCancelDialogOpen(false);
      setTimerRunning(false);
      setTimerSeconds(0);
      setTimerStartTime(null);
      setOngoingId(null);
      setTimerStopped(false);
      return;
    }
    setCancelDialogLoading(true);
    try {
      await recordsApi.sleep.remove(currentFamily.id, ongoingId);
      // 删除成功：重置所有计时状态 → idle
      setCancelDialogOpen(false);
      setTimerRunning(false);
      setTimerSeconds(0);
      setTimerStartTime(null);
      setOngoingId(null);
      setTimerStopped(false);
      showToast("计时已取消");
    } catch {
      // 删除失败：恢复计时，数据不丢失
      setCancelDialogOpen(false);
      setTimerRunning(true);
      showToast("取消失败，请重试");
    } finally {
      setCancelDialogLoading(false);
    }
  };

  /**
   * 弹窗「仍然保存」：正常调用 endSleep
   */
  const handleSaveAnyway = () => {
    setShortSleepDialogLoading(true);
    doEndSleep();
  };

  // ── 补录模式状态 ────────────────────────────────────────────────
  const [startDate, setStartDate] = useState(() => {
    if (editRecord?.start_time) {
      const d = new Date(editRecord.start_time);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    return nowDate();
  });
  const [endDate, setEndDate] = useState(() => {
    if (editRecord?.end_time) {
      const d = new Date(editRecord.end_time);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    return nowDate();
  });
  const [startTime, setStartTime] = useState(() => {
    if (editRecord?.start_time) return isoToLocalTime(editRecord.start_time);
    const d = new Date();
    d.setHours(d.getHours() - 1);
    return `${d.getHours().toString().padStart(2, "0")}:${d
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
  });
  const [endTime, setEndTime] = useState(() => {
    if (editRecord?.end_time) return isoToLocalTime(editRecord.end_time);
    return nowTime();
  });

  // ── 公共状态 ───────────────────────────────────────────────────
  const [sleepQuality, setSleepQuality] = useState<SleepQuality>(
    editRecord?.quality ?? "good"
  );
  const [note, setNote] = useState(editRecord?.note ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [loadingRecord, setLoadingRecord] = useState(isEditMode);

  /** 编辑模式下：进入页面时重新查询后端获取最新数据并回填 */
  useEffect(() => {
    if (!isEditMode || !editRecord || !currentFamily) return;
    recordsApi.sleep.getOne(currentFamily.id, editRecord.id)
      .then((fresh) => {
        if (!fresh) return;
        if (fresh.start_time) {
          setStartTime(isoToLocalTime(fresh.start_time));
          const d = new Date(fresh.start_time);
          setStartDate(
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
          );
        }
        if (fresh.end_time) {
          setEndTime(isoToLocalTime(fresh.end_time));
          const d = new Date(fresh.end_time);
          setEndDate(
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
          );
        }
        if (fresh.quality) setSleepQuality(fresh.quality as SleepQuality);
        setNote(fresh.note ?? "");
      })
      .catch(() => { /* 查询失败保留快照数据 */ })
      .finally(() => setLoadingRecord(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const durationMin = calcDurationMinFromRange(startDate, startTime, endDate, endTime);

  // ── 补录/编辑模式提交 ──────────────────────────────────────────
  const handleSubmit = async () => {
    if (!currentFamily || !currentBaby) {
      showToast("请先完成宝宝建档");
      return;
    }
    setSubmitting(true);
    try {
      // 编辑模式：直接 PATCH 更新
      if (isEditMode && editRecord) {
        if (durationMin <= 0) {
          showToast("结束时间应晚于开始时间");
          setSubmitting(false);
          return;
        }
        const { startISO, endISO } = buildLocalISOPair(startDate, startTime, endDate, endTime);

        await recordsApi.sleep.update(currentFamily.id, editRecord.id, {
          start_time: startISO,
          end_time: endISO,
          quality: sleepQuality,
          note: note || undefined,
        });

        showToast("✓ 睡眠记录已更新");
        setTimeout(() => navigate(-1), 1400);
        return;
      }

      // 补录模式（mode === "manual"）：两步流程
      if (durationMin <= 0) {
        showToast("结束时间应晚于开始时间");
        setSubmitting(false);
        return;
      }
      const { startISO, endISO } = buildLocalISOPair(startDate, startTime, endDate, endTime);

      await recordsApi.sleep.createComplete(currentFamily.id, {
        baby_id: currentBaby.id,
        start_time: startISO,
        end_time: endISO,
        quality: sleepQuality,
        note: note || undefined,
      });

      showToast("✓ 睡眠记录已保存");
      setTimeout(() => navigate(-1), 1400);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!currentFamily || !editRecord) return;
    try {
      await recordsApi.sleep.remove(currentFamily.id, editRecord.id);
      showToast("✓ 记录已删除");
      setTimeout(() => navigate(-1), 1200);
    } catch {
      showToast("删除失败，请重试");
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "#FAF5F6" }}>
      {/* 导航栏 */}
      <NavBar
        title={isEditMode ? "编辑睡眠记录" : "睡眠记录"}
        onBack={() => navigate(-1)}
      />

      {/* 编辑模式加载数据提示 */}
      {loadingRecord && (
        <div className="flex items-center justify-center gap-2 py-2 text-[12px] text-[#9A8090]">
          <svg className="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          正在加载最新数据…
        </div>
      )}

      {/* 模式切换（编辑模式隐藏；进行中时仍可切到补录） */}
      {!isEditMode && (
        <div
          className="mx-4 mt-3 flex gap-0 rounded-2xl overflow-hidden p-[3px]"
          style={{ background: "#F0E8EA" }}>
          {(
            [
              { key: "timer" as const, label: "计时模式" },
              { key: "manual" as const, label: "补录模式" },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className="flex-1 py-[9px] text-[14px] font-semibold rounded-[13px] transition-all"
              style={{
                background: mode === key ? "#fff" : "transparent",
                color: mode === key ? "#4A3035" : "#9A8090",
                boxShadow:
                  mode === key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              }}>
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="pb-32">
        {/* 计时模式 */}
        {mode === "timer" && !isEditMode && (
          <TimerMode
            running={timerRunning}
            stopped={timerStopped}
            seconds={timerSeconds}
            startTime={timerStartTime}
            apiLoading={timerApiLoading}
            onStart={handleTimerStart}
            onResume={handleTimerResume}
            onStop={handleTimerStop}
            onCancel={handleCancelRequest}
          />
        )}

        {/* 补录模式 */}
        {mode === "manual" && (
          <ManualMode
            startDate={startDate}
            endDate={endDate}
            startTime={startTime}
            endTime={endTime}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            onStartChange={setStartTime}
            onEndChange={setEndTime}
          />
        )}

        {/* 睡眠质量（两种模式均显示） */}
        <QualitySection value={sleepQuality} onChange={setSleepQuality} />

        {/* 备注 */}
        <NoteCard
          value={note}
          onChange={setNote}
          placeholder="如：夜哭了2次"
          rows={1}
        />
      </div>

      {/* 底部按钮：计时模式下隐藏（开始/结束由计时器按钮控制） */}
      {mode !== "timer" && (
        <SubmitBar
          onClick={handleSubmit}
          submitting={submitting}
          label={isEditMode ? "更新记录" : "保存记录"}
          color="#4CAF82"
          disabledColor="#A8D8B0"
          onDelete={isEditMode ? handleDelete : undefined}
        />
      )}

      {/* 二次确认弹窗：睡眠时间过短 */}
      {shortSleepDialogOpen && (
        <ShortSleepDialog
          seconds={shortSleepSeconds}
          onKeepTiming={handleKeepTiming}
          onSaveAnyway={handleSaveAnyway}
          loading={shortSleepDialogLoading}
        />
      )}

      {/* 取消计时确认弹窗 */}
      {cancelDialogOpen && (
        <CancelTimerDialog
          onKeep={handleCancelDialogKeep}
          onConfirm={handleCancelConfirm}
          loading={cancelDialogLoading}
        />
      )}

      <ToastMessage toast={toast} />
    </div>
  );
}