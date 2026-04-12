/**
 * RecordGroup 按日期分组的记录组件
 *
 * 显示一组同一天的记录，包含：
 * - 日期标题行（含彩色圆点标识今天/历史）
 * - 白色卡片容器（内含多个 RecordListItem）
 * - 可选：按类型模式下在同日卡片内插入类型区段小标题
 *
 * 被引用：RecordsPage.tsx
 */
import { Fragment } from "react";
import RecordListItem from "./RecordListItem";
import type { RecordItem, FeedingRecord, DiaperRecord } from "@/api";
import { getRecordType } from "@/lib/utils";
import { RECORD_TYPE_CFG } from "@/lib/constants";

/** 单日分组数据 */
export interface RecordGroupData {
  /** 日期 key，格式 YYYY-M-D，用于 React key */
  dateKey: string;
  /** 日期显示标签，如 "2026年3月31日 · 今天" */
  dateLabel: string;
  /** 是否为今天（影响圆点颜色和标题颜色） */
  isToday: boolean;
  /** 该日期下的所有记录 */
  items: RecordItem[];
}

/** RecordGroup 属性 */
interface RecordGroupProps {
  /** 分组数据 */
  group: RecordGroupData;
  /** 点击某条记录时的回调 */
  onRecordClick: (record: RecordItem) => void;
  /** 为 true 时在同日卡片内按记录类型分块并显示小标题（与「按类型」排序配合） */
  groupByType?: boolean;
}

/** 计算饮食类型的汇总信息 */
function calcFeedingSummary(items: RecordItem[]): string[] {
  const badges: string[] = [];
  const feedItems = items as unknown as FeedingRecord[];

  const breastCount = feedItems.filter((r) => r.feed_type === "breast").length;
  const formulaItems = feedItems.filter((r) => r.feed_type === "formula");
  const foodCount = feedItems.filter(
    (r) => r.feed_type === "complementary",
  ).length;

  if (breastCount > 0) badges.push(`母乳 ${breastCount} 次`);

  if (formulaItems.length > 0) {
    const totalMl = formulaItems.reduce(
      (sum, r) => sum + (r.formula_ml ?? 0),
      0,
    );
    if (totalMl > 0) {
      badges.push(`配方奶 ${totalMl} ml`);
    } else {
      badges.push(`配方奶 ${formulaItems.length} 次`);
    }
  }

  if (foodCount > 0) badges.push(`辅食 ${foodCount} 次`);

  return badges;
}

/** 计算尿布类型的汇总信息 */
function calcDiaperSummary(items: RecordItem[]): string[] {
  const badges: string[] = [];
  const diaperItems = items as unknown as DiaperRecord[];

  const wetCount = diaperItems.filter((r) => r.diaper_type === "wet").length;
  const dirtyCount = diaperItems.filter(
    (r) => r.diaper_type === "dirty",
  ).length;
  const mixedCount = diaperItems.filter(
    (r) => r.diaper_type === "mixed",
  ).length;

  // 嘘嘘次数 = wet + mixed
  const totalWet = wetCount + mixedCount;
  // 臭臭次数 = dirty + mixed
  const totalDirty = dirtyCount + mixedCount;

  if (totalWet > 0) badges.push(`嘘嘘 ${totalWet} 次`);
  if (totalDirty > 0) badges.push(`臭臭 ${totalDirty} 次`);

  return badges;
}

/** 同日卡片内按类型分块时的小标题（首页今日时间线复用） */
export function RecordTypeSectionHeader({
  typeKey,
  withTopBorder,
  items,
}: {
  typeKey: string;
  withTopBorder: boolean;
  items?: RecordItem[];
}) {
  const label = RECORD_TYPE_CFG[typeKey]?.label ?? typeKey;

  // 只在有 items 时计算汇总（非首页复用模式）
  let summaryBadges: string[] = [];
  if (items && items.length > 0) {
    if (typeKey === "feeding") {
      summaryBadges = calcFeedingSummary(items);
    } else if (typeKey === "diaper") {
      summaryBadges = calcDiaperSummary(items);
    }
  }

  return (
    <div
      className="px-4 pt-2 pb-1 flex items-center justify-between gap-2"
      style={withTopBorder ? { borderTop: "0.5px solid #F5F0F2" } : undefined}>
      <span
        className="text-[11px] font-semibold tracking-wide"
        style={{ color: "#9A7E82" }}>
        {label}
      </span>
      {summaryBadges.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap justify-end">
          {summaryBadges.map((badge) => (
            <span
              key={badge}
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full tabular-nums"
              style={{ background: "#F5F0F2", color: "#B0A0A4" }}>
              {badge}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 单日记录分组
 */
export default function RecordGroup({
  group,
  onRecordClick,
  groupByType = false,
}: RecordGroupProps) {
  return (
    <div>
      {/* 日期分组标题 */}
      <div
        className="flex items-center justify-between px-5"
        style={{ paddingTop: 16, paddingBottom: 8 }}>
        {/* 左：圆点 + 日期标签 */}
        <div
          className="flex items-center gap-1.5"
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: group.isToday ? "#7A5A60" : "#9A8090",
            letterSpacing: "0.2px",
          }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: group.isToday ? "#F87098" : "#C0A8AD",
              flexShrink: 0,
            }}
          />
          {group.dateLabel}
        </div>

        {/* 右：当日条数 badge */}
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
          style={{
            background: group.isToday ? "#FFF0F4" : "#F5F0F2",
            color: group.isToday ? "#F87098" : "#B0A0A4",
          }}>
          {group.items.length} 条
        </span>
      </div>

      {/* 记录卡片（白色圆角容器，同一天的记录共用一个容器） */}
      <div
        className="mx-4 bg-white rounded-2xl overflow-hidden"
        style={{
          boxShadow:
            "0 1px 8px rgba(200,100,120,0.06), 0 0.5px 2px rgba(0,0,0,0.04)",
        }}>
        {group.items.map((rec, i) => {
          const t = getRecordType(rec);
          const prevT = i > 0 ? getRecordType(group.items[i - 1]) : null;
          const showSection = groupByType && (i === 0 || t !== prevT);
          const showDivider =
            i > 0 && (!groupByType || (prevT != null && prevT === t));

          // 同类型的所有 items（用于汇总标题）
          const typeItems = showSection
            ? group.items.filter((r) => getRecordType(r) === t)
            : [];

          return (
            <Fragment key={rec.id}>
              {showSection && (
                <RecordTypeSectionHeader
                  typeKey={t}
                  withTopBorder={groupByType && i > 0}
                  items={typeItems}
                />
              )}
              <RecordListItem
                record={rec}
                showDivider={showDivider}
                onClick={onRecordClick}
              />
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
