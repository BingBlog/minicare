/**
 * 睡眠记录 - 补录模式
 *
 * 包含：
 *  1. 记录日期（使用公共 DatePicker，自带今天/昨天快捷 + 滚轮自定义）
 *  2. 入睡时间 / 醒来时间 TimePicker
 *  3. 自动计算的睡眠时长显示
 */
import DatePicker from "@/components/DatePicker";
import TimePicker from "@/components/TimePicker";
import dayjs from "dayjs";

/** 根据入睡日期+时间、醒来日期+时间计算时长（分钟） */
function calcDurationMin(
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string,
): number {
  const start = dayjs(`${startDate}T${startTime}:00`);
  const end = dayjs(`${endDate}T${endTime}:00`);
  if (!start.isValid() || !end.isValid()) return 0;
  return Math.round(end.diff(start, 'minute', true));
}

interface Props {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
}

export default function ManualMode({
  startDate,
  endDate,
  startTime,
  endTime,
  onStartDateChange,
  onEndDateChange,
  onStartChange,
  onEndChange,
}: Props) {
  const durationMin = calcDurationMin(startDate, startTime, endDate, endTime);

  return (
    <>
      {/* 时间信息卡片 */}
      <div className="px-4 pt-3.5 pb-1">
        <span className="text-[12px] font-semibold text-[#9A8090]">
          时间信息
        </span>
      </div>
      <div
        className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
        style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>

        {/* 入睡日期 */}
        <div
          className="px-4 py-3"
          style={{ borderBottom: "0.5px solid #F5EEF0" }}>
          <DatePicker
            value={startDate}
            onChange={onStartDateChange}
            label="入睡日期"
          />
        </div>

        {/* 入睡时间 */}
        <div
          className="px-4 py-3"
          style={{ borderBottom: "0.5px solid #F5EEF0" }}>
          <TimePicker
            value={startTime}
            onChange={onStartChange}
            label="入睡时间"
          />
        </div>

        {/* 醒来日期 */}
        <div
          className="px-4 py-3"
          style={{ borderBottom: "0.5px solid #F5EEF0" }}>
          <DatePicker
            value={endDate}
            onChange={onEndDateChange}
            label="醒来日期"
          />
        </div>

        {/* 醒来时间 */}
        <div
          className="px-4 py-3"
          style={{ borderBottom: "0.5px solid #F5EEF0" }}>
          <TimePicker
            value={endTime}
            onChange={onEndChange}
            label="醒来时间"
          />
        </div>

        {/* 自动计算的时长 */}
        <div className="flex items-center px-4 py-3">
          <span className="text-[14px] text-[#7A5A60] flex-1">睡眠时长</span>
          <span className="text-[14px] font-semibold text-[#4A3035]">
            {durationMin > 0
              ? `${Math.floor(durationMin / 60)}h ${durationMin % 60}m（自动计算）`
              : "—"}
          </span>
        </div>
      </div>
    </>
  );
}
