/**
 * 测试 Helper — 认证与上下文准备
 *
 * 提供测试中所需的 token、familyId、babyId 等上下文
 * 所有 helper 函数直接调用本地 API（localhost:3001）
 */
import { post, get, TEST_PHONE_1, TEST_CODE } from '../http-client';

export interface TestContext {
  token: string;
  userId: string;
  familyId: string;
  babyId: string;
}

/**
 * 登录测试用户（测试模式，code=123456）
 * 返回 { token, userId }
 */
export async function loginTestUser(phone: string = TEST_PHONE_1): Promise<{ token: string; userId: string }> {
  // Step 1: 发送验证码（测试模式不实际发送）
  const sendRes = await post<{ message: string }>('/api/auth/send-code', { phone });
  if (sendRes.status !== 201 && sendRes.status !== 200) {
    throw new Error(`sendCode 失败: status=${sendRes.status}, body=${JSON.stringify(sendRes.data)}`);
  }

  // Step 2: 验证码登录
  const verifyRes = await post<{
    token: string;
    user: { id: string; phone: string; nickname: string };
    isNewUser: boolean;
  }>('/api/auth/verify-code', { phone, code: TEST_CODE });

  if (verifyRes.status !== 201 && verifyRes.status !== 200) {
    throw new Error(`verifyCode 失败: status=${verifyRes.status}, body=${JSON.stringify(verifyRes.data)}`);
  }

  return {
    token: verifyRes.data.token,
    userId: verifyRes.data.user.id,
  };
}

/**
 * 创建测试家庭，返回 familyId
 */
export async function createTestFamily(token: string, name = 'E2E测试家庭'): Promise<string> {
  const res = await post<{ id: string; name: string }>('/api/family', { name }, token);
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`createFamily 失败: status=${res.status}, body=${JSON.stringify(res.data)}`);
  }
  return res.data.id;
}

/**
 * 创建测试宝宝，返回 babyId
 */
export async function createTestBaby(
  token: string,
  familyId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const babyData = {
    name: 'E2E小宝',
    gender: 'female',
    birth_date: '2024-06-15',
    ...overrides,
  };
  const res = await post<{ id: string }>(`/api/family/${familyId}/baby`, babyData, token);
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`createBaby 失败: status=${res.status}, body=${JSON.stringify(res.data)}`);
  }
  return res.data.id;
}

/**
 * 初始化完整测试上下文（登录 → 创建家庭 → 创建宝宝）
 */
export async function buildTestContext(phone: string = TEST_PHONE_1): Promise<TestContext> {
  const { token, userId } = await loginTestUser(phone);
  const familyId = await createTestFamily(token);
  const babyId = await createTestBaby(token, familyId);
  return { token, userId, familyId, babyId };
}