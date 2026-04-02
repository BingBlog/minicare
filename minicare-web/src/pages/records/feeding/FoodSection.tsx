/**
 * 饮食记录 - 辅食 Tab 内容（升级版）
 *
 * 功能：
 *  - 已添加辅食：tag chip 样式展示，点击 × 删除
 *  - 快捷选择：横向分类标签（主食/蔬菜/水果/肉蛋/豆制品）
 *               点击分类后展开对应辅食 chip 列表
 *  - 输入框：支持搜索推荐下拉，本地过滤
 */
import { useState, useEffect, useRef } from "react";
import {
  fetchBabyFoods,
  searchBabyFoods,
  getFoodsByCategory,
  type BabyFood,
  type FoodCategory,
} from "@/api/babyFoods";

interface Props {
  /** 已添加的辅食列表 */
  foodList: string[];
  /** 当前输入框的值 */
  inputValue: string;
  /** 输入框内容变化回调 */
  onInputChange: (v: string) => void;
  /** 新增辅食（使用 inputValue 当前值） */
  onAdd: () => void;
  /** 直接添加一个辅食名称（不经过 inputValue 中转） */
  onDirectAdd: (name: string) => void;
  /** 删除某项辅食 */
  onRemove: (idx: number) => void;
}

/** 分类对应颜色
 *  chipBgLight — 未选中时的极浅背景
 *  chipBg      — 搜索下拉 tag 背景（中等浅色）
 *  chipText    — 未选中文字色
 *  activeBg    — 选中后背景（深色）
 */
const CATEGORY_COLORS: Record<
  string,
  { bg: string; activeBg: string; text: string; chipBg: string; chipBgLight: string; chipText: string }
> = {
  grain:     { bg: "#FFF8ED", activeBg: "#E8950A", text: "#4A3035", chipBg: "#FFF1D6", chipBgLight: "#FFF8F0", chipText: "#A0620A" },
  vegetable: { bg: "#F0FFF4", activeBg: "#3A9E6E", text: "#4A3035", chipBg: "#DCF5E8", chipBgLight: "#EEFAF3", chipText: "#1A7A4A" },
  fruit:     { bg: "#FFF5F7", activeBg: "#F05878", text: "#4A3035", chipBg: "#FFE8EE", chipBgLight: "#FFF2F5", chipText: "#C0305A" },
  meat_egg:  { bg: "#FFF0F0", activeBg: "#CC5040", text: "#4A3035", chipBg: "#FFE0DC", chipBgLight: "#FFF0EE", chipText: "#A03020" },
  bean:      { bg: "#F5F0FF", activeBg: "#8050C0", text: "#4A3035", chipBg: "#EBE0FF", chipBgLight: "#F5F0FF", chipText: "#6030A0" },
};

