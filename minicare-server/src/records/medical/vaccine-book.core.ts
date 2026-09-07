/**
 * 疫苗本进度计算引擎（纯函数，无 IO —— 便于单测）
 * TECH-011 §3.4 / PRD-005 US-03
 *
 * 状态机（对齐 PRD）：done(已接种) / overdue(已超建议窗口待补) / pending(窗口内待接种)
 *   / upcoming(未到龄) / replaced(已由联合疫苗替代·手动标记) / hidden(家长关闭跟踪)
 */

export interface ScheduleDoseRow {
  vkey: string;
  name: string;
  category: 'free' | 'paid';
  dose_seq: number;
  dose_label: string;
  month_min: number | null;
  month_rec: number;
  month_max: number | null;
  note: string | null;
}

/** 一条疫苗记录（medical_record visit_type=vaccine 的投影） */
export interface VaxRecordRow {
  id: string;
  vaccine_schedule_key: string | null;
  vaccine_name: string | null;
  vaccine_dose_seq: number | null;
  visit_date: string; // YYYY-MM-DD
}

export interface VaccineSettingRow {
  vaccine_key: string;
  track_flag: number;
  replaced_flag: number;
}

export type DoseStatus = 'done' | 'pending' | 'overdue' | 'upcoming' | 'replaced' | 'hidden';

export interface DoseState {
  dose_seq: number;
  dose_label: string;
  month_min: number | null;
  month_rec: number;
  month_max: number | null;
  status: DoseStatus;
  date?: string;
  record_id?: string;
}

export interface VaccineCard {
  vkey: string;
  name: string;
  category: 'free' | 'paid';
  track_flag: boolean;
  replaced_flag: boolean;
  doses: DoseState[];
}

export interface NextVaccine {
  vkey: string;
  name: string;
  dose_seq: number;
  dose_label: string;
  month_rec: number;
  reason: 'overdue' | 'window' | 'near';
}

export interface VaccineBook {
  baby_months: number; // 整月（展示口径）
  overview: { done_doses: number; total_tracked: number; todo_doses: number; overdue_doses: number };
  next: NextVaccine[];
  vaccines: VaccineCard[];
  custom_vaccines: { name: string; shot_count: number; last_date?: string }[];
}

const DAYS_PER_MONTH = 30.4375;

