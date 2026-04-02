/**
 * 医疗记录 - 检查类型选择（2 列网格，6 种类型）
 */
import {
  IconBaby,
  IconMicroscope,
  IconHospital,
  IconSyringe,
  IconBloodDrop,
  IconFileText,
} from "@/components/ui/icons";
import type { IconProps } from "@/components/ui/icons";

const VISIT_TYPE_OPTIONS: {
  key: string;
  label: string;
  color: string;
  Icon: React.FC<IconProps>;
}[] = [
  { key: "checkup", label: "儿保检查",   color: "#F0B8C8", Icon: IconBaby       },
  { key: "allergy", label: "过敏原检测", color: "#F0A0B0", Icon: IconMicroscope },
  { key: "sick",    label: "就诊记录",   color: "#C8A8D8", Icon: IconHospital   },
  { key: "vaccine", label: "疫苗接种",   color: "#88C8A0", Icon: IconSyringe    },
  { key: "blood",   label: "血液检查",   color: "#F87098", Icon: IconBloodDrop  },
  { key: "other",   label: "其他检查",   color: "#B09A9D", Icon: IconFileText   },
];

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function VisitTypeSection({ value, onChange }: Props) {
  return (
    <div
      className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
      style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 8,
          padding: "8px 12px 14px",
        }}>
        {VISIT_TYPE_OPTIONS.map(({ key, label, color, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className="flex items-center gap-2.5 rounded-xl transition-all"
            style={{
              padding: "11px 12px",
              border: `1.5px solid ${value === key ? "#F87098" : "#EDE0E3"}`,
              background: value === key ? "#FFF5F8" : "#fff",
            }}>
            {/* 图标 */}
            <div
              className="flex items-center justify-center rounded-lg flex-shrink-0"
              style={{ width: 28, height: 28, background: `${color}22` }}>
              <Icon size={15} color={color} />
            </div>
            <span
              className="text-[13px] font-semibold"
              style={{ color: value === key ? "#F87098" : "#4A3035" }}>
              {label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
