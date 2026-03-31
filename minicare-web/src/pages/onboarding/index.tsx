/**
 * 新用户引导页 — 创建家庭 + 添加宝宝
 *
 * 流程（3 步，对齐 ui-draft/onboarding.html）：
 *   Step 0：引导介绍页（产品特性 + 「开始创建宝宝档案」按钮）
 *   Step 1：档案创建表单（姓名/出生日期/性别/过敏类型/过敏程度）
 *   Step 2：创建成功页（动画圆圈 + 宝宝信息卡片 + 进入首页）
 *
 * 子组件：
 *   Step0WelcomePage  引导介绍页
 *   StepDots          步骤进度指示器
 *   BabyInfoForm      基本信息表单（姓名/日期/性别）
 *   AllergySection    过敏信息（类型固定 + 程度选择 + CDC提示）
 *   OptionalFields    可选字段（出生体重/身高展开区）
 *   Step2SuccessPage  创建成功页
 */
import { useState } from "react";
import { familyApi, babyApi } from "@/api";
import { useAppStore } from "@/lib/store";
import type { AllergyLevel } from "@/api";

import Step0WelcomePage from "./Step0WelcomePage";
import StepDots from "./StepDots";
import BabyInfoForm from "./BabyInfoForm";
import AllergySection from "./AllergySection";
import OptionalFields from "./OptionalFields";
import Step2SuccessPage from "./Step2SuccessPage";

type Step = 0 | 1 | 2;
type AllergyLevelKey = AllergyLevel | "";

export default function OnboardingPage() {
  const { setCurrentFamily, setCurrentBaby } = useAppStore();

  const [step, setStep] = useState<Step>(0);

  // 家庭信息（Step 1 隐藏，自动生成）
  const [familyName] = useState("我们的家");

  // 宝宝基础信息
  const [babyName, setBabyName] = useState("");
  const [gender, setGender] = useState<"male" | "female">("male");
  const [birthDate, setBirthDate] = useState("");

  // 过敏信息
  const [allergyLevel, setAllergyLevel] = useState<AllergyLevelKey>("unknown");

  // 可选字段
  const [showOptional, setShowOptional] = useState(false);
  const [birthWeightG, setBirthWeightG] = useState("");
  const [birthHeightCm, setBirthHeightCm] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ── Toast ──────────────────────────────────────────────────────────
  const [toast, setToast] = useState("");
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  };

  // ── 保存档案 ────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!babyName.trim()) {
      showToast("请输入宝宝昵称");
      return;
    }
    if (!birthDate) {
      showToast("请选择出生日期");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const family = await familyApi.create(familyName);
      setCurrentFamily(family);

      const baby = await babyApi.create(family.id, {
        name: babyName.trim(),
        gender,
        birth_date: birthDate,
        allergy_types: ["milk"],
        allergy_level: allergyLevel || undefined,
        birth_weight_g: birthWeightG ? Number(birthWeightG) : undefined,
        birth_height_cm: birthHeightCm ? Number(birthHeightCm) : undefined,
      });
      setCurrentBaby(baby);

      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  // ── Step 0：引导页 ──────────────────────────────────────────────────
  if (step === 0) {
    return (
      <>
        <Step0WelcomePage onStart={() => setStep(1)} />
        {/* Toast */}
        {toast && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-[#4A3035] text-white text-sm px-5 py-2.5 rounded-full z-50 whitespace-nowrap shadow-lg">
            {toast}
          </div>
        )}
      </>
    );
  }

  // ── Step 2：创建成功 ────────────────────────────────────────────────
  if (step === 2) {
    return (
      <Step2SuccessPage
        babyName={babyName}
        gender={gender}
        birthDate={birthDate}
        allergyLevel={allergyLevel}
      />
    );
  }

  // ── Step 1：档案创建表单 ────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col overflow-hidden bg-bg">
      {/* 顶部导航 */}
      <div className="flex items-center px-4 py-3 flex-shrink-0 bg-white">
        <button
          onClick={() => setStep(0)}
          className="w-9 h-9 rounded-full bg-gray-100 border-none flex items-center justify-center cursor-pointer text-[18px] text-[#4A3035] flex-shrink-0">
          ←
        </button>
        <div className="flex-1 text-center text-[17px] font-bold text-[#4A3035]">创建宝宝档案</div>
        <div className="w-9" />
      </div>

      {/* 步骤进度点 */}
      <StepDots current={1} total={3} />

      {/* 表单滚动区 */}
      <div className="flex-1 overflow-y-auto pb-24">
        {/* 基本信息 */}
        <BabyInfoForm
          babyName={babyName}
          onBabyNameChange={setBabyName}
          birthDate={birthDate}
          onBirthDateChange={setBirthDate}
          gender={gender}
          onGenderChange={setGender}
        />

        {/* 过敏信息 */}
        <AllergySection
          allergyLevel={allergyLevel}
          onAllergyLevelChange={setAllergyLevel}
        />

        {/* 可选字段展开区 */}
        <OptionalFields
          birthWeightG={birthWeightG}
          onBirthWeightChange={setBirthWeightG}
          birthHeightCm={birthHeightCm}
          onBirthHeightChange={setBirthHeightCm}
          show={showOptional}
          onToggle={() => setShowOptional((v) => !v)}
        />

        {/* 错误提示 */}
        {error && (
          <div className="mx-4 mb-4 text-sm text-red-500 bg-red-50 px-4 py-2.5 rounded-xl">
            {error}
          </div>
        )}
      </div>

      {/* 底部保存按钮 */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] px-4 pb-6 pt-3 bg-bg">
        <button
          onClick={handleCreate}
          disabled={loading}
          className="w-full py-4 text-white font-bold text-base border-none cursor-pointer transition-all active:scale-[0.97] disabled:opacity-60"
          style={{
            borderRadius: 50,
            background: "linear-gradient(90deg, #F87098, #F9A8C0)",
            boxShadow: "0 6px 20px rgba(248,112,152,0.4)",
          }}>
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              创建中...
            </span>
          ) : (
            "保存档案"
          )}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 bg-[#4A3035] text-white text-sm px-5 py-2.5 rounded-full z-50 whitespace-nowrap shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
