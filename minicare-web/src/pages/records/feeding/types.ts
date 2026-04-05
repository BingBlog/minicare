/**
 * 饮食记录 - 公共类型定义
 */

/** 四个 Tab */
export type FeedTab = "formula" | "breast" | "supplement" | "food";

/** 奶粉类型 key */
export type MilkType = "aa" | "eh_lactose" | "eh_no_lactose" | "ph" | "std";

/** 奶粉类型配置 */
export interface MilkTypeOption {
  key: MilkType;
  label: string;
  desc: string;
  color: string;
}

export const milkTypeOptions: MilkTypeOption[] = [
  { key: "aa", label: "氨基酸奶粉", desc: "深度过敏 适用", color: "#F87098" },
  {
    key: "eh_no_lactose",
    label: "深度水解（无乳糖）",
    desc: "乳糖不耐受",
    color: "#7B6EC8",
  },
  {
    key: "eh_lactose",
    label: "深度水解（含乳糖）",
    desc: "转奶第2阶段",
    color: "#9B8ED8",
  },
  { key: "ph", label: "适度水解奶粉", desc: "转奶第3阶段", color: "#DDB870" },
  { key: "std", label: "普通奶粉", desc: "免疫耐受后", color: "#4CAF82" },
];

/** 营养素项目 */
export interface SuppItem {
  key: string;
  label: string;
  unit: string;
  /** 补充说明文字，显示在名称下方 */
  hint?: string;
  /** 分组：必吃 | 看情况 */
  group: "must" | "optional";
}

export const suppItems: SuppItem[] = [
  // ── 必吃 ──────────────────────────────────────────────
  {
    key: "vitD",
    label: "维生素 D",
    unit: "IU",
    hint: "出生后即补，促钙吸收、防佝偻病",
    group: "must",
  },
  {
    key: "iron",
    label: "铁",
    unit: "mg",
    hint: "母乳宝宝 4～6 个月后易缺铁",
    group: "must",
  },
  // ── 看情况 ────────────────────────────────────────────
  {
    key: "calcium",
    label: "钙",
    unit: "mg",
    hint: "奶量够一般不缺，缺时再补",
    group: "optional",
  },
  {
    key: "dha",
    label: "DHA",
    unit: "mg",
    hint: "促进大脑、视力发育",
    group: "optional",
  },
  {
    key: "vitAD",
    label: "维生素 AD",
    unit: "IU",
    hint: "预防夜盲、呼吸道感染、缺钙",
    group: "optional",
  },
  {
    key: "zinc",
    label: "锌",
    unit: "mg",
    hint: "食欲差、生长慢、易感冒时考虑",
    group: "optional",
  },
  {
    key: "probiotic",
    label: "益生菌",
    unit: "亿",
    hint: "腹泻、便秘、消化不好时用",
    group: "optional",
  },
  {
    key: "vitC",
    label: "维生素 C",
    unit: "mg",
    hint: "加辅食后多吃果蔬即可",
    group: "optional",
  },
];

/** 奶量快捷 chip */
export const AMOUNT_CHIPS = [60, 90, 120, 150, 180];
