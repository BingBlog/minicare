/**
 * 生长曲线图组件
 * 展示体重/身高/头围的生长曲线，叠加国家标准百分位区域
 */
import React from "react";
import type {
  GrowthChartProps,
  GrowthDataPoint,
  PercentileCurve,
} from "./types";
import { ChartRotatedXLabel } from "./chartAxis";

const DEFAULT_HEIGHT = 280;
/** 底部略大于通用值，为「月龄」标题与倾斜刻度留出空间 */
const DEFAULT_PADDING = { top: 30, right: 42, bottom: 54, left: 55 };

// 百分位参考线颜色
const REFERENCE_LINE_COLOR = "#C4B5D4";

// 百分位参考线配置：线型 + 右侧标签
const PERCENTILE_LINE_CONFIG: Record<
  string,
  { label: string; strokeWidth: number; dasharray: string; labelColor: string }
> = {
  p3: { label: "P3", strokeWidth: 1, dasharray: "3 3", labelColor: "#B0A0C8" },
  p15: {
    label: "P15",
    strokeWidth: 1,
    dasharray: "3 3",
    labelColor: "#B0A0C8",
  },
  p50: {
    label: "P50",
    strokeWidth: 1.5,
    dasharray: "none",
    labelColor: "#9B8ED8",
  },
  p85: {
    label: "P85",
    strokeWidth: 1,
    dasharray: "3 3",
    labelColor: "#B0A0C8",
  },
  p97: {
    label: "P97",
    strokeWidth: 1,
    dasharray: "3 3",
    labelColor: "#B0A0C8",
  },
};

// 实际数据点颜色
const DATA_POINT_COLOR = "#F87098";

// 测量类型配置
/** 与 LineChart 一致：用三次贝塞尔在相邻点间平滑过渡（用于实测折线） */
function smoothPathFromPoints(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  return points
    .map((p, i) => {
      if (i === 0) return `M ${p.x} ${p.y}`;
      const prev = points[i - 1];
      const cpx = (prev.x + p.x) / 2;
      return `C ${cpx} ${prev.y} ${cpx} ${p.y} ${p.x} ${p.y}`;
    })
    .join(" ");
}

/**
 * Catmull-Rom 样条：两点间只有单一弧度，切线方向由前后邻点决定，曲线自然连续。
 * 适合百分位参考线这类单调平滑曲线。tension=0.5 为标准 Catmull-Rom。
 */
function catmullRomPath(
  points: { x: number; y: number }[],
  tension = 0.5,
): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2)
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  const d: string[] = [`M ${points[0].x} ${points[0].y}`];
  const pts = [points[0], ...points, points[points.length - 1]];
  for (let i = 1; i < pts.length - 2; i++) {
    const p0 = pts[i - 1],
      p1 = pts[i],
      p2 = pts[i + 1],
      p3 = pts[i + 2];
    const cp1x = p1.x + ((p2.x - p0.x) * tension) / 3;
    const cp1y = p1.y + ((p2.y - p0.y) * tension) / 3;
    const cp2x = p2.x - ((p3.x - p1.x) * tension) / 3;
    const cp2y = p2.y - ((p3.y - p1.y) * tension) / 3;
    d.push(`C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`);
  }
  return d.join(" ");
}

/** 横向每月龄最小像素，避免点/刻度挤在一起 */
const PX_PER_MONTH = 36;
/** 数据月龄跨度小于此值（月）时，横轴改为只框住数据附近，避免「全段坐标 + 局部数据」导致点挤成一列 */
const ZOOM_DOMAIN_SPAN_THRESHOLD_MO = 1.5;
const DOMAIN_PAD_MO = 0.4;
const MIN_X_DOMAIN_SPAN_MO = 0.35;

const MEASURE_CONFIG = {
  weight: {
    label: "体重",
    unit: "kg",
    formatValue: (v: number) => (v / 1000).toFixed(1), // g -> kg
    yMin: 2,
    yMax: 16,
  },
  height: {
    label: "身高",
    unit: "cm",
    formatValue: (v: number) => (v / 10).toFixed(1), // mm -> cm
    yMin: 45,
    yMax: 100,
  },
  head: {
    label: "头围",
    unit: "cm",
    formatValue: (v: number) => (v / 10).toFixed(1), // mm -> cm
    yMin: 30,
    yMax: 50,
  },
};

