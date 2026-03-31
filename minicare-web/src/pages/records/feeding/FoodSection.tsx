/**
 * 饮食记录 - 辅食 Tab 内容
 *
 * 功能：
 *  - 已添加辅食列表（带删除按钮）
 *  - 底部输入行：输入名称 + 回车或点击"＋"新增
 */

interface Props {
  /** 已添加的辅食列表 */
  foodList: string[];
  /** 当前输入框的值 */
  inputValue: string;
  /** 输入框内容变化回调 */
  onInputChange: (v: string) => void;
  /** 新增辅食 */
  onAdd: () => void;
  /** 删除某项辅食 */
  onRemove: (idx: number) => void;
}

export default function FoodSection({
  foodList,
  inputValue,
  onInputChange,
  onAdd,
  onRemove,
}: Props) {
  return (
    <>
      <div className="px-4 mb-1">
        <span className="text-[12px] font-semibold text-[#9A8090]">
          辅食记录
        </span>
      </div>
      <div
        className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
        style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>
        {/* 已添加列表 */}
        {foodList.map((food, idx) => (
          <div
            key={idx}
            className="flex items-center gap-2.5 px-4 py-3"
            style={{ borderBottom: "0.5px solid #F5EEF0" }}>
            <span className="flex-1 text-[14px] font-medium text-[#4A3035]">
              {food}
            </span>
            <button
              type="button"
              onClick={() => onRemove(idx)}
              className="w-5 h-5 rounded-full bg-[#F05060] text-white flex items-center justify-center text-[14px] font-bold flex-shrink-0">
              ×
            </button>
          </div>
        ))}

        {/* 输入行 */}
        <div className="flex items-center gap-2 px-4 py-3">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onAdd()}
            placeholder="添加辅食名称，如：南瓜泥"
            className="flex-1 text-[13px] text-[#4A3035] outline-none"
            style={{ background: "transparent" }}
          />
          <button
            type="button"
            onClick={onAdd}
            className="text-[22px] font-light text-[#F87098]">
            ＋
          </button>
        </div>
      </div>
    </>
  );
}
