/**
 * 医疗记录 - 基本信息输入区域（检查日期、就诊机构、主诊医生）
 */

import DatePicker from "@/components/DatePicker";

function nowDate(): string {
  return new Date().toISOString().split("T")[0];
}

interface Props {
  visitDate: string;
  hospital: string;
  doctor: string;
  onVisitDateChange: (v: string) => void;
  onHospitalChange: (v: string) => void;
  onDoctorChange: (v: string) => void;
}

export default function BasicInfoSection({
  visitDate,
  hospital,
  doctor,
  onVisitDateChange,
  onHospitalChange,
  onDoctorChange,
}: Props) {
  return (
    <div
      className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
      style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>
      {/* 检查日期 */}
      <div
        className="flex items-center px-4 py-3"
        style={{ borderBottom: "0.5px solid #F5EEF0" }}>
        <span className="text-[13px] text-[#7A5A60] flex-none w-20">检查日期</span>
        <div className="flex-1 flex justify-end items-center">
          <DatePicker value={visitDate} onChange={onVisitDateChange} max={nowDate()} label="" />
        </div>
      </div>
      {/* 就诊机构 */}
      <div
        className="flex items-center px-4 py-3"
        style={{ borderBottom: "0.5px solid #F5EEF0" }}>
        <span className="text-[13px] text-[#7A5A60] flex-none w-20">就诊机构</span>
        <div className="flex-1 flex justify-end items-center">
          <input
            type="text"
            value={hospital}
            onChange={(e) => onHospitalChange(e.target.value)}
            placeholder="医院/科室名称"
            className="text-[13px] text-[#4A3035] bg-transparent outline-none text-right w-full"
          />
        </div>
      </div>
      {/* 主诊医生 */}
      <div className="flex items-center px-4 py-3">
        <span className="text-[13px] text-[#7A5A60] flex-none w-20">主诊医生</span>
        <div className="flex-1 flex justify-end items-center">
          <input
            type="text"
            value={doctor}
            onChange={(e) => onDoctorChange(e.target.value)}
            placeholder="可选"
            className="text-[13px] text-[#4A3035] bg-transparent outline-none text-right w-full"
          />
        </div>
      </div>
    </div>
  );
}
