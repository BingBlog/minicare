/**
 * E2E 测试 — Auth 模块
 *
 * 测试端点：
 *   POST /api/auth/send-code    发送验证码（测试模式）
 *   POST /api/auth/verify-code  验证码登录
 *   GET  /api/auth/me           获取当前用户信息
 *
 * 测试模式：AUTH_TEST_MODE=true，固定验证码 123456
 */
import { post, get, TEST_CODE } from './http-client';

/** 本模块使用独立手机号，避免与其他测试冲突 */
const AUTH_TEST_PHONE = '18811110001';

describe('[Auth] 认证模块', () => {
  let authToken: string;
  let userId: string;

  // ─────────────────────────────────────────────────────────────
  describe('POST /api/auth/send-code  发送验证码', () => {
    it('✅ 正常手机号应返回 200/201', async () => {
      const res = await post<{ message: string }>('/api/auth/send-code', {
        phone: AUTH_TEST_PHONE,
      });
      expect([200, 201]).toContain(res.status);
      expect(res.data).toHaveProperty('message');
    });

    it('❌ 缺少 phone 字段应返回 400', async () => {
      const res = await post<{ statusCode: number }>('/api/auth/send-code', {});
      expect(res.status).toBe(400);
    });

    it('❌ phone 格式错误应返回 400', async () => {
      const res = await post<{ statusCode: number }>('/api/auth/send-code', {
        phone: '123',  // 非法手机号
      });
      expect(res.status).toBe(400);
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('POST /api/auth/verify-code  验证码登录', () => {
    it('✅ 正确验证码应返回 token 和 user 对象', async () => {
      const res = await post<{
        token: string;
        user: { id: string; phone: string; nickname: string };
        isNewUser: boolean;
      }>('/api/auth/verify-code', {
        phone: AUTH_TEST_PHONE,
        code: TEST_CODE,
      });

      expect([200, 201]).toContain(res.status);
      expect(typeof res.data.token).toBe('string');
      expect(res.data.token.length).toBeGreaterThan(10);
      expect(res.data.user).toMatchObject({
        phone: AUTH_TEST_PHONE,
      });
      expect(typeof res.data.user.id).toBe('string');
      expect(typeof res.data.isNewUser).toBe('boolean');

      // 保存 token 供后续测试使用
      authToken = res.data.token;
      userId = res.data.user.id;
    });

    it('✅ 已注册用户二次登录 isNewUser 应为 false', async () => {
      const res = await post<{ isNewUser: boolean }>('/api/auth/verify-code', {
        phone: AUTH_TEST_PHONE,
        code: TEST_CODE,
      });
      expect([200, 201]).toContain(res.status);
      expect(res.data.isNewUser).toBe(false);
    });

    it('❌ 错误验证码应返回 401', async () => {
      const res = await post<{ statusCode: number }>('/api/auth/verify-code', {
        phone: AUTH_TEST_PHONE,
        code: '000000',
      });
      expect(res.status).toBe(401);
    });

    it('❌ 缺少 phone 字段应返回 400', async () => {
      const res = await post<{ statusCode: number }>('/api/auth/verify-code', {
        code: TEST_CODE,
      });
      expect(res.status).toBe(400);
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe('GET /api/auth/me  获取当前用户信息', () => {
    it('✅ 有效 token 应返回用户信息', async () => {
      // 若上面的登录测试失败，这里先重新登录
      if (!authToken) {
        const res = await post<{ token: string; user: { id: string } }>(
          '/api/auth/verify-code',
          { phone: AUTH_TEST_PHONE, code: TEST_CODE },
        );
        authToken = res.data.token;
        userId = res.data.user.id;
      }

      const res = await get<{
        id: string;
        phone: string;
        nickname: string;
        avatar_url: string | null;
      }>('/api/auth/me', authToken);

      expect(res.status).toBe(200);
      expect(res.data).toMatchObject({
        id: userId,
        phone: AUTH_TEST_PHONE,
      });
      expect(typeof res.data.nickname).toBe('string');
    });

    it('❌ 无 token 应返回 401', async () => {
      const res = await get<{ statusCode: number }>('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('❌ 无效 token 应返回 401', async () => {
      const res = await get<{ statusCode: number }>('/api/auth/me', 'invalid.token.here');
      expect(res.status).toBe(401);
    });
  });
});