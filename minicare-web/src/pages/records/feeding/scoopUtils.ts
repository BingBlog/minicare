/**
 * 奶粉勺数步进工具函数
 *
 * 用「分子/分母」精确表示每一步，彻底避免浮点误差。
 * 步进序列：0, 1/4, 1/3, 1/2, 2/3, 3/4, 1, 1+1/4, 1+1/3 … 直到整数 20
 */

/** 分数表示（n/d，d=1 表示整数） */
export type Fraction = { n: number; d: number };

/** 分数小数部分枚举 */
const FRAC_PARTS: Fraction[] = [
  { n: 0, d: 1 },   // 0（整数起点占位）
  { n: 1, d: 4 },   // 1/4
  { n: 1, d: 3 },   // 1/3
  { n: 1, d: 2 },   // 1/2
  { n: 2, d: 3 },   // 2/3
  { n: 3, d: 4 },   // 3/4
];

/**
 * 完整步进序列（分数形式）
 * 0 → 3/4 → 1 → 1+1/4 → … → 20
 * 整数部分 w + 分数 n/d 存储为 (w*d+n)/d，d=1 时即整数
 */
export const SCOOP_STEP_FRACS: Fraction[] = (() => {
  const result: Fraction[] = [];
  // 0 ~ 3/4
  for (const f of FRAC_PARTS) result.push(f);
  // 1 ~ 20（含分数细分）
  for (let w = 1; w <= 20; w++) {
    result.push({ n: w, d: 1 }); // 整数
    if (w < 20) {
      for (const f of FRAC_PARTS.slice(1)) {
        // 1/4 ~ 3/4 部分：w + n/d = (w*d+n)/d
        result.push({ n: w * f.d + f.n, d: f.d });
      }
    }
  }
  return result;
})();

/** 分数 → 浮点数（仅用于比较与索引查找） */
export function fracToNum(f: Fraction): number {
  return f.n / f.d;
}

/** 与 SCOOP_STEP_FRACS 一一对应的浮点值列表 */
export const SCOOP_STEPS: number[] = SCOOP_STEP_FRACS.map(fracToNum);

/** 向上取下一个步进值 */
export function stepUp(val: number): number {
  const idx = SCOOP_STEPS.findIndex((s) => s > val + 1e-9);
  return idx === -1 ? SCOOP_STEPS[SCOOP_STEPS.length - 1] : SCOOP_STEPS[idx];
}

/** 向下取上一个步进值 */
export function stepDown(val: number): number {
  const idx = [...SCOOP_STEPS].reverse().findIndex((s) => s < val - 1e-9);
  return idx === -1 ? 0 : SCOOP_STEPS[SCOOP_STEPS.length - 1 - idx];
}

/** Unicode 分数字符映射（分子/分母 → 符号） */
const FRAC_SYMBOL: Record<string, string> = {
  "1/4": "¼",
  "1/3": "⅓",
  "1/2": "½",
  "2/3": "⅔",
  "3/4": "¾",
  "5/4": "1¼",
  "4/3": "1⅓",
  "3/2": "1½",
  "5/3": "1⅔",
  "7/4": "1¾",
};

/**
 * 将浮点步进值格式化为分数字符串，永不显示小数点
 * @example formatScoop(1.25) → "1¼"
 */
export function formatScoop(val: number): string {
  if (val === 0) return "0";
  const idx = SCOOP_STEPS.findIndex((s) => Math.abs(s - val) < 1e-9);
  if (idx === -1) return String(Math.round(val));
  const { n, d } = SCOOP_STEP_FRACS[idx];
  if (d === 1) return String(n);
  const whole = Math.floor(n / d);
  const remN = n - whole * d;
  const fracKey = `${remN}/${d}`;
  const fracSym = FRAC_SYMBOL[fracKey] ?? `${remN}/${d}`;
  return whole === 0 ? fracSym : `${whole}${fracSym}`;
}
