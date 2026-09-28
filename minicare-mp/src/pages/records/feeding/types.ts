/**
 * 饮食记录 - 公共类型定义（与 Web 1:1 对齐）
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
  hint?: string;
  group: "must" | "optional";
}

export const suppItems: SuppItem[] = [
  { key: "vitD", label: "维生素 D", unit: "IU", hint: "出生后即补，促钙吸收、防佝偻病", group: "must" },
  { key: "iron", label: "铁", unit: "mg", hint: "母乳宝宝 4~6 个月后易缺铁", group: "must" },
  { key: "calcium", label: "钙", unit: "mg", hint: "奶量够一般不缺，缺时再补", group: "optional" },
  { key: "dha", label: "DHA", unit: "mg", hint: "促进大脑、视力发育", group: "optional" },
  { key: "vitAD", label: "维生素 AD", unit: "IU", hint: "预防夜盲、呼吸道感染、缺钙", group: "optional" },
  { key: "zinc", label: "锌", unit: "mg", hint: "食欲差、生长慢、易感冒时考虑", group: "optional" },
  { key: "probiotic", label: "益生菌", unit: "亿", hint: "腹泻、便秘、消化不好时用", group: "optional" },
  { key: "vitC", label: "维生素 C", unit: "mg", hint: "加辅食后多吃果蔬即可", group: "optional" },
];

export interface CommonFoodGroup {
  key: string
  label: string
  items: string[]
}

/**
 * 常见辅食清单（6-12 月常见引入食材）
 * 来源：国内儿保喂养建议的常见起始食材分组，便于快速勾选录入。
 * 辅食记录页与排敏看板页共用此配置。
 */
export const COMMON_FOOD_GROUPS: CommonFoodGroup[] = [
  {
    key: 'grain',
    label: '谷薯主食',
    items: ['纯米粉', '强化铁米粉', '小米粉', '燕麦粉', '山药泥', '土豆泥', '南瓜泥'],
  },
  {
    key: 'vegetable',
    label: '蔬菜',
    items: ['胡萝卜泥', '西兰花泥', '菠菜泥', '豌豆泥', '西葫芦泥', '番茄泥'],
  },
  {
    key: 'fruit',
    label: '水果',
    items: ['苹果泥', '梨泥', '香蕉泥', '牛油果泥', '蓝莓泥', '桃泥'],
  },
  {
    key: 'protein',
    label: '优质蛋白',
    items: ['蛋黄泥', '鸡肉泥', '猪里脊泥', '鳕鱼泥', '豆腐泥', '三文鱼泥'],
  },
  {
    key: 'combo',
    label: '组合辅食',
    items: ['米粉+南瓜泥', '米粉+苹果泥', '小米粥', '蔬菜鸡肉泥', '鳕鱼土豆泥', '蛋黄米糊'],
  },
]

/**
 * 辅食排敏状态样式映射（辅食记录页与排敏看板页共用）
 */
export const FOOD_STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  safe:       { bg: '#E8F5E9', color: '#4CAF82', label: '已耐受' },
  suspected:  { bg: '#FFF3D6', color: '#DDB870', label: '疑似' },
  allergic:   { bg: '#FFE8EE', color: '#F05060', label: '过敏' },
  observing:  { bg: '#E8F0FE', color: '#6B8EC8', label: '观察中' },
  paused:     { bg: '#F0E8EA', color: '#9A8090', label: '已停用' },
}

/** 判断一个食物名是否属于预设清单 */
export function isPresetFood(name: string): boolean {
  return COMMON_FOOD_GROUPS.some((g) => g.items.includes(name))
}

/** 奶量快捷 chip */
export const AMOUNT_CHIPS = [60, 90, 120, 150, 180];
