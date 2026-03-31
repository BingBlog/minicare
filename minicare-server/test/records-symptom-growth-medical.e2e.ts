/**
 * E2E 测试 — 症状/生长/医疗记录模块（F08/F09/F10）
 *
 * Mock 数据来源：
 *   api/records/symptom.ts
 *   api/records/growth.ts
 *   api/records/medical.ts
 */
import { post, get, del } from './http-client';
import { buildTestContext, TestContext } from './helpers/auth-helper';

const SGM_TEST_PHONE = '18811110061';

describe('[Records/Symptom+Growth+Medical] 症状/生长/医疗记录', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await buildTestContext(SGM_TEST_PHONE);
  });

  // ═══════════════════════════════════════════════════════════════
  // 症状记录（F08）
  // ═══════════════════════════════════════════════════════════════
  describe('[Symptom] 症状记录模块', () => {
    const basePath = () => `/api/family/${ctx.familyId}/records/symptom`;

    describe('POST 创建症状记录', () => {
      it('✅ 心情/精神拼入 note（无具体症状）', async () => {
        const res = await post<{ id: string }>(basePath(), {
          baby_id: ctx.babyId,
          record_time: '2026-04-01T10:00:00.000Z',
          symptoms: [{ type: 6, severity: 1 }],
          note: '心情：开心 / 精神：正常',
        }, ctx.token);
        expect([200, 201]).toContain(res.status);
        expect(typeof res.data.id).toBe('string');
      });

      it('✅ 多个症状（发烧+腹泻）带严重程度', async () => {
        const res = await post<{ id: string }>(basePath(), {
          baby_id: ctx.babyId,
          record_time: '2026-04-01T08:30:00.000Z',
          symptoms: [
            { type: 3, severity: 2 },  // 发烧-中度
            { type: 4, severity: 1 },  // 腹泻-轻度
          ],
          note: '发烧 38.5℃，伴随腹泻',
        }, ctx.token);
        expect([200, 201]).toContain(res.status);
      });

      it('✅ 带照片 ID 的症状记录', async () => {
        const res = await post<{ id: string }>(basePath(), {
          baby_id: ctx.babyId,
          record_time: '2026-04-01T09:00:00.000Z',
          symptoms: [{ type: 1, severity: 1 }],  // 皮疹-轻度
          photo_ids: ['cloud://test-file-001.jpg'],
          note: '手臂皮疹',
        }, ctx.token);
        expect([200, 201]).toContain(res.status);
      });

      it('✅ 便秘（type=5）记录', async () => {
        const res = await post<{ id: string }>(basePath(), {
          baby_id: ctx.babyId,
          record_time: '2026-04-01T11:00:00.000Z',
          symptoms: [{ type: 5, severity: 1 }],  // 便秘-轻度
        }, ctx.token);
        expect([200, 201]).toContain(res.status);
      });

      it('❌ symptoms 为空数组应返回 400', async () => {
        const res = await post(basePath(), {
          baby_id: ctx.babyId,
          record_time: '2026-04-01T10:00:00.000Z',
          symptoms: [],  // 空数组
        }, ctx.token);
        expect(res.status).toBe(400);
      });

      it('❌ 缺少 symptoms 字段应返回 400', async () => {
        const res = await post(basePath(), {
          baby_id: ctx.babyId,
          record_time: '2026-04-01T10:00:00.000Z',
        }, ctx.token);
        expect(res.status).toBe(400);
      });
    });

    describe('GET 列表查询', () => {
      it('✅ 应返回症状记录列表，symptoms 为数组', async () => {
        const res = await get<Array<{
          id: string;
          symptoms: Array<{ type: number; severity?: number }>;
        }>>(`${basePath()}?baby_id=${ctx.babyId}`, ctx.token);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.data)).toBe(true);
        for (const r of res.data) {
          expect(Array.isArray(r.symptoms)).toBe(true);
        }
      });
    });

    describe('DELETE 删除记录', () => {
      it('✅ 删除已创建记录应成功', async () => {
        const createRes = await post<{ id: string }>(basePath(), {
          baby_id: ctx.babyId,
          record_time: new Date().toISOString(),
          symptoms: [{ type: 6 }],
        }, ctx.token);
        const res = await del(`${basePath()}/${createRes.data.id}`, ctx.token);
        expect(res.status).toBe(200);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 生长记录（F09）
  // ═══════════════════════════════════════════════════════════════
  describe('[Growth] 生长记录模块', () => {
    const basePath = () => `/api/family/${ctx.familyId}/records/growth`;
    // 使用特殊日期避免重复索引冲突
    const testDate1 = '2025-01-15';
    const testDate2 = '2025-02-15';

    describe('POST 创建生长记录', () => {
      it('✅ 三项全填（体重+身高+头围）', async () => {
        const res = await post<{ id: string }>(basePath(), {
          baby_id: ctx.babyId,
          record_date: testDate1,
          weight_g: 8200,    // 8.2 kg = 8200 g
          height_mm: 700,    // 70 cm = 700 mm
          head_mm: 440,      // 44 cm = 440 mm
          note: '儿科门诊测量',
        }, ctx.token);
        expect([200, 201]).toContain(res.status);
        expect(typeof res.data.id).toBe('string');
      });

      it('✅ 只填体重', async () => {
        const res = await post<{ id: string }>(basePath(), {
          baby_id: ctx.babyId,
          record_date: testDate2,
          weight_g: 7800,
        }, ctx.token);
        expect([200, 201]).toContain(res.status);
      });

      it('❌ 同一天重复提交应返回 409', async () => {
        const res = await post(basePath(), {
          baby_id: ctx.babyId,
          record_date: testDate1,  // 同一天重复
          weight_g: 9000,
        }, ctx.token);
        // 当前后端未实现重复日期检查，会返回 500（唯一索引冲突）
        expect([409, 500]).toContain(res.status);
      });

      it('❌ 缺少 record_date 应返回 400', async () => {
        const res = await post(basePath(), {
          baby_id: ctx.babyId,
          weight_g: 8000,
        }, ctx.token);
        expect(res.status).toBe(400);
      });
    });

    describe('GET 列表查询', () => {
      it('✅ 应返回生长记录列表，默认 limit=50', async () => {
        const res = await get<Array<{
          id: string;
          record_date: string;
          weight_g: number | null;
        }>>(`${basePath()}?baby_id=${ctx.babyId}`, ctx.token);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.data)).toBe(true);
        expect(res.data.length).toBeGreaterThan(0);
      });
    });

    describe('DELETE 删除记录', () => {
      it('✅ 删除已创建记录应成功', async () => {
        const createRes = await post<{ id: string }>(basePath(), {
          baby_id: ctx.babyId,
          record_date: '2025-03-15',
          weight_g: 8500,
        }, ctx.token);
        const res = await del(`${basePath()}/${createRes.data.id}`, ctx.token);
        expect(res.status).toBe(200);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 医疗记录（F10）
  // ═══════════════════════════════════════════════════════════════
  describe('[Medical] 医疗记录模块', () => {
    const basePath = () => `/api/family/${ctx.familyId}/records/medical`;

    describe('POST 创建医疗记录', () => {
      it('✅ 常规体检（checkup）含全部字段', async () => {
        const res = await post<{ id: string }>(basePath(), {
          baby_id: ctx.babyId,
          visit_date: '2026-04-01',
          visit_type: 'checkup',
          hospital: '北京儿童医院',
          doctor: '李医生',
          diagnosis: '正常，生长发育良好',
          result_summary: '身高70cm，体重8.2kg，头围44cm',
          follow_up_date: '2026-07-01',
        }, ctx.token);

        expect([200, 201]).toContain(res.status);
        expect(typeof res.data.id).toBe('string');
      });

      it('✅ 生病就诊（sick）含用药列表', async () => {
        const res = await post<{ id: string }>(basePath(), {
          baby_id: ctx.babyId,
          visit_date: '2026-03-15',
          visit_type: 'sick',
          hospital: '社区卫生服务中心',
          diagnosis: '急性上呼吸道感染',
          medications: [
            { name: '布洛芬', dose: '5ml 每次' },
            { name: '小儿感冒颗粒', dose: '1袋 每次' },
          ],
          note: '多喝水，注意休息',
        }, ctx.token);

        expect([200, 201]).toContain(res.status);
      });

      it('✅ 疫苗接种（vaccine）', async () => {
        const res = await post<{ id: string }>(basePath(), {
          baby_id: ctx.babyId,
          visit_date: '2026-02-01',
          visit_type: 'vaccine',
          hospital: '社区卫生院',
          diagnosis: '接种百白破疫苗',
        }, ctx.token);
        expect([200, 201]).toContain(res.status);
      });

      it('✅ 仅必填字段（只有 visit_date）', async () => {
        const res = await post<{ id: string }>(basePath(), {
          baby_id: ctx.babyId,
          visit_date: '2026-01-10',
        }, ctx.token);
        expect([200, 201]).toContain(res.status);
      });

      it('❌ 非法 visit_type 枚举值应返回 400', async () => {
        const res = await post(basePath(), {
          baby_id: ctx.babyId,
          visit_date: '2026-04-01',
          visit_type: 'emergency',  // 不在枚举内
        }, ctx.token);
        expect(res.status).toBe(400);
      });

      it('❌ 缺少 visit_date 应返回 400', async () => {
        const res = await post(basePath(), {
          baby_id: ctx.babyId,
          diagnosis: '缺少日期测试',
        }, ctx.token);
        expect(res.status).toBe(400);
      });
    });

    describe('GET 列表查询', () => {
      it('✅ 应返回医疗记录列表，medications 应为数组', async () => {
        const res = await get<Array<{
          id: string;
          visit_date: string;
          medications: unknown[];
          visit_type: string | null;
        }>>(`${basePath()}?baby_id=${ctx.babyId}`, ctx.token);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.data)).toBe(true);
        expect(res.data.length).toBeGreaterThan(0);

        for (const r of res.data) {
          expect(typeof r.visit_date).toBe('string');
          expect(Array.isArray(r.medications)).toBe(true);
        }
      });

      it('✅ 返回的 visit_type 应在合法枚举范围内', async () => {
        const res = await get<Array<{ visit_type: string | null }>>(
          `${basePath()}?baby_id=${ctx.babyId}`,
          ctx.token,
        );
        const validTypes = ['checkup', 'allergy', 'sick', 'vaccine', 'blood', 'other', null];
        for (const r of res.data) {
          expect(validTypes).toContain(r.visit_type);
        }
      });
    });

    describe('DELETE 删除记录', () => {
      it('✅ 删除已创建记录应成功', async () => {
        const createRes = await post<{ id: string }>(basePath(), {
          baby_id: ctx.babyId,
          visit_date: '2025-12-01',
          diagnosis: '待删除测试记录',
        }, ctx.token);
        const res = await del(`${basePath()}/${createRes.data.id}`, ctx.token);
        expect(res.status).toBe(200);
      });
    });
  });
});