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
 */
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "@/lib/store";
import { recordsApi } from "@/api";

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

/** 计算两个 HH:mm 字符串之间的分钟差（跨午夜兼容） */
function calcDurationMin(startTime: string, endTime: string): number {
  const s = new Date(`2000-01-01T${startTime}:00`).getTime();
  let e = new Date(`2000-01-01T${endTime}:00`).getTime();
  if (e < s) e += 24 * 3600 * 1000;
  return Math.round((e - s) / 60000);
}

export default function SleepFormPage() {
  const navigate = useNavigate();
  const { currentFamily, currentBaby } = useAppStore();
  const { toast, showToast } = useToastMsg();

  // ── 模式切换 ────────────────────────────────────────────────────
  const [mode, setMode] = useState<SleepMode>("timer");

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
    const d = new Date();
    d.setHours(d.getHours() - 1);
    return `${d.getHours().toString().padStart(2, "0")}:${d
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
  });
  const [endTime, setEndTime] = useState(nowTime());
  const [sleepPeriod, setSleepPeriod] = useState("night");

  // ── 公共状态 ───────────────────────────────────────────────────
  const [sleepQuality, setSleepQuality] = useState<"good" | "normal" | "poor">(
    "normal"
  );
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const durationMin = calcDurationMin(startTime, endTime);

  // ── 提交 ──────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!currentFamily || !currentBaby) {
      showToast("请先完成宝宝建档");
      return;
    }
    setSubmitting(true);
    try {
      let startISO: string;
      let endISO: string;

      if (mode === "timer") {
        if (!timerStopped || !timerStartTime) {
          showToast("请先开始并结束计时");
          setSubmitting(false);
          return;
        }
        startISO = timerStartTime.toISOString();
        endISO = new Date().toISOString();
      } else {
        if (durationMin <= 0) {
          showToast("结束时间应晚于开始时间");
          setSubmitting(false);
          return;
        }
        startISO = timeToISO(recordDate, startTime);
        endISO = timeToISO(recordDate, endTime);
      }

      // 构建备注
      const noteArr: string[] = [];
      const periodLabels: Record<string, string> = {
        night: "夜间",
        morning_nap: "上午小睡",
        afternoon_nap: "下午小睡",
        other: "其他",
      };
      if (sleepPeriod !== "night") {
        noteArr.push("时段：" + (periodLabels[sleepPeriod] || sleepPeriod));
      }
      const qualityLabels: Record<string, string> = {
        good: "良好",
        normal: "一般",
        poor: "较差",
      };
      noteArr.push("质量：" + (qualityLabels[sleepQuality] || sleepQuality));
      if (note) noteArr.push(note);

      // 两步流程：先 startSleep 创建 ongoing 记录，再 endSleep 结束并计算时长
      const { id: sleepId } = await recordsApi.sleep.startSleep(currentFamily.id, {
        baby_id: currentBaby.id,
        start_time: startISO,
      });
      await recordsApi.sleep.endSleep(currentFamily.id, sleepId, {
        end_time: endISO,
        note: noteArr.join(" / ") || undefined,
      });

      showToast("✓ 睡眠记录已保存");
      setTimeout(() => navigate("/"), 1400);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "#FAF5F6" }}>
      {/* 导航栏 */}
      <NavBar title="睡眠记录" onBack={() => navigate(-1)} />

      {/* 模式切换 */}
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

      <div className="pb-32">
        {/* 计时模式 */}
        {mode === "timer" && (
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
        color="#4CAF82"
        disabledColor="#A8D8B0"
      />

      <ToastMessage toast={toast} />
    </div>
  );
}
