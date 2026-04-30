/**
 * 奶粉勺数步进工具函数（与 Web 1:1 对齐）
 */

export type Fraction = { n: number; d: number };

const FRAC_PARTS: Fraction[] = [
  { n: 0, d: 1 },
  { n: 1, d: 4 },
  { n: 1, d: 3 },
  { n: 1, d: 2 },
  { n: 2, d: 3 },
  { n: 3, d: 4 },
];

export const SCOOP_STEP_FRACS: Fraction[] = (() => {
  const result: Fraction[] = [];
  for (const f of FRAC_PARTS) result.push(f);
  for (let w = 1; w <= 20; w++) {
    result.push({ n: w, d: 1 });
    if (w < 20) {
      for (const f of FRAC_PARTS.slice(1)) {
        result.push({ n: w * f.d + f.n, d: f.d });
      }
    }
  }
  return result;
})();

export function fracToNum(f: Fraction): number {
  return f.n / f.d;
}

export const SCOOP_STEPS: number[] = SCOOP_STEP_FRACS.map(fracToNum);

export function stepUp(val: number): number {
  const idx = SCOOP_STEPS.findIndex((s) => s > val + 1e-9);
  return idx === -1 ? SCOOP_STEPS[SCOOP_STEPS.length - 1] : SCOOP_STEPS[idx];
}

export function stepDown(val: number): number {
  const idx = [...SCOOP_STEPS].reverse().findIndex((s) => s < val - 1e-9);
  return idx === -1 ? 0 : SCOOP_STEPS[SCOOP_STEPS.length - 1 - idx];
}

const FRAC_SYMBOL: Record<string, string> = {
  "1/4": "¼", "1/3": "⅓", "1/2": "½", "2/3": "⅔", "3/4": "¾",
  "5/4": "1¼", "4/3": "1⅓", "3/2": "1½", "5/3": "1⅔", "7/4": "1¾",
};

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
