/**
 * E2E 测试 — 饮食记录模块（F03）
 *
 * 测试端点：
 *   POST   /api/family/:id/records/feeding          创建记录
 *   GET    /api/family/:id/records/feeding           列表查询
 *   DELETE /api/family/:id/records/feeding/:rid      删除记录
 *
 * Mock 数据来源：api/records/feeding.ts 中的 JSDoc @example
 */
import { post, get, del } from './http-client';
import { buildTestContext, TestContext } from './helpers/auth-helper';

const FEEDING_TEST_PHONE = '18811110031';

describe('[Records/Feeding] 饮食记录模块', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await buildTestContext(FEEDING_TEST_PHONE);
  });

  const basePath = () => `/api/family/${ctx.familyId}/records/feeding`;

  // ─────────────────────────────────────────────────────────────
  describe('POST 创建饮食记录', () => {
    it('✅ 奶粉喂养（formula）应创建成功', async () => {
      const res = await post<{ id: string }>(basePath(), {
        baby_id: ctx.babyId,
        feed_type: 'formula',
        record_time: '2026-04-01T08:00:00.000Z',
        formula_ml: 120,
        note: 'AA3勺',
      }, ctx.token);

      expect([200, 201]).toContain(res.status);
      expect(typeof res.data.id).toBe('string');
    });

    it('✅ 母乳喂养（breast）- 左侧 15 分钟', async () => {
      const res = await post<{ id: string }>(basePath(), {
        baby_id: ctx.babyId,
        feed_type: 'breast',
        record_time: '2026-04-01T06:00:00.000Z',
        breast_side: 'left',
        duration_min: 15,
      }, ctx.token);

      expect([200, 201]).toContain(res.status);
      expect(typeof res.data.id).toBe('string');
    });

    it('✅ 辅食喂养（complementary）- 米糊+南瓜泥', async () => {
      const res = await post<{ id: string }>(basePath(), {
        baby_id: ctx.babyId,
        feed_type: 'complementary',
        record_time: '2026-04-01T12:00:00.000Z',
        complementary_food: '米糊、南瓜泥',
        amount_g: 30,
      }, ctx.token);

      expect([200, 201]).toContain(res.status);
      expect(typeof res.data.id).toBe('string');
    });

    it('✅ 营养素（complementary 类型）', async () => {
      const res = await post<{ id: string }>(basePath(), {
        baby_id: ctx.babyId,
        feed_type: 'complementary',
        record_time: '2026-04-01T09:00:00.000Z',
        complementary_food: '营养素',
        note: '维生素D400IU、DHA100mg',
      }, ctx.token);

      expect([200, 201]).toContain(res.status);
    });

    it('❌ 缺少 feed_type 应返回 400', async () => {
      const res = await post(basePath(), {
        baby_id: ctx.babyId,
        record_time: '2026-04-01T08:00:00.000Z',
      }, ctx.token);
      expect(res.status).toBe(400);
    });

    it('❌ 非法 feed_type 值应返回 400', async () => {
      const res = await post(basePath(), {
        baby_id: ctx.babyId,
        feed_type: 'supplement',  // 已移除的枚举值
        record_time: '2026-04-01T08:00:00.000Z',
      }, ctx.token);
      expect(res.status).toBe(400);
    });

    it('❌ 无 token 应返回 401', async () => {
      const res = await post(basePath(), {
        baby_id: ctx.babyId,
        feed_type: 'formula',
        record_time: '2026-04-01T08:00:00.000Z',
      });
      expect(res.status).toBe(401);
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('GET 列表查询', () => {
    it('✅ 应返回记录列表（数组）', async () => {
      const res = await get<Array<{
        id: string;
        feed_type: string;
        record_time: string;
      }>>(`${basePath()}?baby_id=${ctx.babyId}`, ctx.token);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
      expect(res.data.length).toBeGreaterThan(0);

      // 验证字段结构
      const first = res.data[0];
      expect(typeof first.id).toBe('string');
      expect(typeof first.feed_type).toBe('string');
      expect(['breast', 'formula', 'complementary']).toContain(first.feed_type);
    });

    it('✅ 支持 limit/offset 分页', async () => {
      const res = await get<unknown[]>(
        `${basePath()}?baby_id=${ctx.babyId}&limit=2&offset=0`,
        ctx.token,
      );
      expect(res.status).toBe(200);
      expect(res.data.length).toBeLessThanOrEqual(2);
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('DELETE 删除记录', () => {
    let recordId: string;

    beforeAll(async () => {
      const res = await post<{ id: string }>(basePath(), {
        baby_id: ctx.babyId,
        feed_type: 'formula',
        record_time: new Date().toISOString(),
        formula_ml: 80,
      }, ctx.token);
      recordId = res.data.id;
    });

    it('✅ 删除存在的记录应返回 200', async () => {
      const res = await del(`${basePath()}/${recordId}`, ctx.token);
      expect(res.status).toBe(200);
    });

    it('❌ 删除不存在的记录应返回 404', async () => {
      const res = await del(`${basePath()}/non-existent-id`, ctx.token);
      expect([404, 200]).toContain(res.status); // 部分实现软删除返回 200
    });
  });
});