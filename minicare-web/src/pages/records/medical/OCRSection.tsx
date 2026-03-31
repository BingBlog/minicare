/**
 * 医疗记录 - OCR 上传区域（拍照或上传病历/报告进行自动识别）
 */

import { useState } from "react";

const IconCamera = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 32, height: 32 }}>
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

const IconSearch = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 14, height: 14 }}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

// OCR 模拟结果
const mockOcrResult = [
  { label: "检查项目", value: "儿保 4 月龄" },
  { label: "身高", value: "68.0 cm" },
  { label: "体重", value: "7.5 kg" },
  { label: "结论", value: "发育正常" },
];

interface Props {
  showToast: (msg: string) => void;
}

export default function OCRSection({ showToast }: Props) {
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState(false);

  const handleOCR = () => {
    setOcrLoading(true);
    showToast("正在识别中…");
    setTimeout(() => {
      setOcrLoading(false);
      setOcrResult(true);
    }, 1200);
  };

  const confirmOCR = () => {
    setOcrResult(false);
    showToast("✓ 识别内容已填入");
  };

  if (!ocrResult) {
    return (
      <button
        type="button"
        onClick={handleOCR}
        disabled={ocrLoading}
        className="mx-4 mb-3 w-[calc(100%-32px)] flex flex-col items-center gap-2 rounded-2xl"
        style={{
          background: "#FFF5F8",
          border: "1.5px dashed #F0B8C8",
          padding: "20px 16px",
        }}>
        <div style={{ color: "#F87098", opacity: ocrLoading ? 0.5 : 1 }}>
          <IconCamera />
        </div>
        <div className="text-[14px] font-bold text-[#F87098]">拍照或上传病历/报告</div>
        <div className="text-[12px] text-[#9A8090] text-center leading-relaxed">
          支持 OCR 自动提取结构化结果
          <br />
          原图同时留档保存
        </div>
        <div
          className="text-[13px] font-semibold text-white rounded-lg px-5 py-2"
          style={{
            background: ocrLoading ? "#F9A8C0" : "#F87098",
            boxShadow: "0 3px 10px rgba(248,112,152,.3)",
          }}>
          {ocrLoading ? "识别中…" : "选择图片"}
        </div>
      </button>
    );
  }

  // OCR 识别结果
  return (
    <div
      className="mx-4 mb-3 rounded-2xl overflow-hidden"
      style={{ background: "#FFF5F8", border: "1.5px solid #F0B8C8", padding: "14px 16px" }}>
      <div className="flex items-center gap-1.5 mb-3 text-[13px] font-bold text-[#F87098]">
        <IconSearch />
        OCR 识别结果，请确认：
      </div>
      {mockOcrResult.map(({ label, value }) => (
        <div
          key={label}
          className="flex items-center justify-between py-2"
          style={{ borderBottom: "0.5px solid #F5EEF0" }}>
          <span className="text-[12px] text-[#9A8090]">{label}</span>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-[#4A3035]">{value}</span>
            <span className="text-[11px] text-[#F87098] font-medium">修改</span>
          </div>
        </div>
      ))}
      <div className="flex gap-2 mt-3">
        <button
          type="button"
          onClick={() => setOcrResult(false)}
          className="flex-1 py-2 rounded-xl text-[13px] font-semibold text-[#9A8090]"
          style={{ border: "1px solid #E5D8DA", background: "#fff" }}>
          重新上传
        </button>
        <button
          type="button"
          onClick={confirmOCR}
          className="flex-1 py-2 rounded-xl text-[13px] font-semibold text-white"
          style={{ background: "#F87098" }}>
          确认信息
        </button>
      </div>
    </div>
  );
}
