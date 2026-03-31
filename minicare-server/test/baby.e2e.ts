/**
 * E2E 测试 — Baby 模块
 *
 * 测试端点：
 *   POST  /api/family/:id/baby             创建宝宝档案
 *   GET   /api/family/:id/baby             获取宝宝档案
 *   PATCH /api/family/:id/baby/:babyId     更新宝宝档案
 */
import { post, get, patch } from './http-client';
import { loginTestUser, createTestFamily } from './helpers/auth-helper';

const BABY_TEST_PHONE = '18811110021';

describe('[Baby] 宝宝档案模块', () => {
  let token: string;
  let familyId: string;
  let babyId: string;

  beforeAll(async () => {
    const { token: t } = await loginTestUser(BABY_TEST_PHONE);
    token = t;
    familyId = await createTestFamily(token, 'E2E宝宝测试家庭');
  });

  // ─────────────────────────────────────────────────────────────
  describe('POST /api/family/:id/baby  创建宝宝档案', () => {
    it('✅ 完整字段创建宝宝应成功', async () => {
      const res = await post<{
        id: string;
        name: string;
        gender: string;
        birth_date: string;
        allergy_types: string[];
        allergy_level: string;
        birth_weight_g: number;
        birth_height_cm: number;
      }>(`/api/family/${familyId}/baby`, {
        name: '小宝',
        gender: 'female',
        birth_date: '2024-06-15',
        allergy_types: ['milk', 'egg'],
        allergy_level: 'mild',
        birth_weight_g: 3200,
        birth_height_cm: 50,
      }, token);

      expect([200, 201]).toContain(res.status);
      expect(typeof res.data.id).toBe('string');
      expect(res.data.name).toBe('小宝');
      expect(res.data.gender).toBe('female');
      // birth_date 返回 datetime 类型，因时区转换可能显示为前一天 UTC 时间
      expect(res.data.birth_date).toMatch(/2024-06-1[45]/);
      expect(res.data.allergy_types).toEqual(expect.arrayContaining(['milk', 'egg']));
      expect(res.data.allergy_level).toBe('mild');
      expect(res.data.birth_weight_g).toBe(3200);
      expect(res.data.birth_height_cm).toBe(50);

      babyId = res.data.id;
    });

    it('✅ 仅必填字段创建宝宝应成功（第二个家庭）', async () => {
      // 使用新家庭避免 409
      const { token: t2 } = await loginTestUser('18811110022');
      const fid2 = await createTestFamily(t2, 'E2E最小宝宝家庭');
      const res = await post<{ id: string }>(`/api/family/${fid2}/baby`, {
        name: '宝宝2',
        gender: 'male',
        birth_date: '2023-01-01',
      }, t2);
      expect([200, 201]).toContain(res.status);
      expect(typeof res.data.id).toBe('string');
    });

    it('❌ 同一家庭重复创建应返回 409', async () => {
      const res = await post(`/api/family/${familyId}/baby`, {
        name: '第二个宝宝',
        gender: 'male',
        birth_date: '2024-01-01',
      }, token);
      expect(res.status).toBe(409);
    });

    it('❌ 缺少必填字段 name 应返回 400', async () => {
      const { token: t3 } = await loginTestUser('18811110023');
      const fid3 = await createTestFamily(t3, 'E2E缺字段家庭');
      const res = await post(`/api/family/${fid3}/baby`, {
        gender: 'female',
        birth_date: '2024-06-15',
      }, t3);
      expect(res.status).toBe(400);
    });

    it('❌ 性别枚举值错误应返回 400', async () => {
      const { token: t4 } = await loginTestUser('18811110024');
      const fid4 = await createTestFamily(t4, 'E2E枚举错误家庭');
      const res = await post(`/api/family/${fid4}/baby`, {
        name: '测试',
        gender: 'unknown_gender',  // 非法值
        birth_date: '2024-06-15',
      }, t4);
      expect(res.status).toBe(400);
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('GET /api/family/:id/baby  获取宝宝档案', () => {
    it('✅ 应返回完整宝宝档案', async () => {
      const res = await get<{
        id: string;
        family_id: string;
        name: string;
        gender: string;
        birth_date: string;
      }>(`/api/family/${familyId}/baby`, token);

      expect(res.status).toBe(200);
      expect(res.data.id).toBe(babyId);
      expect(res.data.family_id).toBe(familyId);
      expect(res.data.name).toBe('小宝');
    });

    it('❌ 无 token 应返回 401', async () => {
      const res = await get(`/api/family/${familyId}/baby`);
      expect(res.status).toBe(401);
    });

    it('❌ 无宝宝档案的家庭应返回 404', async () => {
      const { token: t5 } = await loginTestUser('18811110025');
      const fid5 = await createTestFamily(t5, 'E2E空宝宝家庭');
      const res = await get(`/api/family/${fid5}/baby`, t5);
      expect(res.status).toBe(404);
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('PATCH /api/family/:id/baby/:babyId  更新宝宝档案', () => {
    it('✅ 更新名字应成功', async () => {
      const res = await patch<{ id: string; name: string }>(
        `/api/family/${familyId}/baby/${babyId}`,
        { name: '小宝贝' },
        token,
      );
      expect(res.status).toBe(200);
      expect(res.data.name).toBe('小宝贝');
    });

    it('✅ 更新过敏信息应成功', async () => {
      const res = await patch<{
        allergy_types: string[];
        allergy_level: string;
      }>(
        `/api/family/${familyId}/baby/${babyId}`,
        {
          allergy_types: ['milk', 'egg', 'wheat'],
          allergy_level: 'moderate',
        },
        token,
      );
      expect(res.status).toBe(200);
      expect(res.data.allergy_types).toEqual(
        expect.arrayContaining(['milk', 'egg', 'wheat']),
      );
      expect(res.data.allergy_level).toBe('moderate');
    });

    it('✅ 仅传部分字段（PATCH 语义）不影响其他字段', async () => {
      const before = await get<{ name: string; gender: string }>(
        `/api/family/${familyId}/baby`,
        token,
      );
      const beforeGender = before.data.gender;

      await patch(`/api/family/${familyId}/baby/${babyId}`, { name: '最终名字' }, token);

      const after = await get<{ name: string; gender: string }>(
        `/api/family/${familyId}/baby`,
        token,
      );
      expect(after.data.name).toBe('最终名字');
      expect(after.data.gender).toBe(beforeGender); // gender 未变
    });
  });
});