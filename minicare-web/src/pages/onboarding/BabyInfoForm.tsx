/**
 * Onboarding Step 1 — 宝宝基本信息表单
 *
 * 包含：
 *   - 宝宝昵称（必填文字输入框）
 *   - 出生日期（必填日期选择器，上限今天，下限 2010）
 *   - 性别（必填，男/女 圆角药丸切换）
 */
import DatePicker from "@/components/DatePicker";

interface Props {
  babyName: string;
  onBabyNameChange: (v: string) => void;
  birthDate: string;
  onBirthDateChange: (v: string) => void;
  gender: "male" | "female";
  onGenderChange: (v: "male" | "female") => void;
}

/** 表单行容器，带下边线 */
function Row({ children, noBorder }: { children: React.ReactNode; noBorder?: boolean }) {
  return (
    <div
      className="flex items-center px-4 py-3.5"
      style={noBorder ? undefined : { borderBottom: "1px solid #F5F0F2" }}>
      {children}
    </div>
  );
}

/** 必填星号 */
const Required = () => <span className="text-red-400">*</span>;

/** 切换按钮 */
function GenderPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="cursor-pointer px-4 py-1 rounded-full text-sm font-medium transition-all border"
      style={
        active
          ? { background: "#F87098", color: "#fff", borderColor: "#F87098" }
          : { background: "#fff", color: "#9A8090", borderColor: "#E8E0E4" }
      }>
      {label}
    </div>
  );
}

export default function BabyInfoForm({
  babyName,
  onBabyNameChange,
  birthDate,
  onBirthDateChange,
  gender,
  onGenderChange,
}: Props) {
  return (
    <>
      {/* 节标题 */}
      <div className="text-xs font-bold text-[#9A8090] px-5 pt-4 pb-1.5" style={{ letterSpacing: ".3px" }}>
        基本信息
      </div>

      {/* 卡片容器 */}
      <div className="mx-4 bg-white rounded-2xl overflow-hidden" style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.07)" }}>
        {/* 宝宝昵称 */}
        <Row>
          <span className="text-sm text-[#4A3035]">
            宝宝昵称 <Required />
          </span>
          <input
            type="text"
            placeholder="给宝宝起个名字"
            value={babyName}
            onChange={(e) => onBabyNameChange(e.target.value)}
            className="flex-1 text-right border-none outline-none bg-transparent text-sm text-[#4A3035] placeholder:text-[#C0A8AD]"
            maxLength={20}
          />
        </Row>

        {/* 出生日期 */}
        <Row>
          <span className="text-sm text-[#4A3035] flex-shrink-0">
            出生日期 <Required />
          </span>
          <DatePicker
            label=""
            value={birthDate}
            onChange={onBirthDateChange}
            max={new Date().toISOString().split("T")[0]}
            min="2010-01-01"
            className="flex-1 justify-end"
          />
        </Row>

        {/* 性别 */}
        <Row noBorder>
          <span className="text-sm text-[#4A3035]">
            性别 <Required />
          </span>
          <div className="flex-1 flex gap-2 justify-end">
            <GenderPill label="男" active={gender === "male"} onClick={() => onGenderChange("male")} />
            <GenderPill label="女" active={gender === "female"} onClick={() => onGenderChange("female")} />
          </div>
        </Row>
      </div>
    </>
  );
}
