/**
 * BabyHero 宝宝档案 Hero 区
 *
 * 展示宝宝大头像、名字/年龄/性别/生日、过敏信息标签，
 * 以及右侧「编辑」按钮。整行可点击，触发编辑弹层。
 *
 * 被引用：ProfilePage.tsx
 */
import type { AllergyLevel, AllergyType } from "@/api";
import { useAppConfig } from "@/lib/useAppConfig";
import { getBabyAge } from "@/lib/utils";

// ── 宝宝头像 SVG（卡通小人，白色线条）────────────────────────────

/** 编辑铅笔图标（14×14，用于编辑按钮） */
const IconPencil = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 14, height: 14 }}>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

/** BabyHero 属性 */
interface BabyHeroProps {
  /** 宝宝名称；为 null 时回落显示用户昵称 */
  babyName: string | null | undefined;
  /** 用户昵称，作为 babyName 为空时的回落值 */
  userNickname: string | null | undefined;
  /** 出生日期（ISO 格式，如"2025-04-01"） */
  birthDate: string | null | undefined;
  /**
   * 性别
   * "male"   - 男宝
   * "female" - 女宝
   * 其他     - 不显示性别
   */
  gender: string | null | undefined;
  /** 已选择的过敏类型列表 */
  allergyTypes: AllergyType[] | null | undefined;
  /**
   * 过敏程度
   * "mild" / "moderate" / "severe" / "unknown"
   */
  allergyLevel: AllergyLevel | null | undefined;
  /** 点击编辑按钮或整行的回调 */
  onEdit: () => void;
}

/**
 * 宝宝档案 Hero 区组件
 *
 * @example
 * <BabyHero
 *   babyName={currentBaby?.name}
 *   userNickname={user?.nickname}
 *   birthDate={currentBaby?.birth_date}
 *   gender={currentBaby?.gender}
 *   allergyTypes={currentBaby?.allergy_types}
 *   allergyLevel={currentBaby?.allergy_level as AllergyLevel}
 *   onEdit={openEdit}
 * />
 */
export default function BabyHero({
  babyName,
  userNickname,
  birthDate,
  gender,
  allergyTypes,
  allergyLevel,
  onEdit,
}: BabyHeroProps) {
  const { getLabel } = useAppConfig()

  /** 显示的名称：优先宝宝名，回落用户昵称，最终回落"未设置昵称" */
  const displayName = babyName ?? userNickname ?? "未设置昵称";

  /** 性别中文（仅 male/female 时显示，其他不展示） */
  const genderLabel =
    gender === "male" ? "男宝" : gender === "female" ? "女宝" : null;

  /** 过敏类型的中文标签拼接（如"牛奶蛋白、鸡蛋"），无数据时为 null */
  const allergyTypeText =
    allergyTypes && allergyTypes.length > 0
      ? allergyTypes.map((t) => getLabel('allergyType', t)).join("、")
      : null;

  return (
    <div
      className="flex items-center gap-4 px-5 py-4 cursor-pointer"
      style={{ paddingBottom: 20 }}
      onClick={onEdit}>
      {/* ── 宝宝头像：粉色渐变圆形 + 白色卡通小人 ── */}
      <div
        className="flex items-center justify-center flex-shrink-0"
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #F9A8C0, #F87098)",
          boxShadow: "0 4px 14px rgba(248,112,152,.3)",
        }}>
        {/* 卡通宝宝 SVG：圆头 + 双眼点 + 身体弧线 */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fff"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ width: 42, height: 42 }}>
          <path d="M12 2a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4" />
          <path d="M5 20a7 7 0 0 1 14 0" />
          {/* 眼睛（实心圆点） */}
          <circle cx="9" cy="10.5" r="1" fill="#fff" />
          <circle cx="15" cy="10.5" r="1" fill="#fff" />
        </svg>
      </div>

      {/* ── 宝宝信息文字区 ── */}
      <div className="flex-1 min-w-0">
        {/* 宝宝名称 */}
        <div
          className="text-[20px] font-extrabold text-[#4A3035] tracking-tight"
          style={{ letterSpacing: "-0.3px" }}>
          {displayName}
        </div>

        {/* 年龄 + 性别 + 生日（有数据时正常显示，无数据时降权提示去编辑） */}
        {birthDate ? (
          <div className="text-[13px] text-[#9A8090] mt-0.5">
            {getBabyAge(birthDate)}
            {genderLabel && ` · ${genderLabel}`}
            {" · "}
            {new Date(birthDate).toLocaleDateString("zh-CN", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
            出生
          </div>
        ) : (
          <div className="text-[12px] mt-0.5" style={{ color: 'rgba(154,128,144,0.5)' }}>
            点击编辑，补充宝宝信息
          </div>
        )}
      </div>

      {/* ── 编辑按钮（阻止冒泡，避免与外层 onClick 重复触发）── */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        className="flex items-center gap-1 border-none cursor-pointer flex-shrink-0"
        style={{
          background: "#FFF0F4",
          color: "#F87098",
          padding: "8px 14px",
          borderRadius: 20,
          fontSize: 13,
          fontWeight: 600,
        }}>
        <IconPencil />
        编辑
      </button>
    </div>
  );
}
