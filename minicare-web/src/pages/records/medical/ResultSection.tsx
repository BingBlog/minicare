/**
 * 医疗记录 - 结果与诊断区域（结果摘要、诊断结论）
 */

interface Props {
  resultSummary: string;
  diagnosis: string;
  onResultSummaryChange: (v: string) => void;
  onDiagnosisChange: (v: string) => void;
}

export default function ResultSection({
  resultSummary,
  diagnosis,
  onResultSummaryChange,
  onDiagnosisChange,
}: Props) {
  return (
    <div
      className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
      style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>
      {/* 结果摘要 */}
      <div
        className="flex items-center px-4 py-3"
        style={{ borderBottom: "0.5px solid #F5EEF0" }}>
        <span className="text-[13px] text-[#7A5A60] flex-none w-20">结果摘要</span>
        <div className="flex-1 flex justify-end items-center">
          <input
            type="text"
            value={resultSummary}
            onChange={(e) => onResultSummaryChange(e.target.value)}
            placeholder="检查结论"
            className="text-[13px] text-[#4A3035] bg-transparent outline-none text-right w-full"
          />
        </div>
      </div>
      {/* 诊断结论 */}
      <div className="px-4 pt-3 pb-3">
        <div className="text-[13px] text-[#7A5A60] mb-2">诊断结论</div>
        <textarea
          value={diagnosis}
          onChange={(e) => onDiagnosisChange(e.target.value)}
          placeholder="医生建议、注意事项…"
          rows={3}
          className="w-full text-[13px] text-[#4A3035] resize-none outline-none leading-relaxed"
          style={{ background: "transparent" }}
        />
      </div>
    </div>
  );
}
