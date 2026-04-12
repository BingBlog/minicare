/**
 * QuickActions 快捷记录分层入口组件
 *
 * 首页 L2 区第一张卡片：分为 A/B 两区
 *  - A区：前 3 个 key，大卡片（展示上次记录摘要）
 *  - B区：后续 key，小格子（最多 4 列）
 *
 * 编辑模式：
 *  - A/B 合并为统一网格，格子右上角有 × 删除按钮
 *  - 支持长按 / 触摸拖拽调整顺序（@dnd-kit/sortable）
 *  - 下方格子库：展示未加入快捷区的功能，点击添加
 *  - 「完成」保存，「取消」放弃
 *
 * 被引用：HomePage.tsx
 */
import { useNavigate } from "react-router-dom";
import { useEffect, useState, useRef, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import RecordTypeIcon from "@/components/record/RecordTypeIcon";
import {
  RECORD_TYPE_CFG,
  RECORD_ROUTES,
  ALL_QUICK_ACTION_KEYS,
  GLOBAL_FAB_GROUPS,
} from "@/lib/constants";
import { useQuickActionKeys } from "@/lib/useQuickActionKeys";

// ── Tab 跳转参数 ───────────────────────────────────────────────────────────────
const TAB_STATE: Record<string, string> = {
  formula: "formula",
  breast: "breast",
  food: "food",
  supplement: "supplement",
};

// ── 格子库分组（与 GLOBAL_FAB_GROUPS 保持一致） ────────────────────────────────
const EDIT_POOL_GROUPS = GLOBAL_FAB_GROUPS;

// ─────────────────────────────────────────────────────────────────────────────
// 可排序的大卡片（A区样式）
// ─────────────────────────────────────────────────────────────────────────────
interface SortableCardProps {
  id: string;
  cfg: { label: string; bg: string };
  canDelete: boolean;
  onRemove: () => void;
  isDraggingAny: boolean;
}
function SortableCard({
  id,
  cfg,
  canDelete,
  onRemove,
  isDraggingAny,
}: SortableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="relative touch-none">
      {/* 格子主体 */}
      <div
        {...attributes}
        {...listeners}
        className="flex flex-col items-center gap-2 rounded-xl px-2 pt-3.5 pb-3 cursor-grab active:cursor-grabbing text-center select-none"
        style={{
          background: cfg.bg,
          opacity: isDraggingAny && !isDragging ? 0.7 : 1,
        }}>
        <RecordTypeIcon
          type={id}
          containerSize={54}
          iconSize={28}
          borderRadius={16}
        />
        <span className="text-[13px] font-semibold text-[#4A3035]">
          {cfg.label}
        </span>
      </div>
      {/* × 删除 */}
      {canDelete && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#F05060] flex items-center justify-center shadow-sm z-10">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path
              d="M2.5 2.5l5 5M7.5 2.5l-5 5"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 可排序的小格子（B区样式）
// ─────────────────────────────────────────────────────────────────────────────
interface SortableChipProps {
  id: string;
  cfg: { label: string };
  canDelete: boolean;
  onRemove: () => void;
  isDraggingAny: boolean;
}
function SortableChip({
  id,
  cfg,
  canDelete,
  onRemove,
  isDraggingAny,
}: SortableChipProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="relative touch-none">
      <div
        {...attributes}
        {...listeners}
        className="bg-white border border-gray-100 rounded-xl flex flex-col items-center gap-1.5 cursor-grab active:cursor-grabbing select-none"
        style={{
          padding: "12px 4px 10px",
          opacity: isDraggingAny && !isDragging ? 0.7 : 1,
        }}>
        <RecordTypeIcon
          type={id}
          containerSize={44}
          iconSize={22}
          borderRadius={13}
        />
        <span className="text-[12px] font-semibold text-[#4a3035]">
          {cfg.label}
        </span>
      </div>
      {/* × 删除 */}
      {canDelete && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#F05060] flex items-center justify-center shadow-sm z-10">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path
              d="M2.5 2.5l5 5M7.5 2.5l-5 5"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 拖拽预览（DragOverlay 中显示，防止闪烁）
// ─────────────────────────────────────────────────────────────────────────────
interface DragPreviewProps {
  id: string;
  isACard: boolean; // A区大卡片 or B区小格子
}
function DragPreview({ id, isACard }: DragPreviewProps) {
  const cfg = RECORD_TYPE_CFG[id];
  if (!cfg) return null;
  if (isACard) {
    return (
      <div
        className="flex flex-col items-center gap-2 rounded-xl px-2 pt-3.5 pb-3 shadow-xl rotate-2 select-none"
        style={{ background: cfg.bg, width: 100 }}>
        <RecordTypeIcon
          type={id}
          containerSize={54}
          iconSize={28}
          borderRadius={16}
        />
        <span className="text-[13px] font-semibold text-[#4A3035]">
          {cfg.label}
        </span>
      </div>
    );
  }
  return (
    <div
      className="bg-white border border-gray-100 rounded-xl flex flex-col items-center gap-1.5 shadow-xl rotate-2 select-none"
      style={{ padding: "12px 4px 10px", width: 72 }}>
      <RecordTypeIcon
        type={id}
        containerSize={44}
        iconSize={22}
        borderRadius={13}
      />
      <span className="text-[12px] font-semibold text-[#4a3035]">
        {cfg.label}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 主组件 Props
// ─────────────────────────────────────────────────────────────────────────────
interface QuickActionsProps {
  onMoreClick: () => void;
  fabCount?: number;
}

export default function QuickActions({
  onMoreClick,
  fabCount = 5,
}: QuickActionsProps) {
  const navigate = useNavigate();
  const {
    aKeys,
    bKeys,
    isEditing,
    startEditing,
    saveEditing,
    cancelEditing,
    removeKey,
    addKey,
    reorderDraft,
  } = useQuickActionKeys();

  const [showHint, setShowHint] = useState(false);
  useEffect(() => {
    setShowHint(localStorage.getItem("fab_first_open") !== "true");
  }, []);

  const handleHintClick = () => {
    onMoreClick();
    localStorage.setItem("fab_first_open", "true");
    setShowHint(false);
  };

  const handleNavigate = useCallback(
    (key: string) => {
      if (isEditing) return;
      const path = RECORD_ROUTES[key];
      const tabKey = TAB_STATE[key];
      if (tabKey) navigate(path, { state: { tab: tabKey } });
      else navigate(path);
    },
    [isEditing, navigate],
  );

  // ── 拖拽状态 ────────────────────────────────────────────────────────────────
  const [activeId, setActiveId] = useState<string | null>(null);
  const currentKeys = [...aKeys, ...bKeys];
  const activeIsCard = activeId ? aKeys.includes(activeId) : false;

  // dnd-kit sensors：PointerSensor（鼠标/触控笔）+ TouchSensor（手机触摸）
  // activationConstraint 避免轻触被当成拖拽
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 6 },
    }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      if (!over || active.id === over.id) return;
      const fromIdx = currentKeys.indexOf(active.id as string);
      const toIdx = currentKeys.indexOf(over.id as string);
      if (fromIdx !== -1 && toIdx !== -1) {
        reorderDraft(fromIdx, toIdx);
      }
      // currentKeys 在每次 render 都是新数组，用 ref 保持 stable
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [currentKeys.join(","), reorderDraft],
  );

  // ── 格子库 ──────────────────────────────────────────────────────────────────
  const poolKeys = (ALL_QUICK_ACTION_KEYS as readonly string[]).filter(
    (k) => !currentKeys.includes(k),
  );
  const canAdd = currentKeys.length < 7;

  // ── 编辑态：统一混合网格（A+B 合并，可拖拽）────────────────────────────────
  // A区 key（前3）→ 大卡片；B区 key（后续）→ 小格子
  // 为让两种尺寸在同一 grid 里并排，编辑模式统一使用「4列小格子」样式
  // A区大卡片退化为统一 4 列小格样式，降低复杂度
  const canDelete = currentKeys.length > 1;

  return (
    <div
      className="bg-white rounded-2xl overflow-hidden"
      style={{
        boxShadow:
          "0 2px 12px rgba(200,100,120,0.08), 0 1px 3px rgba(0,0,0,0.04)",
      }}>
      {/* ── 标题行 ── */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-1.5">
        <span className="text-[11px] font-semibold text-[#9A8090] tracking-[0.8px] uppercase">
          快捷记录
        </span>
        {isEditing ? (
          <div className="flex items-center gap-3">
            <span
              className="text-xs text-[#9A8090] cursor-pointer active:opacity-70"
              onClick={cancelEditing}>
              取消
            </span>
            <span
              className="text-xs text-primary font-semibold cursor-pointer active:opacity-70"
              onClick={saveEditing}>
              完成
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span
              className="text-xs text-[#9A8090] cursor-pointer active:opacity-70"
              onClick={startEditing}>
              编辑
            </span>
            <span
              className="text-xs text-primary font-medium cursor-pointer flex items-center gap-0.5 active:opacity-70"
              onClick={onMoreClick}>
              更多 ({fabCount}) ›
            </span>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          正常模式：A区大卡片 + B区小格子（分割线分隔，无固定分类标签）
          ══════════════════════════════════════════════════════════════════════ */}
      {!isEditing && (
        <>
          {/* A区：大卡片 */}
          {aKeys.length > 0 && (
            <div className="px-3 pt-1 pb-2">
              <div
                className="grid gap-2"
                style={{
                  gridTemplateColumns: `repeat(${Math.min(aKeys.length, 3)}, 1fr)`,
                }}>
                {aKeys.map((key) => {
                  const cfg = RECORD_TYPE_CFG[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleNavigate(key)}
                      className="flex flex-col items-center gap-2 rounded-xl px-2 pt-3.5 pb-3 cursor-pointer transition-transform active:scale-95 text-center w-full"
                      style={{ background: cfg.bg }}>
                      <RecordTypeIcon
                        type={key}
                        containerSize={54}
                        iconSize={28}
                        borderRadius={16}
                      />
                      <span className="text-[13px] font-semibold text-[#4A3035]">
                        {cfg.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* A/B 分割线 */}
          {aKeys.length > 0 && bKeys.length > 0 && (
            <div className="mx-3 border-t border-[#F5F0F2]" />
          )}

          {/* B区：小格子 */}
          {bKeys.length > 0 && (
            <div className="px-3 pt-2 pb-1">
              <div
                className="grid gap-2"
                style={{
                  gridTemplateColumns: `repeat(${Math.min(bKeys.length, 4)}, 1fr)`,
                }}>
                {bKeys.map((key) => {
                  const cfg = RECORD_TYPE_CFG[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleNavigate(key)}
                      className="bg-white border border-gray-100 rounded-xl flex flex-col items-center gap-1.5 cursor-pointer transition-transform active:scale-95"
                      style={{ padding: "12px 4px 10px" }}>
                      <RecordTypeIcon
                        type={key}
                        containerSize={44}
                        iconSize={22}
                        borderRadius={13}
                      />
                      <span className="text-[12px] font-semibold text-[#4a3035]">
                        {cfg.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          编辑模式：A+B 统一网格，可拖拽排序
          前3 = 大卡片样式，后续 = 小格子样式，两区在同一 DndContext 内
          ══════════════════════════════════════════════════════════════════════ */}
      {isEditing && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}>
          <div className="px-3 pt-1 pb-2">
            {/* 数量提示 */}
            <div className="text-[10px] font-semibold text-[#C0A8AD] tracking-[0.5px] mb-2 px-1 flex items-center gap-1">
              <span>已添加（{currentKeys.length} / 7）</span>
              <span className="text-[#DDD0D5]">· 长按拖拽可排序</span>
            </div>

            {/* A区（大卡片）可拖拽 */}
            {aKeys.length > 0 && (
              <SortableContext
                items={currentKeys}
                strategy={rectSortingStrategy}>
                <div
                  className="grid gap-2 mb-2"
                  style={{
                    gridTemplateColumns: `repeat(${Math.min(aKeys.length, 3)}, 1fr)`,
                  }}>
                  {aKeys.map((key) => {
                    const cfg = RECORD_TYPE_CFG[key];
                    return (
                      <SortableCard
                        key={key}
                        id={key}
                        cfg={cfg}
                        canDelete={canDelete}
                        onRemove={() => removeKey(key)}
                        isDraggingAny={activeId !== null}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            )}

            {/* A/B 编辑分割线 */}
            {aKeys.length > 0 && bKeys.length > 0 && (
              <div className="border-t border-dashed border-[#EEE8EC] my-2" />
            )}

            {/* B区（小格子）可拖拽 */}
            {bKeys.length > 0 && (
              <SortableContext
                items={currentKeys}
                strategy={rectSortingStrategy}>
                <div
                  className="grid gap-2"
                  style={{
                    gridTemplateColumns: `repeat(${Math.min(bKeys.length, 4)}, 1fr)`,
                  }}>
                  {bKeys.map((key) => {
                    const cfg = RECORD_TYPE_CFG[key];
                    return (
                      <SortableChip
                        key={key}
                        id={key}
                        cfg={cfg}
                        canDelete={canDelete}
                        onRemove={() => removeKey(key)}
                        isDraggingAny={activeId !== null}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            )}
          </div>

          {/* 拖拽预览（跟随手指浮层） */}
          <DragOverlay dropAnimation={{ duration: 180, easing: "ease" }}>
            {activeId ? (
              <DragPreview id={activeId} isACard={activeIsCard} />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* ── 编辑模式：格子库 ── */}
      {isEditing && (
        <>
          <div className="mx-3 border-t border-[#F5F0F2]" />
          <div className="px-3 pt-2 pb-3">
            <div className="text-[10px] font-semibold text-[#C0A8AD] tracking-[0.5px] uppercase mb-1.5 px-1">
              {canAdd ? "更多功能（点击添加）" : "已达上限（最多 7 个）"}
            </div>
            {poolKeys.length === 0 ? (
              <div className="text-[12px] text-[#C0A8AD] text-center py-2">
                所有功能均已在快捷区
              </div>
            ) : (
              <div className="space-y-2">
                {EDIT_POOL_GROUPS.map((group) => {
                  const groupPoolKeys = group.keys.filter((k) =>
                    poolKeys.includes(k),
                  );
                  if (groupPoolKeys.length === 0) return null;
                  return (
                    <div key={group.label}>
                      <div className="text-[10px] text-[#C0A8AD] px-1 mb-1">
                        {group.label}
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {groupPoolKeys.map((key) => {
                          const cfg = RECORD_TYPE_CFG[key];
                          return (
                            <button
                              key={key}
                              type="button"
                              disabled={!canAdd}
                              onClick={() => addKey(key)}
                              className="relative bg-[#F9F5F7] border border-dashed border-[#DDD0D5] rounded-xl flex flex-col items-center gap-1.5 transition-transform active:scale-95 disabled:opacity-40"
                              style={{ padding: "10px 4px 8px" }}>
                              <RecordTypeIcon
                                type={key}
                                containerSize={40}
                                iconSize={20}
                                borderRadius={12}
                              />
                              <span className="text-[11px] font-medium text-[#7A6070]">
                                {cfg.label}
                              </span>
                              {canAdd && (
                                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#F87098] flex items-center justify-center shadow-sm">
                                  <svg
                                    width="8"
                                    height="8"
                                    viewBox="0 0 8 8"
                                    fill="none">
                                    <path
                                      d="M4 1.5v5M1.5 4h5"
                                      stroke="white"
                                      strokeWidth="1.5"
                                      strokeLinecap="round"
                                    />
                                  </svg>
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── 非编辑模式：新用户引导行 ── */}
      {!isEditing && showHint && (
        <div
          className="flex items-center justify-center gap-1 pb-3 pt-1 cursor-pointer active:opacity-70"
          onClick={handleHintClick}>
          <span className="text-[11px] text-[#C0A8AD]">
            还有营养素、活动等 {fabCount} 项记录，点击
          </span>
          <span className="text-[11px] font-semibold text-[#C0A8AD]">更多</span>
          <span className="text-[11px] text-[#C0A8AD]">查看 ›</span>
        </div>
      )}

      {!isEditing && !showHint && <div className="h-3" />}
    </div>
  );
}
