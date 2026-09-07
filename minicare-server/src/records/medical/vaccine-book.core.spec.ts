import { computeVaccineBook, ScheduleDoseRow } from './vaccine-book.core';

// ── fixtures ──
const schedule: ScheduleDoseRow[] = [
  { vkey: 'hepb', name: '乙肝疫苗', category: 'free', dose_seq: 1, dose_label: '第1剂', month_min: 0, month_rec: 0, month_max: 1, note: null },
  { vkey: 'hepb', name: '乙肝疫苗', category: 'free', dose_seq: 2, dose_label: '第2剂', month_min: 1, month_rec: 1, month_max: 3, note: null },
  { vkey: 'hepb', name: '乙肝疫苗', category: 'free', dose_seq: 3, dose_label: '第3剂', month_min: 6, month_rec: 6, month_max: 12, note: null },
  { vkey: 'bcg', name: '卡介苗', category: 'free', dose_seq: 1, dose_label: '第1剂', month_min: 0, month_rec: 0, month_max: 3, note: null },
  { vkey: 'mmr', name: '麻腮风疫苗', category: 'free', dose_seq: 1, dose_label: '第1剂', month_min: 8, month_rec: 8, month_max: 12, note: null },
  { vkey: 'mmr', name: '麻腮风疫苗', category: 'free', dose_seq: 2, dose_label: '第2剂', month_min: 18, month_rec: 18, month_max: null, note: null },
  { vkey: 'rv', name: '轮状病毒疫苗', category: 'paid', dose_seq: 1, dose_label: '第1剂', month_min: 2, month_rec: 2, month_max: 7, note: null },
];

const base = {
  schedule,
  records: [],
  settings: [],
  birth_date: '2026-01-01',
};