/** 日期字符串 YYYY-MM-DD → 天数（UTC，避免时区漂移） */
function daysFromEpoch(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

/** 月龄（浮点，参考/逾期判定用）；整月口径由调用方 round down */
export function monthsFloat(birthDate: string, refDate: string): number {
  return (daysFromEpoch(refDate) - daysFromEpoch(birthDate)) / DAYS_PER_MONTH;
}

export interface ComputeInput {
  schedule: ScheduleDoseRow[];
  records: VaxRecordRow[];
  settings: VaccineSettingRow[];
  birth_date: string; // YYYY-MM-DD
  ref_date: string; // YYYY-MM-DD（服务端=北京今天）
}

/**
 * 核心计算：
 * 1) schedule 按 vkey 分组；2) 命中记录（key 精确 > name 兜底，取最新）；3) 状态判定；4) next 排序。
 */
export function computeVaccineBook(input: ComputeInput): VaccineBook {
  const { schedule, records, settings, birth_date, ref_date } = input;
  const months = monthsFloat(birth_date, ref_date);
  const babyMonths = Math.max(0, Math.floor(months));

  const settingsMap = new Map<string, VaccineSettingRow>();
  for (const s of settings) settingsMap.set(s.vaccine_key, s);

  // vkey → {name, category, doses}
  const grouped = new Map<string, { name: string; category: 'free' | 'paid'; doses: ScheduleDoseRow[] }>();
  for (const row of schedule) {
    if (!grouped.has(row.vkey)) grouped.set(row.vkey, { name: row.name, category: row.category, doses: [] });
    grouped.get(row.vkey)!.doses.push(row);
  }
  const nameByKey = new Map<string, string>();
  for (const row of schedule) nameByKey.set(row.vkey, row.name);

  // 记录命中：同一 (key|name, dose_seq) 去重，visit_date 字符串最大 = 最新
  const matchedRecordIds = new Set<string>();

  const findHit = (vkey: string, name: string, seq: number): VaxRecordRow | null => {
    const exact = records
      .filter((r) => r.vaccine_schedule_key === vkey && r.vaccine_dose_seq === seq)
      .sort((a, b) => (a.visit_date < b.visit_date ? 1 : -1))[0];
    if (exact) return exact;
    // 老数据无 key：name 快照兜底（如用户手动补全后 name 与参考库一致）
    return (
      records
        .filter((r) => r.vaccine_schedule_key == null && r.vaccine_name === name && r.vaccine_dose_seq === seq)
        .sort((a, b) => (a.visit_date < b.visit_date ? 1 : -1))[0] ?? null
    );
  };

  const vaccines: VaccineCard[] = [];
  let doneDoses = 0;
  let totalTracked = 0;
  let todoDoses = 0;
  let overdueDoses = 0;
  const nextCandidates: { item: NextVaccine; sortKey: number }[] = [];

  for (const [vkey, cardInfo] of grouped) {
    const setting = settingsMap.get(vkey);
    const trackFlag = setting ? setting.track_flag !== 0 : true;
    const replacedFlag = setting ? setting.replaced_flag !== 0 : false;

    const doses: DoseState[] = [];
    for (const d of cardInfo.doses.sort((a, b) => a.dose_seq - b.dose_seq)) {
      let status: DoseStatus;
      let date: string | undefined;
      let recordId: string | undefined;

      if (replacedFlag) {
        status = 'replaced';
      } else if (!trackFlag) {
        status = 'hidden';
      } else {
        const hit = findHit(vkey, cardInfo.name, d.dose_seq);
        if (hit) {
          matchedRecordIds.add(hit.id);
          status = 'done';
          date = hit.visit_date;
          recordId = hit.id;
        } else if (d.month_max != null && months >= d.month_max) {
          status = 'overdue';
        } else if (d.month_min == null || months >= d.month_min) {
          status = 'pending';
        } else {
          status = 'upcoming';
        }
      }

      if (status === 'done') doneDoses += 1;
      if (status !== 'hidden' && status !== 'replaced') {
        totalTracked += 1;
        if (status === 'pending' || status === 'overdue') {
          todoDoses += 1;
          if (status === 'overdue') overdueDoses += 1;
          nextCandidates.push({
            item: {
              vkey, name: cardInfo.name, dose_seq: d.dose_seq, dose_label: d.dose_label,
              month_rec: d.month_rec,
              reason: status === 'overdue' ? 'overdue' : 'window',
            },
            sortKey: status === 'overdue' ? 0 : 1,
          });
        }
      }
      if (status === 'upcoming') {
        // 近窗（1 个月内到龄）作为备选提醒
        if (months >= d.month_rec - 1 && (d.month_min == null || months < d.month_min)) {
          nextCandidates.push({
            item: {
              vkey, name: cardInfo.name, dose_seq: d.dose_seq, dose_label: d.dose_label,
              month_rec: d.month_rec, reason: 'near',
            },
            sortKey: 2,
          });
        }
      }

      doses.push({
        dose_seq: d.dose_seq,
        dose_label: d.dose_label,
        month_min: d.month_min,
        month_rec: d.month_rec,
        month_max: d.month_max,
        status,
        date,
        record_id: recordId,
      });
    }
    vaccines.push({
      vkey,
      name: cardInfo.name,
      category: cardInfo.category,
      track_flag: trackFlag,
      replaced_flag: replacedFlag,
      doses,
    });
  }

  // next 排序：overdue(按 max 近→远) → window(按 rec 升) → near(按 rec 升)；最多 3 条
  const next = nextCandidates
    .sort((a, b) => {
      if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
      if (a.item.reason === 'overdue') return a.item.month_rec - b.item.month_rec;
      return a.item.month_rec - b.item.month_rec;
    })
    .slice(0, 3)
    .map((x) => x.item);

  // 自定义疫苗（无 schedule_key 且无法 name 兜底命中的记录）聚合展示
  const customMap = new Map<string, { name: string; dates: string[] }>();
  for (const r of records) {
    if (matchedRecordIds.has(r.id)) continue;
    const key = r.vaccine_name ?? '未分类疫苗';
    if (!customMap.has(key)) customMap.set(key, { name: key, dates: [] });
    if (r.visit_date) customMap.get(key)!.dates.push(r.visit_date);
  }
  const customVaccines = [...customMap.values()]
    .map((c) => ({
      name: c.name,
      shot_count: c.dates.length,
      last_date: c.dates.sort().slice(-1)[0] as string | undefined,
    }))
    .sort((a, b) => {
      if (!a.last_date) return 1;
      if (!b.last_date) return -1;
      return a.last_date < b.last_date ? 1 : -1;
    });

  return {
    baby_months: babyMonths,
    overview: { done_doses: doneDoses, total_tracked: totalTracked, todo_doses: todoDoses, overdue_doses: overdueDoses },
    next,
    vaccines,
    custom_vaccines: customVaccines,
  };
}
