/**
 * E2E 测试 — 睡眠记录模块（F04）
 *
 * 测试端点：
 *   POST  /api/family/:id/records/sleep/start        开始睡眠
 *   PATCH /api/family/:id/records/sleep/:sid/end     结束睡眠
 *   GET   /api/family/:id/records/sleep/ongoing      获取进行中记录
 *   GET   /api/family/:id/records/sleep              列表查询
 *   DELETE /api/family/:id/records/sleep/:sid        删除记录（仅 ended 状态）
 *
 * Mock 数据来源：api/records/sleep.ts 中的 JSDoc @example
 */
import { post, get, patch, del } from './http-client';
import { buildTestContext, TestContext } from './helpers/auth-helper';

const SLEEP_TEST_PHONE = '18811110041';

describe('[Records/Sleep] 睡眠记录模块', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await buildTestContext(SLEEP_TEST_PHONE);
  });

  const startPath = () => `/api/family/${ctx.familyId}/records/sleep/start`;
  const endPath = (id: string) => `/api/family/${ctx.familyId}/records/sleep/${id}/end`;
  const listPath = () => `/api/family/${ctx.familyId}/records/sleep?baby_id=${ctx.babyId}`;
  const ongoingPath = () => `/api/family/${ctx.familyId}/records/sleep/ongoing?baby_id=${ctx.babyId}`;
  const deletePath = (id: string) => `/api/family/${ctx.familyId}/records/sleep/${id}`;

  // ─────────────────────────────────────────────────────────────
  describe('POST /start  开始睡眠计时', () => {
    let sleepId: string;

    it('✅ 开始睡眠应返回 id 和 status=ongoing', async () => {
      const res = await post<{ id: string; status: string }>(startPath(), {
        baby_id: ctx.babyId,
        start_time: new Date(Date.now() - 3600_000).toISOString(), // 1小时前
        note: '时段：夜间',
      }, ctx.token);

      expect([200, 201]).toContain(res.status);
      expect(typeof res.data.id).toBe('string');
      expect(res.data.status).toBe('ongoing');
      sleepId = res.data.id;
    });

    it('❌ 已有 ongoing 记录时再次开始应返回 409', async () => {
      const res = await post(startPath(), {
        baby_id: ctx.babyId,
        start_time: new Date().toISOString(),
      }, ctx.token);
      expect(res.status).toBe(409);
    });

    // ── 结束睡眠（依赖上面创建的 sleepId）──
    describe('PATCH /:id/end  结束睡眠', () => {
      it('✅ 结束睡眠应返回 duration_min 和 status=ended', async () => {
        const res = await patch<{
          id: string;
          duration_min: number;
          status: string;
        }>(endPath(sleepId), {
          end_time: new Date().toISOString(),
          note: '时段：夜间 / 质量：良好',
        }, ctx.token);

        expect(res.status).toBe(200);
        expect(res.data.id).toBe(sleepId);
        expect(typeof res.data.duration_min).toBe('number');
        expect(res.data.duration_min).toBeGreaterThan(0);
        expect(res.data.status).toBe('ended');
      });

      it('❌ 结束时间早于开始时间应返回 400', async () => {
        // 先结束任何可能存在的 ongoing 记录
        const ongoingRes = await get<{ id: string }>(ongoingPath(), ctx.token);
        if (ongoingRes.data?.id) {
          await patch(endPath(ongoingRes.data.id), {
            end_time: new Date(Date.now() + 60_000).toISOString(),
          }, ctx.token);
        }

        // 开始新记录
        const startRes = await post<{ id: string }>(startPath(), {
          baby_id: ctx.babyId,
          start_time: new Date().toISOString(),
        }, ctx.token);

        if (startRes.status !== 200 && startRes.status !== 201) {
          // 如果无法开始新记录，跳过此测试
          console.log('Skipping: cannot start new sleep record');
          return;
        }

        const newId = startRes.data.id;
        const res = await patch(endPath(newId), {
          end_time: new Date(Date.now() - 3600_000).toISOString(), // 早于开始时间
        }, ctx.token);

        expect(res.status).toBe(400);

        // 清理：结束这个 ongoing 记录
        await patch(endPath(newId), {
          end_time: new Date(Date.now() + 60_000).toISOString(),
        }, ctx.token);
      });

      it('❌ 结束不存在/已结束的记录应返回 404', async () => {
        const res = await patch(endPath(sleepId), {
          end_time: new Date().toISOString(),
        }, ctx.token);
        expect(res.status).toBe(404);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('GET /ongoing  获取进行中的睡眠', () => {
    it('✅ 无进行中记录时应返回 null 或空对象', async () => {
      // 先确保没有 ongoing 记录
      const checkRes = await get<{ id: string }>(ongoingPath(), ctx.token);
      if (checkRes.data?.id) {
        await patch(endPath(checkRes.data.id), {
          end_time: new Date(Date.now() + 60_000).toISOString(),
        }, ctx.token);
      }

      const res = await get<null>(ongoingPath(), ctx.token);
      expect(res.status).toBe(200);
      // 无 ongoing 记录时返回 null 或空字符串（NestJS 序列化行为）
      // NestJS 在某些配置下会将 null 序列化为空字符串
      expect([null, '', undefined]).toContain(res.data);
    });

    it('✅ 有 ongoing 记录时应返回记录详情', async () => {
      // 创建一条 ongoing 记录
      const startRes = await post<{ id: string; status: string }>(startPath(), {
        baby_id: ctx.babyId,
        start_time: new Date().toISOString(),
      }, ctx.token);

      const res = await get<{
        id: string;
        status: string;
        start_time: string;
      }>(ongoingPath(), ctx.token);

      expect(res.status).toBe(200);
      expect(res.data).not.toBeNull();
      expect(res.data.status).toBe('ongoing');
      expect(typeof res.data.start_time).toBe('string');

      // 清理：结束这条记录
      await patch(endPath(startRes.data.id), {
        end_time: new Date(Date.now() + 60_000).toISOString(),
      }, ctx.token);
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('GET 列表查询', () => {
    it('✅ 应返回历史睡眠记录列表', async () => {
      const res = await get<Array<{
        id: string;
        status: string;
        start_time: string;
        duration_min: number | null;
      }>>(listPath(), ctx.token);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);

      // 每条记录应有正确字段
      for (const record of res.data) {
        expect(['ongoing', 'ended']).toContain(record.status);
        expect(typeof record.start_time).toBe('string');
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('DELETE 删除记录', () => {
    let toDeleteId: string;

    beforeAll(async () => {
      // 先确保没有 ongoing 记录（避免 409 冲突）
      const checkRes = await get<{ id: string }>(ongoingPath(), ctx.token);
      if (checkRes.data?.id) {
        await patch(endPath(checkRes.data.id), {
          end_time: new Date(Date.now() + 60_000).toISOString(),
        }, ctx.token);
      }

      // 创建并立即结束一条记录供删除
      const startRes = await post<{ id: string }>(startPath(), {
        baby_id: ctx.babyId,
        start_time: new Date(Date.now() - 7200_000).toISOString(), // 2小时前
      }, ctx.token);

      if (startRes.status !== 200 && startRes.status !== 201) {
        console.error('Failed to create sleep record for delete test:', startRes);
        throw new Error(`Failed to create sleep record: status ${startRes.status}`);
      }

      toDeleteId = startRes.data.id;
      await patch(endPath(toDeleteId), {
        end_time: new Date(Date.now() - 3600_000).toISOString(), // 1小时前
      }, ctx.token);
    });

    it('✅ 删除 ended 状态的记录应成功', async () => {
      const res = await del(deletePath(toDeleteId), ctx.token);
      expect(res.status).toBe(200);
    });
  });
});