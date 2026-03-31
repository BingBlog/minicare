/**
 * Onboarding — 步骤进度指示器
 *
 * 共 3 步，当前高亮步骤为宽条；已完成步骤为小圆点（低透明度）；待完成为灰色小圆点。
 * 目前只用于 Step 1 表单页，共 3 个点（0=完成, 1=当前, 2=待完成）。
 */

interface Props {
  /** 当前步骤，0-based */
  current: number;
  /** 总步骤数，默认 3 */
  total?: number;
}

export default function StepDots({ current, total = 3 }: Props) {
  return (
    <div className="flex items-center justify-center gap-1.5 py-3 bg-white">
      {Array.from({ length: total }).map((_, i) => {
        if (i === current) {
          // 当前步骤：宽条
          return (
            <div
              key={i}
              style={{ width: 18, height: 6, borderRadius: 4, background: "#F87098" }}
            />
          );
        }
        if (i < current) {
          // 已完成：小圆点（低透明）
          return (
            <div
              key={i}
              style={{ width: 6, height: 6, borderRadius: "50%", background: "#F87098", opacity: 0.4 }}
            />
          );
        }
        // 未到达：灰色小圆点
        return (
          <div
            key={i}
            style={{ width: 6, height: 6, borderRadius: "50%", background: "#E8E0E4" }}
          />
        );
      })}
    </div>
  );
}