export function GrowthChart({
  data,
  percentiles,
  gender,
  measureType,
  height = DEFAULT_HEIGHT,
  containerWidth,
  className,
}: GrowthChartProps) {
  const pad = { ...DEFAULT_PADDING };
  const chartHeight = height;
  const innerHeight = chartHeight - pad.top - pad.bottom;

  const stdMaxMonth =
    percentiles.length > 0
      ? Math.max(...percentiles.map((p) => p.ageMonths))
      : 36;

  const dataMinMonth =
    data.length > 0 ? Math.min(...data.map((d) => d.ageMonths)) : 0;
  const dataMaxMonth =
    data.length > 0 ? Math.max(...data.map((d) => d.ageMonths)) : 0;

  /** 无局部放大时的默认上界：给标准曲线留出上下文，又比固定 36 月更紧凑 */
  const contextXMax = Math.min(
    stdMaxMonth,
    Math.max(6, Math.ceil(dataMaxMonth) + 1),
  );

  let xDomainMin = 0;
  let xDomainMax = contextXMax;
  const dataSpanMo = dataMaxMonth - dataMinMonth;

  if (data.length >= 2 && dataSpanMo < ZOOM_DOMAIN_SPAN_THRESHOLD_MO) {
    let lo = Math.max(0, dataMinMonth - DOMAIN_PAD_MO);
    let hi = Math.min(stdMaxMonth, dataMaxMonth + DOMAIN_PAD_MO);
    if (hi - lo < 2) {
      const mid = (dataMinMonth + dataMaxMonth) / 2;
      lo = Math.max(0, mid - 1);
      hi = Math.min(stdMaxMonth, mid + 1);
    }
    xDomainMin = lo;
    xDomainMax = hi;
  } else if (data.length === 1 || dataSpanMo === 0) {
    const mid = dataMaxMonth;
    xDomainMin = Math.max(0, mid - 0.85);
    xDomainMax = Math.min(stdMaxMonth, mid + 0.85);
  }

  if (xDomainMax - xDomainMin < MIN_X_DOMAIN_SPAN_MO) {
    const mid = (xDomainMin + xDomainMax) / 2;
    xDomainMin = Math.max(0, mid - MIN_X_DOMAIN_SPAN_MO / 2);
    xDomainMax = Math.min(stdMaxMonth, mid + MIN_X_DOMAIN_SPAN_MO / 2);
  }

  const xDomainSpan = Math.max(MIN_X_DOMAIN_SPAN_MO, xDomainMax - xDomainMin);

  // 宽度计算：按月龄跨度 / 点数两者取大，再被 containerWidth 向上限制，防止超出屏幕
  const widthByDomain = pad.left + pad.right + xDomainSpan * PX_PER_MONTH;
  const widthByPoints =
    data.length > 0 ? pad.left + pad.right + data.length * 22 : widthByDomain;
  const rawWidth = Math.max(300, widthByDomain, widthByPoints);
  const chartWidth = containerWidth
    ? Math.min(rawWidth, Math.max(300, containerWidth))
    : rawWidth;
  const innerWidth = chartWidth - pad.left - pad.right;

  const config = MEASURE_CONFIG[measureType];

  // Y 轴范围：只取可视月龄区间内的百分位 + 实测数据，动态收窄，避免全程数据把纵轴撑得太大
  const allValues = data.map((d) => {
    if (measureType === "weight") return d.value / 1000;
    return d.value / 10;
  });
  const visiblePercentiles = percentiles.filter(
    (p) => p.ageMonths >= xDomainMin - 0.5 && p.ageMonths <= xDomainMax + 0.5,
  );
  const pValues = visiblePercentiles.flatMap((p) => {
    const curve = p[gender];
    if (!curve) return [];
    if (measureType === "weight") return [curve.p3 / 1000, curve.p97 / 1000];
    return [curve.p3 / 10, curve.p97 / 10];
  });
  const allYValues = [...allValues, ...pValues].filter((v) => v > 0);

  const dataYMin =
    allYValues.length > 0 ? Math.min(...allYValues) : config.yMin;
  const dataYMax =
    allYValues.length > 0 ? Math.max(...allYValues) : config.yMax;
  const yPad = (dataYMax - dataYMin) * 0.08 || dataYMin * 0.08;
  const yMin = Math.max(0, Math.floor((dataYMin - yPad) * 10) / 10);
  const yMax = Math.ceil((dataYMax + yPad) * 10) / 10;
  const yRange = yMax - yMin;

  // 坐标转换：映射到「可视月龄区间」[xDomainMin, xDomainMax]，避免数据集中在一小段月龄时横向重合
  const xScale = (ageMonths: number) =>
    pad.left + ((ageMonths - xDomainMin) / xDomainSpan) * innerWidth;
  const yScale = (value: number) =>
    pad.top + innerHeight - ((value - yMin) / yRange) * innerHeight;

  /** 百分位带仅绘制可视区间内的整数月龄采样，避免域外坐标跑到画布外 */
  const mSampleStart = Math.max(0, Math.floor(xDomainMin));
  const mSampleEnd = Math.min(stdMaxMonth, Math.ceil(xDomainMax));

  // Y 轴刻度
  const yTicks = 5;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => {
    const value = yMin + (yRange * i) / yTicks;
    return { value, label: value.toFixed(1) };
  });

  // X 轴刻度：随可视区间疏密变化，减少「0月/6月」挤在同一窄图上的重叠
  const xTickMonths: number[] = (() => {
    const span = xDomainMax - xDomainMin;
    if (span <= 0) return [xDomainMin];
    let step = 6;
    if (span <= 2.5) step = 0.5;
    else if (span <= 6) step = 1;
    else if (span <= 18) step = 3;
    const ticks: number[] = [];
    const nMax = Math.ceil(span / step) + 3;
    let t = Math.ceil((xDomainMin - 1e-9) / step) * step;
    t = Math.round(t * 100) / 100;
    for (let i = 0; i < nMax && t <= xDomainMax + 1e-6; i++) {
      if (t >= xDomainMin - 1e-9) ticks.push(Math.round(t * 100) / 100);
      t = Math.round((t + step) * 100) / 100;
    }
    if (ticks.length > 8) {
      const coarse = span <= 18 ? 3 : 6;
      const coarseTicks: number[] = [];
      let ct = Math.ceil(xDomainMin / coarse) * coarse;
      for (let j = 0; j < 12 && ct <= xDomainMax + 1e-6; j++) {
        coarseTicks.push(ct);
        ct += coarse;
      }
      return coarseTicks.slice(0, 8);
    }
    return ticks;
  })();

  // 绘制百分位参考线 + 右侧标签（无阴影区域）
  const renderPercentileLines = () => {
    const lines: JSX.Element[] = [];
    const genderPercentiles = percentiles.filter((p) => p[gender]);

    if (genderPercentiles.length < 2) return lines;

    const percentileKeys: Array<"p3" | "p15" | "p50" | "p85" | "p97"> = [
      "p3",
      "p15",
      "p50",
      "p85",
      "p97",
    ];

    percentileKeys.forEach((key) => {
      const cfg = PERCENTILE_LINE_CONFIG[key];
      const coords: { x: number; y: number }[] = [];
      for (let m = mSampleStart; m <= mSampleEnd; m += 1) {
        const point = percentiles.find((p) => p.ageMonths === m);
        if (point && point[gender]) {
          const val = point[gender]![key];
          const scaledVal = measureType === "weight" ? val / 1000 : val / 10;
          coords.push({ x: xScale(m), y: yScale(scaledVal) });
        }
      }
      if (coords.length > 1) {
        const last = coords[coords.length - 1];
        lines.push(
          <g key={`pline-${key}`}>
            {/* Catmull-Rom 样条：相邻点间单一弧度，更平滑 */}
            <path
              d={catmullRomPath(coords)}
              fill="none"
              stroke={REFERENCE_LINE_COLOR}
              strokeWidth={cfg.strokeWidth}
              strokeDasharray={cfg.dasharray}
            />
            {/* 右侧标签 */}
            <text
              x={last.x + 4}
              y={last.y + 4}
              fontSize={9}
              fill={cfg.labelColor}
              fontWeight={key === "p50" ? 600 : 400}>
              {cfg.label}
            </text>
          </g>,
        );
      }
    });

    return lines;
  };

  // 绘制实际数据点连线和点
  const renderDataPoints = () => {
    if (data.length === 0) return null;

    const validData = data
      .filter((d) => d.value > 0)
      .sort((a, b) => a.ageMonths - b.ageMonths);
    if (validData.length === 0) return null;

    // 转换数据
    const points = validData.map((d) => ({
      x: xScale(d.ageMonths),
      y: yScale(measureType === "weight" ? d.value / 1000 : d.value / 10),
      ...d,
    }));

    const linePath = catmullRomPath(points.map((p) => ({ x: p.x, y: p.y })));

    return (
      <g className="data-series">
        {/* 连线 */}
        <path
          d={linePath}
          fill="none"
          stroke={DATA_POINT_COLOR}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* 数据点 */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={4}
            fill={DATA_POINT_COLOR}
            stroke="white"
            strokeWidth={2}
          />
        ))}
      </g>
    );
  };

  return (
    <div className={className}>
      <svg
        width={chartWidth}
        height={chartHeight}
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
        {/* 网格线 */}
        <g className="grid-lines">
          {yTickValues.map((tick, i) => (
            <line
              key={i}
              x1={pad.left}
              y1={yScale(tick.value)}
              x2={chartWidth - pad.right}
              y2={yScale(tick.value)}
              stroke="#F3F4F6"
              strokeWidth={1}
            />
          ))}
        </g>

        {/* Y 轴标签 */}
        <g className="y-axis-labels">
          {yTickValues.map((tick, i) => (
            <text
              key={i}
              x={pad.left - 10}
              y={yScale(tick.value) + 4}
              textAnchor="end"
              fill="#9CA3AF"
              fontSize={11}>
              {tick.label}
            </text>
          ))}
          {/* Y 轴单位 */}
          <text
            x={pad.left - 10}
            y={pad.top - 10}
            textAnchor="end"
            fill="#6B7280"
            fontSize={11}
            fontWeight={500}>
            {config.unit}
          </text>
        </g>

        {/* X 轴标签（月龄刻度，倾斜以与其它图表一致） */}
        <g className="x-axis-labels">
          {xTickMonths.map((m) => (
            <ChartRotatedXLabel
              key={m}
              x={xScale(m)}
              chartHeight={chartHeight}
              paddingBottom={pad.bottom}>
              {Math.abs(m - Math.round(m)) < 1e-6
                ? `${Math.round(m)}月`
                : `${m.toFixed(1)}月`}
            </ChartRotatedXLabel>
          ))}
          {/* X 轴标题 */}
          <text
            x={chartWidth / 2}
            y={chartHeight - 4}
            textAnchor="middle"
            fill="#6B7280"
            fontSize={11}
            fontWeight={500}>
            月龄
          </text>
        </g>

        {/* 百分位参考线 */}
        {renderPercentileLines()}

        {/* 实际数据点 */}
        {renderDataPoints()}
      </svg>

      {/* 图例 */}
      <div
        className="flex flex-wrap gap-3 mt-2 justify-center text-xs"
        style={{ color: "#B0A0C8" }}>
        <span className="flex items-center gap-1">
          <svg width="16" height="8">
            <line
              x1="0"
              y1="4"
              x2="16"
              y2="4"
              stroke="#C4B5D4"
              strokeWidth="1.5"
              strokeDasharray="3 3"
            />
          </svg>
          P3 / P15 / P85 / P97
        </span>
        <span className="flex items-center gap-1">
          <svg width="16" height="8">
            <line
              x1="0"
              y1="4"
              x2="16"
              y2="4"
              stroke="#9B8ED8"
              strokeWidth="1.5"
            />
          </svg>
          P50
        </span>
        <span className="flex items-center gap-1">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: DATA_POINT_COLOR }}></span>
          <span className="text-gray-500">实际测量</span>
        </span>
      </div>
    </div>
  );
}
