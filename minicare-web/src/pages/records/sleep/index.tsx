/**
 * 睡眠记录表单页（入口）
 *
 * UI 对齐 ui-draft/form-sleep.html
 * API: POST /api/family/:familyId/records/sleep
 *
 * 子组件：
 *  - TimerMode      计时模式（圆形计时 + 开始/结束按钮）
 *  - ManualMode     补录模式（入睡/醒来时间 + 睡眠时段）
 *  - QualitySection 睡眠质量（两模式均显示）
 *
 * 计时器逻辑（setInterval）统一由本页管理，不下放至子组件。
 *
 * 编辑模式：通过 location.state.record 携带原始记录数据，回填表单，保存时调用 update API
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
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 计算两个 HH:mm 字符串之间的分钟差（跨午夜兼容） */
function calcDurationMin(startTime: string, endTime: string): number {
  const s = new Date(`2000-01-01T${startTime}:00`).getTime();
  let e = new Date(`2000-01-01T${endTime}:00`).getTime();
  if (e < s) e += 24 * 3600 * 1000;
  return Math.round((e - s) / 60000);
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
  const [timerStopped, setTimerStopped] = useState(false);
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

  const startTimer = () => {
    setTimerStartTime(new Date());
    setTimerSeconds(0);
    setTimerRunning(true);
    setTimerStopped(false);
  };

  const stopTimer = () => {
    setTimerRunning(false);
    setTimerStopped(true);
  };

  // ── 补录模式状态 ────────────────────────────────────────────────
  const [recordDate] = useState(nowDate());
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
        if (fresh.start_time) setStartTime(isoToLocalTime(fresh.start_time));
        if (fresh.end_time) setEndTime(isoToLocalTime(fresh.end_time));
        if (fresh.sleep_period) setSleepPeriod(fresh.sleep_period);
        if (fresh.quality) setSleepQuality(fresh.quality as SleepQuality);
        setNote(fresh.note ?? '');
      })
      .catch(() => { /* 查询失败保留快照数据 */ })
      .finally(() => setLoadingRecord(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const durationMin = calcDurationMin(startTime, endTime);

  // ── 提交 ──────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!currentFamily || !currentBaby) {
      showToast("请先完成宝宝建档");
      return;
    }
    setSubmitting(true);
    try {
      // 编辑模式：直接 PATCH 更新
      if (isEditMode && editRecord) {
        let startISO: string;
        let endISO: string;

        if (mode === "manual") {
          if (durationMin <= 0) {
            showToast("结束时间应晚于开始时间");
            setSubmitting(false);
            return;
          }
          startISO = timeToISO(recordDate, startTime);
          endISO = timeToISO(recordDate, endTime);
        } else {
          // 计时模式下编辑，使用当前计时结果
          if (!timerStopped || !timerStartTime) {
            showToast("请先开始并结束计时");
            setSubmitting(false);
            return;
          }
          startISO = dateToLocalISO(timerStartTime);
          endISO = dateToLocalISO(new Date());
        }

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

      // 新建模式
      let startISO: string;
      let endISO: string;

      if (mode === "timer") {
        if (!timerStopped || !timerStartTime) {
          showToast("请先开始并结束计时");
          setSubmitting(false);
          return;
        }
        startISO = dateToLocalISO(timerStartTime);
        endISO = dateToLocalISO(new Date());
      } else {
        if (durationMin <= 0) {
          showToast("结束时间应晚于开始时间");
          setSubmitting(false);
          return;
        }
        startISO = timeToISO(recordDate, startTime);
        endISO = timeToISO(recordDate, endTime);
      }

      // 两步流程：先 startSleep 创建 ongoing 记录，再 endSleep 结束并计算时长
      // 睡眠质量和时段在 endSleep 时一并提交
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

      {/* 模式切换（编辑模式下固定为补录模式，无需切换） */}
      {!isEditMode && (
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
            onStart={startTimer}
            onStop={stopTimer}
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

      {/* 底部按钮 */}
      <SubmitBar
        onClick={handleSubmit}
        submitting={submitting}
        label={isEditMode ? "更新记录" : "保存记录"}
        color="#4CAF82"
        disabledColor="#A8D8B0"
        onDelete={isEditMode ? handleDelete : undefined}
      />

      <ToastMessage toast={toast} />
    </div>
  );
}