export default function FoodSection({
  foodList,
  inputValue,
  onInputChange,
  onAdd,
  onDirectAdd,
  onRemove,
}: Props) {
  // 辅食数据
  const [allFoods, setAllFoods] = useState<BabyFood[]>([]);
  const [categories, setCategories] = useState<FoodCategory[]>([]);
  const [loadError, setLoadError] = useState(false);

  // 分类面板展开
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // 搜索下拉
  const [suggestions, setSuggestions] = useState<BabyFood[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 初次加载全量辅食数据
  useEffect(() => {
    fetchBabyFoods()
      .then(({ items, categories: cats }) => {
        setAllFoods(items);
        setCategories(cats);
      })
      .catch(() => setLoadError(true));
  }, []);

  // 输入框变化 → 实时搜索
  useEffect(() => {
    if (!inputValue.trim()) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    const results = searchBabyFoods(inputValue, allFoods);
    setSuggestions(results);
    setShowDropdown(results.length > 0);
  }, [inputValue, allFoods]);

  // 点击外部关闭下拉
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        !inputRef.current?.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /** 点击快捷 chip 直接添加 */
  const handleQuickAdd = (name: string) => {
    if (!foodList.includes(name)) {
      onDirectAdd(name);
    }
  };

  /** 点击搜索建议项 */
  const handleSuggestionClick = (food: BabyFood) => {
    setShowDropdown(false);
    onDirectAdd(food.name);
  };

  /** 切换分类展开 */
  const toggleCategory = (key: string) => {
    setActiveCategory((prev) => (prev === key ? null : key));
  };

  const activeCategoryFoods =
    activeCategory ? getFoodsByCategory(activeCategory, allFoods) : [];

  return (
    <>
      {/* ── 标题 ─────────────────────────────────────────────────── */}
      <div className="px-4 mb-1">
        <span className="text-[12px] font-semibold text-[#9A8090]">辅食记录</span>
      </div>

      {/* ── 已添加辅食 Tag Chips ──────────────────────────────────── */}
      {foodList.length > 0 && (
        <div
          className="mx-4 mb-2 bg-white rounded-2xl px-4 pt-3 pb-2 flex flex-wrap gap-2"
          style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>
          {foodList.map((food, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[13px] font-medium"
              style={{ background: "#FFE8EE", color: "#C0305A" }}>
              {food}
              <button
                type="button"
                onClick={() => onRemove(idx)}
                className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ml-0.5"
                style={{ background: "#F87098", color: "#fff", fontSize: 11, lineHeight: 1 }}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* ── 搜索输入框 + 下拉（独立卡片，不受 overflow-hidden 截断） ── */}
      <div className="relative mx-4 mb-3">
        <div
          className="bg-white rounded-2xl"
          style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>
          <div className="flex items-center gap-2 px-4 py-3">
            <span className="text-[14px] text-[#D0B8BC]">🔍</span>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setShowDropdown(false);
                  onAdd();
                }
              }}
              onFocus={() => {
                if (suggestions.length > 0) setShowDropdown(true);
              }}
              placeholder="输入辅食名称搜索，如：南瓜"
              className="flex-1 text-[13px] text-[#4A3035] outline-none"
              style={{ background: "transparent" }}
            />
            <button
              type="button"
              onClick={() => {
                setShowDropdown(false);
                onAdd();
              }}
              className="text-[22px] font-light flex-shrink-0"
              style={{ color: "#F87098" }}>
              ＋
            </button>
          </div>
        </div>

        {/* 搜索下拉推荐 —— 绝对定位于独立卡片下方，不受任何 overflow-hidden 截断 */}
        {showDropdown && suggestions.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute left-0 right-0 z-50 bg-white rounded-xl overflow-hidden"
            style={{
              top: "calc(100% + 4px)",
              boxShadow: "0 4px 20px rgba(200,100,120,0.18)",
              border: "0.5px solid #F5EEF0",
            }}>
            {suggestions.map((food, idx) => {
              const colors = CATEGORY_COLORS[food.category];
              const catLabel = categories.find((c) => c.key === food.category);
              return (
                <button
                  key={food.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault(); // 阻止 input blur
                    handleSuggestionClick(food);
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-[#FFF5F7] transition-colors"
                  style={{
                    borderBottom:
                      idx < suggestions.length - 1 ? "0.5px solid #F5EEF0" : "none",
                  }}>
                  <span
                    className="text-[11px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0"
                    style={{ background: colors.chipBg, color: colors.chipText }}>
                    {catLabel?.emoji} {catLabel?.label}
                  </span>
                  <span className="text-[13px] text-[#4A3035] font-medium flex-1">
                    {food.name}
                  </span>
                  {food.allergen && (
                    <span className="text-[10px] text-[#F87098]">⚠️ 过敏原</span>
                  )}
                  {food.note && (
                    <span className="text-[11px] text-[#B09098] truncate max-w-[100px]">
                      {food.note}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 快捷选择区域 ──────────────────────────────────────────── */}
      {!loadError && categories.length > 0 && (
        <>
          <div className="px-4 mb-1 flex items-center gap-1.5">
            <span className="text-[12px] font-semibold text-[#9A8090]">常见辅食</span>
            <span className="text-[11px] text-[#C0A8B0]">点击分类快速添加</span>
          </div>

          <div className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
            style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>

            {/* 分类标签横向滚动 */}
            <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-none">
              {categories.map((cat) => {
                const colors = CATEGORY_COLORS[cat.key] ?? CATEGORY_COLORS.grain;
                const isActive = activeCategory === cat.key;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => toggleCategory(cat.key)}
                    className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all"
                    style={{
                      background: isActive ? colors.activeBg : colors.bg,
                      color: isActive ? "#fff" : colors.text,
                      border: isActive
                        ? `1.5px solid ${colors.activeBg}`
                        : "1.5px solid transparent",
                    }}>
                    <span>{cat.emoji}</span>
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>

            {/* 展开的辅食 chip 列表 */}
            {activeCategory && activeCategoryFoods.length > 0 && (
              <>
                <div style={{ borderTop: "0.5px solid #F5EEF0", margin: "0 16px" }} />
                <div className="px-4 py-3 flex flex-wrap gap-2">
                  {activeCategoryFoods.map((food) => {
                    const colors = CATEGORY_COLORS[food.category] ?? CATEGORY_COLORS.grain;
                    const isAdded = foodList.includes(food.name);
                    return (
                      <button
                        key={food.id}
                        type="button"
                        onClick={() => handleQuickAdd(food.name)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all"
                        style={{
                          background: isAdded ? colors.activeBg : colors.chipBgLight,
                          color: isAdded ? "#fff" : colors.chipText,
                          cursor: "pointer",
                        }}>
                        {food.name}
                        {food.allergen && (
                          <span style={{ fontSize: 9, opacity: isAdded ? 0.85 : 1 }}>⚠️</span>
                        )}
                        {food.popularity === 1 && !isAdded && (
                          <span
                            className="text-[9px] px-1 rounded-full"
                            style={{ background: colors.chipBg, color: colors.chipText }}>
                            常用
                          </span>
                        )}
                        {isAdded && (
                          <span style={{ fontSize: 11, opacity: 0.9 }}>✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* 过敏原提示 */}
                {activeCategoryFoods.some((f) => f.allergen) && (
                  <div className="px-4 pb-3">
                    <span className="text-[11px] text-[#C0A8B0]">
                      ⚠️ 标注项为常见过敏原，建议少量引入观察3天
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
