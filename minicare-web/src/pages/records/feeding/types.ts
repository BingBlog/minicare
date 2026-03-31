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
    key: "eh_lactose",
    label: "深度水解（含乳糖）",
    desc: "转奶第2阶段",
    color: "#9B8ED8",
  },
  {
    key: "eh_no_lactose",
    label: "深度水解（无乳糖）",
    desc: "乳糖不耐受",
    color: "#7B6EC8",
  },
  { key: "ph", label: "适度水解奶粉", desc: "转奶第3阶段", color: "#DDB870" },
  { key: "std", label: "普通奶粉", desc: "免疫耐受后", color: "#4CAF82" },
];

/** 营养素项目 */
export interface SuppItem {
  key: string;
  label: string;
  unit: string;
}

export const suppItems: SuppItem[] = [
  { key: "vitD", label: "维生素 D", unit: "IU" },
  { key: "iron", label: "铁", unit: "mg" },
  { key: "probiotic", label: "益生菌", unit: "亿" },
  { key: "prebiotic", label: "益生元", unit: "g" },
  { key: "calcium", label: "钙", unit: "mg" },
];

/** 奶量快捷 chip */
export const AMOUNT_CHIPS = [60, 90, 120, 150, 180];
