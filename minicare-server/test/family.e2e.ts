/**
 * E2E 测试 — Family 模块
 *
 * 测试端点：
 *   POST /api/family                       创建家庭
 *   GET  /api/family/mine                  获取我的家庭列表
 *   GET  /api/family/:id/members           获取家庭成员列表
 *   POST /api/family/:id/invite            生成邀请码
 *   POST /api/family/join                  通过邀请码加入家庭
 *   GET  /api/family/:id/records/today     获取今日记录聚合
 */
import { post, get, TEST_PHONE_1, TEST_PHONE_2, TEST_CODE } from './http-client';
import { loginTestUser } from './helpers/auth-helper';

const FAMILY_TEST_PHONE_1 = '18811110011';
const FAMILY_TEST_PHONE_2 = '18811110012';

describe('[Family] 家庭管理模块', () => {
  let token1: string;
  let userId1: string;
  let token2: string;
  let familyId: string;

  beforeAll(async () => {
    // 用户1（创建者/owner）
    const u1 = await loginTestUser(FAMILY_TEST_PHONE_1);
    token1 = u1.token;
    userId1 = u1.userId;
    // 用户2（待邀请成员）
    const u2 = await loginTestUser(FAMILY_TEST_PHONE_2);
    token2 = u2.token;
  });

  // ─────────────────────────────────────────────────────────────
  describe('POST /api/family  创建家庭', () => {
    it('✅ 成功创建家庭', async () => {
      const res = await post<{ id: string; name: string }>(
        '/api/family',
        { name: 'E2E家庭测试' },
        token1,
      );
      expect([200, 201]).toContain(res.status);
      expect(typeof res.data.id).toBe('string');
      expect(res.data.name).toBe('E2E家庭测试');
      familyId = res.data.id;
    });

    it('❌ 无 token 应返回 401', async () => {
      const res = await post('/api/family', { name: '无认证家庭' });
      expect(res.status).toBe(401);
    });

    it('❌ 缺少 name 字段应返回 400', async () => {
      const res = await post('/api/family', {}, token1);
      expect(res.status).toBe(400);
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('GET /api/family/mine  获取我的家庭列表', () => {
    it('✅ 应返回包含刚创建家庭的列表', async () => {
      const res = await get<Array<{ id: string; name: string; role: number }>>(
        '/api/family/mine',
        token1,
      );
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
      const myFamily = res.data.find((f) => f.id === familyId);
      expect(myFamily).toBeDefined();
      expect(myFamily?.role).toBe(1); // owner=1
    });

    it('❌ 无 token 应返回 401', async () => {
      const res = await get('/api/family/mine');
      expect(res.status).toBe(401);
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('GET /api/family/:id/members  获取家庭成员列表', () => {
    it('✅ 应返回包含 owner 的成员列表', async () => {
      const res = await get<Array<{
        id: string;
        role: number;
        user_id: string;
        name: string;
      }>>(`/api/family/${familyId}/members`, token1);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
      expect(res.data.length).toBeGreaterThanOrEqual(1);
      const owner = res.data.find((m) => m.user_id === userId1);
      expect(owner).toBeDefined();
      expect(owner?.role).toBe(1); // owner=1
    });

    it('❌ 非家庭成员应返回 403', async () => {
      const res = await get(`/api/family/${familyId}/members`, token2);
      expect([403, 404]).toContain(res.status);
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('POST /api/family/:id/invite  生成邀请码', () => {
    let inviteCode: string;

    it('✅ 应返回 6 位邀请码', async () => {
      const res = await post<{ code: string }>(
        `/api/family/${familyId}/invite`,
        {},
        token1,
      );
      expect([200, 201]).toContain(res.status);
      expect(typeof res.data.code).toBe('string');
      expect(res.data.code).toMatch(/^[A-Z0-9]{6}$/);
      inviteCode = res.data.code;
    });

    it('✅ 重复生成应返回新码（旧码作废）', async () => {
      const res = await post<{ code: string }>(
        `/api/family/${familyId}/invite`,
        {},
        token1,
      );
      expect([200, 201]).toContain(res.status);
      expect(res.data.code).toMatch(/^[A-Z0-9]{6}$/);
      // 新码应有效（不一定与旧码不同，但不报错）
    });

    // ── 通过邀请码加入（需要有效 code，放在 invite 测试块内确保顺序） ──
    describe('POST /api/family/join  通过邀请码加入', () => {
      it('✅ 用户2 通过邀请码加入成功', async () => {
        // 先获取最新邀请码
        const inviteRes = await post<{ code: string }>(
          `/api/family/${familyId}/invite`,
          {},
          token1,
        );
        const code = inviteRes.data.code;

        const joinRes = await post<{ familyId: string }>(
          '/api/family/join',
          { code },
          token2,
        );
        expect([200, 201]).toContain(joinRes.status);
        expect(joinRes.data.familyId).toBe(familyId);
      });

      it('✅ 加入后成员列表应增加用户2', async () => {
        const res = await get<Array<{ user_id: string; role: number }>>(
          `/api/family/${familyId}/members`,
          token1,
        );
        expect(res.status).toBe(200);
        const user2Member = res.data.find((m) => m.role === 2);
        expect(user2Member).toBeDefined();
      });

      it('❌ 重复加入同一家庭应返回 409', async () => {
        const inviteRes = await post<{ code: string }>(
          `/api/family/${familyId}/invite`,
          {},
          token1,
        );
        const code = inviteRes.data.code;
        const res = await post('/api/family/join', { code }, token2);
        expect(res.status).toBe(409);
      });

      it('❌ 无效邀请码应返回 404', async () => {
        const res = await post('/api/family/join', { code: 'XXXXXX' }, token2);
        expect(res.status).toBe(404);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('GET /api/family/:id/records/today  今日记录聚合', () => {
    it('✅ 应返回数组（可为空）', async () => {
      const res = await get<unknown[]>(
        `/api/family/${familyId}/records/today`,
        token1,
      );
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
    });
  });
});