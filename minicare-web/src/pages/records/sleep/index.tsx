/**
 * 睡眠记录表单页（入口）
 *
 * UI 对齐 ui-draft/form-sleep.html
 *
 * 子组件：
 *  - TimerMode      计时模式（圆形计时 + 开始/结束按钮）
 *  - ManualMode     补录模式（入睡/醒来时间 + 睡眠时段）
 *  - QualitySection 睡眠质量（两模式均显示）
 *
 * ═══════════ 计时模式流程 ═══════════
 *  1. 页面加载时先查询 getOngoing，若有则恢复计时（断线重连）
 *  2. 点「开始计时」→ 立即调用 startSleep API → 记录 ongoingId
 *  3. 点「结束睡眠」→ 立即调用 endSleep API（携带质量/备注）→ 结束后跳回
 *  4. 计时模式不显示「保存记录」按钮；结束后自动保存
 *
 * ═══════════ 补录/编辑模式流程 ═══════════
 *  手动填写时间范围 → 点「保存记录」→ 调用 startSleep + endSleep
 *  编辑模式直接 PATCH 更新
 */
import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAppStore } from "@/lib/store";
import { recordsApi } from "@/api";
import type { SleepRecord, SleepQuality, SleepPeriod } from "@/api/types";

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
  timeToISO,
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

/** 计算两个 HH:mm 字符串之间的分钟差（跨午夜兼容） */
function calcDurationMin(startTime: string, endTime: string): number {
  const s = new Date(`2000-01-01T${startTime}:00`).getTime();
  let e = new Date(`2000-01-01T${endTime}:00`).getTime();
  if (e < s) e += 24 * 3600 * 1000;
  return Math.round((e - s) / 60000);
}

/**
 * 将一对 HH:mm 时间字符串（startTime / endTime）转为正确的 ISO 字符串对。
 *
 * 处理跨午夜情况：若 endTime < startTime，则 endDate = startDate + 1 天。
 *
 * 例：startDate="2026-04-02", startTime="22:34", endTime="07:48"
 *   → startISO = "2026-04-02T22:34:00"
 *   → endISO   = "2026-04-03T07:48:00"  ← 自动加了一天
 */