describe('computeVaccineBook 状态机', () => {
  it('新生儿：出生疫苗 done/待接种正确，概览正确', () => {
    const book = computeVaccineBook({ ...base, ref_date: '2026-01-10' }); // ~0.3 月
    const hepb = book.vaccines.find((v) => v.vkey === 'hepb')!;
    expect(hepb.doses[0].status).toBe('pending'); // 记录为空 → 未打
    expect(book.overview.todo_doses).toBeGreaterThan(0);
    expect(book.overview.overdue_doses).toBe(0);
    expect(book.baby_months).toBe(0);
  });

  it('6.5 月龄已打乙肝 1/2 剂：第 3 剂 pending 且进入 next', () => {
    const records = [
      { id: 'r1', vaccine_schedule_key: 'hepb', vaccine_name: '乙肝疫苗', vaccine_dose_seq: 1, visit_date: '2026-01-03' },
      { id: 'r2', vaccine_schedule_key: 'hepb', vaccine_name: '乙肝疫苗', vaccine_dose_seq: 2, visit_date: '2026-02-05' },
    ];
    const book = computeVaccineBook({ ...base, schedule: schedule.filter((s) => s.vkey === 'hepb'), records, ref_date: '2026-07-20' }); // ~6.6 月
    const hepb = book.vaccines.find((v) => v.vkey === 'hepb')!;
    expect(hepb.doses[0].status).toBe('done');
    expect(hepb.doses[0].date).toBe('2026-01-03');
    expect(hepb.doses[2].status).toBe('pending');
    expect(book.overview.done_doses).toBe(2);
    expect(book.next[0]).toMatchObject({ vkey: 'hepb', dose_seq: 3, reason: 'window' });
  });

  it('麻腮风第 1 剂：8 月龄窗口内 pending；超 12 月龄窗口则 overdue 且进 next', () => {
    const records = [
      { id: 'r1', vaccine_schedule_key: 'hepb', vaccine_name: '乙肝疫苗', vaccine_dose_seq: 1, visit_date: '2026-01-03' },
      { id: 'r2', vaccine_schedule_key: 'hepb', vaccine_name: '乙肝疫苗', vaccine_dose_seq: 2, visit_date: '2026-02-05' },
      { id: 'r3', vaccine_schedule_key: 'hepb', vaccine_name: '乙肝疫苗', vaccine_dose_seq: 3, visit_date: '2026-07-20' },
    ];
    const only = { ...base, schedule: schedule.filter((s) => s.vkey === 'hepb' || s.vkey === 'mmr'), records };
    const book = computeVaccineBook({ ...only, ref_date: '2026-09-10' }); // 8.3 月，min8<8.3<max12
    const mmr = book.vaccines.find((v) => v.vkey === 'mmr')!;
    expect(mmr.doses[0].status).toBe('pending');
    const book2 = computeVaccineBook({ ...only, ref_date: '2027-01-10' }); // 12.3 月 > max12 → overdue
    const mmr2 = book2.vaccines.find((v) => v.vkey === 'mmr')!;
    expect(mmr2.doses[0].status).toBe('overdue');
    expect(book2.next[0]).toMatchObject({ vkey: 'mmr', dose_seq: 1, reason: 'overdue' });
    expect(book2.overview.overdue_doses).toBe(1);
  });

  it('跟踪关闭 hidden 不计入待接种概览', () => {
    const book = computeVaccineBook({
      ...base,
      settings: [{ vaccine_key: 'rv', track_flag: 0, replaced_flag: 0 }],
      ref_date: '2026-07-20', // rv 窗口内 6.6 月
    });
    const rv = book.vaccines.find((v) => v.vkey === 'rv')!;
    expect(rv.doses[0].status).toBe('hidden');
    expect(rv.track_flag).toBe(false);
    const todoKeys = book.next.map((n) => n.vkey);
    expect(todoKeys).not.toContain('rv');
  });

  it('联合疫苗替代标记 replaced：不算逾期、不进 next', () => {
    const book = computeVaccineBook({
      ...base,
      settings: [{ vaccine_key: 'hepb', track_flag: 1, replaced_flag: 0 }], // hepb 无关
      schedule: schedule.filter((s) => s.vkey !== 'hepb'), // 只测其它
      records: [],
      birth_date: '2025-06-01',
      ref_date: '2026-09-07', // 15 月龄，bcg 已超 3 月上限
    });
    const bookReplaced = computeVaccineBook({
      ...base,
      schedule: schedule.filter((s) => s.vkey !== 'hepb'),
      settings: [{ vaccine_key: 'bcg', track_flag: 1, replaced_flag: 1 }],
      records: [],
      birth_date: '2025-06-01',
      ref_date: '2026-09-07',
    });
    const bcg = bookReplaced.vaccines.find((v) => v.vkey === 'bcg')!;
    expect(bcg.doses[0].status).toBe('replaced');
    expect(bcg.replaced_flag).toBe(true);
    // 对照（未标记）：应为 overdue 且进 next
    const bcgPlain = book.vaccines.find((v) => v.vkey === 'bcg')!;
    expect(bcgPlain.doses[0].status).toBe('overdue');
  });

  it('自定义疫苗（无 key）聚合进 custom_vaccines，不计进度', () => {
    const records = [
      { id: 'c1', vaccine_schedule_key: null, vaccine_name: '流感疫苗(自定义)', vaccine_dose_seq: 1, visit_date: '2026-09-01' },
    ];
    const book = computeVaccineBook({ ...base, records, ref_date: '2026-09-07' });
    expect(book.custom_vaccines).toHaveLength(1);
    expect(book.custom_vaccines[0]).toMatchObject({ name: '流感疫苗(自定义)', shot_count: 1 });
    expect(book.overview.done_doses).toBe(0);
  });

  it('老数据无 key 但 name 快照与参考库一致：name 兜底命中为 done', () => {
    const records = [
      { id: 'r9', vaccine_schedule_key: null, vaccine_name: '乙肝疫苗', vaccine_dose_seq: 2, visit_date: '2026-02-05' },
    ];
    const book = computeVaccineBook({ ...base, records, ref_date: '2026-07-20' });
    const hepb = book.vaccines.find((v) => v.vkey === 'hepb')!;
    expect(hepb.doses[1].status).toBe('done');
    expect(hepb.doses[1].date).toBe('2026-02-05');
  });
});
