/**
 * E2E 测试 — 尿布/活动/健康记录模块（F05/F06/F07）
 *
 * Mock 数据来源：
 *   api/records/diaper.ts
 *   api/records/activity.ts
 *   api/records/health.ts
 */
import { post, get, del } from './http-client';
import { buildTestContext, TestContext } from './helpers/auth-helper';

const DAH_TEST_PHONE = '18811110051';

describe('[Records/Diaper+Activity+Health] 尿布/活动/健康记录', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await buildTestContext(DAH_TEST_PHONE);
  });

  // ═══════════════════════════════════════════════════════════════
  // 尿布记录（F06）
  // ═══════════════════════════════════════════════════════════════
  describe('[Diaper] 尿布记录模块', () => {
    const basePath = () => `/api/family/${ctx.familyId}/records/diaper`;

    describe('POST 创建尿布记录', () => {
      it('✅ 大便（dirty）带颜色', async () => {
        const res = await post<{ id: string }>(basePath(), {
          baby_id: ctx.babyId,
          diaper_type: 'dirty',
          record_time: '2026-04-01T09:30:00.000Z',
          color: 'yellow',
          note: 'Bristol 4型',
        }, ctx.token);
        expect([200, 201]).toContain(res.status);
        expect(typeof res.data.id).toBe('string');
      });

      it('✅ 湿尿布（wet）无颜色', async () => {
        const res = await post<{ id: string }>(basePath(), {
          baby_id: ctx.babyId,
          diaper_type: 'wet',
          record_time: '2026-04-01T07:00:00.000Z',
        }, ctx.token);
        expect([200, 201]).toContain(res.status);
      });

      it('✅ 混合（mixed）', async () => {
        const res = await post<{ id: string }>(basePath(), {
          baby_id: ctx.babyId,
          diaper_type: 'mixed',
          record_time: '2026-04-01T14:00:00.000Z',
          color: 'brown',
        }, ctx.token);
        expect([200, 201]).toContain(res.status);
      });

      it('✅ 干净（dry）', async () => {
        const res = await post<{ id: string }>(basePath(), {
          baby_id: ctx.babyId,
          diaper_type: 'dry',
          record_time: '2026-04-01T16:00:00.000Z',
        }, ctx.token);
        expect([200, 201]).toContain(res.status);
      });

      it('❌ 非法 diaper_type 应返回 400', async () => {
        const res = await post(basePath(), {
          baby_id: ctx.babyId,
          diaper_type: 'invalid_type',
          record_time: '2026-04-01T08:00:00.000Z',
        }, ctx.token);
        expect(res.status).toBe(400);
      });
    });

    describe('GET 列表查询', () => {
      it('✅ 应返回尿布记录列表', async () => {
        const res = await get<Array<{ id: string; diaper_type: string }>>(
          `${basePath()}?baby_id=${ctx.babyId}`,
          ctx.token,
        );
        expect(res.status).toBe(200);
        expect(Array.isArray(res.data)).toBe(true);
        expect(res.data.length).toBeGreaterThan(0);
        for (const r of res.data) {
          expect(['wet', 'dirty', 'mixed', 'dry']).toContain(r.diaper_type);
        }
      });
    });

    describe('DELETE 删除记录', () => {
      it('✅ 删除已创建记录应成功', async () => {
        const createRes = await post<{ id: string }>(basePath(), {
          baby_id: ctx.babyId,
          diaper_type: 'wet',
          record_time: new Date().toISOString(),
        }, ctx.token);
        const res = await del(`${basePath()}/${createRes.data.id}`, ctx.token);
        expect(res.status).toBe(200);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 活动记录（F05）
  // ═══════════════════════════════════════════════════════════════
  describe('[Activity] 活动记录模块', () => {
    const basePath = () => `/api/family/${ctx.familyId}/records/activity`;

    describe('POST 创建活动记录', () => {
      it('✅ 洗澡（bath）20 分钟', async () => {
        const res = await post<{ id: string }>(basePath(), {
          baby_id: ctx.babyId,
          activity_type: 'bath',
          record_time: '2026-04-01T19:00:00.000Z',
          duration_min: 20,
        }, ctx.token);
        expect([200, 201]).toContain(res.status);
        expect(typeof res.data.id).toBe('string');
      });

      it('✅ 俯趴（tummy_time）10 分钟', async () => {
        const res = await post<{ id: string }>(basePath(), {
          baby_id: ctx.babyId,
          activity_type: 'tummy_time',
          record_time: '2026-04-01T10:00:00.000Z',
          duration_min: 10,
          note: '用了辅助枕',
        }, ctx.token);
        expect([200, 201]).toContain(res.status);
      });

      it('✅ 户外（outdoor）', async () => {
        const res = await post<{ id: string }>(basePath(), {
          baby_id: ctx.babyId,
          activity_type: 'outdoor',
          record_time: '2026-04-01T15:00:00.000Z',
          duration_min: 45,
        }, ctx.token);
        expect([200, 201]).toContain(res.status);
      });

      it('✅ 玩耍（play）不填时长', async () => {
        const res = await post<{ id: string }>(basePath(), {
          baby_id: ctx.babyId,
          activity_type: 'play',
          record_time: '2026-04-01T16:00:00.000Z',
        }, ctx.token);
        expect([200, 201]).toContain(res.status);
      });

      it('❌ 非法 activity_type 应返回 400', async () => {
        const res = await post(basePath(), {
          baby_id: ctx.babyId,
          activity_type: 'swimming',  // 不在枚举内
          record_time: '2026-04-01T08:00:00.000Z',
        }, ctx.token);
        expect(res.status).toBe(400);
      });
    });

    describe('GET 列表查询', () => {
      it('✅ 应返回活动记录列表并验证 activity_type 合法', async () => {
        const res = await get<Array<{ id: string; activity_type: string }>>(
          `${basePath()}?baby_id=${ctx.babyId}`,
          ctx.token,
        );
        expect(res.status).toBe(200);
        expect(Array.isArray(res.data)).toBe(true);
        const validTypes = ['bath', 'outdoor', 'play', 'tummy_time', 'other'];
        for (const r of res.data) {
          expect(validTypes).toContain(r.activity_type);
        }
      });
    });

    describe('DELETE 删除记录', () => {
      it('✅ 删除已创建记录应成功', async () => {
        const createRes = await post<{ id: string }>(basePath(), {
          baby_id: ctx.babyId,
          activity_type: 'other',
          record_time: new Date().toISOString(),
        }, ctx.token);
        const res = await del(`${basePath()}/${createRes.data.id}`, ctx.token);
        expect(res.status).toBe(200);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 健康记录（F07）
  // ═══════════════════════════════════════════════════════════════
  describe('[Health] 健康记录模块', () => {
    const basePath = () => `/api/family/${ctx.familyId}/records/health`;

    describe('POST 创建健康记录', () => {
      it('✅ 带体温和情绪（发烧+烦躁）', async () => {
        const res = await post<{ id: string }>(basePath(), {
          baby_id: ctx.babyId,
          record_time: '2026-04-01T08:00:00.000Z',
          temperature: 38.2,
          mood: 'fussy',
          note: '过敏表现：皮疹 / 严重程度：轻度 / 用药：维生素D（400IU）',
        }, ctx.token);
        expect([200, 201]).toContain(res.status);
        expect(typeof res.data.id).toBe('string');
      });

      it('✅ 仅体温，不填情绪', async () => {
        const res = await post<{ id: string }>(basePath(), {
          baby_id: ctx.babyId,
          record_time: '2026-04-01T20:00:00.000Z',
          temperature: 36.8,
        }, ctx.token);
        expect([200, 201]).toContain(res.status);
      });

      it('✅ 仅情绪（无体温）', async () => {
        const res = await post<{ id: string }>(basePath(), {
          baby_id: ctx.babyId,
          record_time: '2026-04-01T12:00:00.000Z',
          mood: 'happy',
        }, ctx.token);
        expect([200, 201]).toContain(res.status);
      });

      it('✅ 哭闹情绪（crying）', async () => {
        const res = await post<{ id: string }>(basePath(), {
          baby_id: ctx.babyId,
          record_time: '2026-04-01T22:00:00.000Z',
          mood: 'crying',
          note: '出牙期哭闹',
        }, ctx.token);
        expect([200, 201]).toContain(res.status);
      });

      it('❌ 非法 mood 枚举值应返回 400', async () => {
        const res = await post(basePath(), {
          baby_id: ctx.babyId,
          record_time: '2026-04-01T10:00:00.000Z',
          mood: 'angry',  // 不在枚举内
        }, ctx.token);
        expect(res.status).toBe(400);
      });
    });

    describe('GET 列表查询', () => {
      it('✅ 应返回健康记录列表并验证字段结构', async () => {
        const res = await get<Array<{
          id: string;
          temperature: number | null;
          mood: string | null;
        }>>(`${basePath()}?baby_id=${ctx.babyId}`, ctx.token);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.data)).toBe(true);
        const validMoods = ['happy', 'neutral', 'fussy', 'crying', null];
        for (const r of res.data) {
          expect(validMoods).toContain(r.mood);
        }
      });
    });

    describe('DELETE 删除记录', () => {
      it('✅ 删除已创建记录应成功', async () => {
        const createRes = await post<{ id: string }>(basePath(), {
          baby_id: ctx.babyId,
          record_time: new Date().toISOString(),
          temperature: 37.0,
        }, ctx.token);
        const res = await del(`${basePath()}/${createRes.data.id}`, ctx.token);
        expect(res.status).toBe(200);
      });
    });
  });
});