function timePairToISO(
  startDateStr: string,
  startTime: string,
  endTime: string,
): { startISO: string; endISO: string } {
  const startISO = `${startDateStr}T${startTime}:00`;

  const sMs = new Date(`2000-01-01T${startTime}:00`).getTime();
  const eMs = new Date(`2000-01-01T${endTime}:00`).getTime();

  if (eMs >= sMs) {
    // 同一天（或恰好相等）
    return { startISO, endISO: `${startDateStr}T${endTime}:00` };
  }

  // 跨午夜：end 日期 = start 日期 + 1
  const startDate = new Date(`${startDateStr}T00:00:00`);
  startDate.setDate(startDate.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  const endDateStr = `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}`;
  return { startISO, endISO: `${endDateStr}T${endTime}:00` };
}

export default function SleepFormPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentFamily, currentBaby } = useAppStore();
  const { toast, showToast } = useToastMsg();

  // 编辑模式：从路由 state 中读取原始记录
  const editRecord = location.state?.record as SleepRecord | undefined;
  const isEditMode = Boolean(editRecord);

  // ── 模式切换 ────────────────────────────────────────────────────
  // 编辑模式下直接进入补录模式（已有完整时间数据）
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
      // 恢复计时状态
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
        sleep_period: sleepPeriod as SleepPeriod,
      });
      setOngoingId(id);
      setTimerStartTime(startDate);
      setTimerSeconds(0);
      setTimerRunning(true);
      setTimerStopped(false);
    } catch (err: any) {
      // 409：该宝宝已有进行中的记录，重新查询后恢复
      if (err?.statusCode === 409 || err?.message?.includes("已有进行中")) {
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
   * 点「结束睡眠」→ 立即调用 endSleep API（携带质量/备注）→ 成功后跳回
   */
  const handleTimerStop = async () => {
    if (!currentFamily || !ongoingId) {
      showToast("未找到进行中的睡眠记录");
      return;
    }
    if (timerApiLoading) return;
    setTimerApiLoading(true);
    // 先停止本地计时器
    setTimerRunning(false);
    try {
      await recordsApi.sleep.endSleep(currentFamily.id, ongoingId, {
        end_time: dateToLocalISO(new Date()),
        quality: sleepQuality,
        sleep_period: sleepPeriod as SleepPeriod,
        note: note || undefined,
      });
      setTimerStopped(true);
      showToast("✓ 睡眠记录已保存");
      setTimeout(() => navigate(-1), 1400);
    } catch (err) {
      // 恢复计时（结束失败）
      setTimerRunning(true);
      showToast(err instanceof Error ? err.message : "结束计时失败，请重试");
    } finally {
      setTimerApiLoading(false);
    }
  };

  // ── 补录模式状态 ────────────────────────────────────────────────
  // 编辑模式：recordDate 取原始 start_time 的日期（可随 getOne 刷新后更新）
  const [recordDate, setRecordDate] = useState(() => {
    if (editRecord?.start_time) {
      const d = new Date(editRecord.start_time);
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
  const [sleepPeriod, setSleepPeriod] = useState<string>(
    editRecord?.sleep_period ?? "night"
  );

  // ── 公共状态 ───────────────────────────────────────────────────
  const [sleepQuality, setSleepQuality] = useState<SleepQuality>(
    editRecord?.quality ?? "normal"
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
          // 同步更新 recordDate 为实际 start_time 所在日期
          const d = new Date(fresh.start_time);
          setRecordDate(
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
          );
        }
        if (fresh.end_time) setEndTime(isoToLocalTime(fresh.end_time));
        if (fresh.sleep_period) setSleepPeriod(fresh.sleep_period);
        if (fresh.quality) setSleepQuality(fresh.quality as SleepQuality);
        setNote(fresh.note ?? "");
      })
      .catch(() => { /* 查询失败保留快照数据 */ })
      .finally(() => setLoadingRecord(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const durationMin = calcDurationMin(startTime, endTime);

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
        // 使用跨午夜感知的 timePairToISO，夜间睡眠 end < start 时自动推到次日
        const { startISO, endISO } = timePairToISO(recordDate, startTime, endTime);

        await recordsApi.sleep.update(currentFamily.id, editRecord.id, {
          start_time: startISO,
          end_time: endISO,
          quality: sleepQuality,
          sleep_period: sleepPeriod as SleepPeriod,
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
      // 使用跨午夜感知的 timePairToISO
      const { startISO, endISO } = timePairToISO(recordDate, startTime, endTime);

      const { id: sleepId } = await recordsApi.sleep.startSleep(currentFamily.id, {
        baby_id: currentBaby.id,
        start_time: startISO,
        sleep_period: sleepPeriod as SleepPeriod,
      });
      await recordsApi.sleep.endSleep(currentFamily.id, sleepId, {
        end_time: endISO,
        quality: sleepQuality,
        sleep_period: sleepPeriod as SleepPeriod,
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

  // 计时模式下是否处于「进行中」或「已结束」状态
  const timerActive = timerRunning || timerStopped;

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

      {/* 模式切换（编辑模式或计时进行中时隐藏） */}
      {!isEditMode && !timerActive && (
        <div
          className="mx-4 mt-3 flex gap-0 rounded-xl overflow-hidden p-[3px]"
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
              className="flex-1 py-[9px] text-[14px] font-semibold rounded-[10px] transition-all"
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
            onStop={handleTimerStop}
          />
        )}

        {/* 补录模式 */}
        {mode === "manual" && (
          <ManualMode
            startTime={startTime}
            endTime={endTime}
            onStartChange={setStartTime}
            onEndChange={setEndTime}
            sleepPeriod={sleepPeriod}
            onPeriodChange={setSleepPeriod}
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

      <ToastMessage toast={toast} />
    </div>
  );
}
