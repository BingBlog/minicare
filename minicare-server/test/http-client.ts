/**
 * minicare API E2E 测试 - HTTP 客户端工具
 *
 * 直接连接本地已运行的后端服务（localhost:3001），
 * 使用 AUTH_TEST_MODE=true，固定验证码 123456
 */
import * as http from 'http';

export const BASE_URL = 'http://localhost:3001';
export const TEST_PHONE_1 = '18811111101';
export const TEST_PHONE_2 = '18811111102';
export const TEST_CODE = '123456';

// ── 简单的 fetch 封装 ────────────────────────────────────────────

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string;
}

export interface ApiResponse<T = unknown> {
  status: number;
  data: T;
  headers: Record<string, string>;
}

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const { method = 'GET', body, token } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `${BASE_URL}${path}`;
  const fetchOptions: RequestInit = {
    method,
    headers,
  };
  if (body !== undefined) {
    fetchOptions.body = JSON.stringify(body);
  }

  const res = await fetch(url, fetchOptions);
  const resHeaders: Record<string, string> = {};
  res.headers.forEach((val, key) => { resHeaders[key] = val; });

  let data: T;
  const text = await res.text();
  try {
    data = JSON.parse(text) as T;
  } catch {
    data = text as unknown as T;
  }

  return { status: res.status, data, headers: resHeaders };
}

// ── 便捷方法 ─────────────────────────────────────────────────────

export const get = <T>(path: string, token?: string) =>
  apiRequest<T>(path, { method: 'GET', token });

export const post = <T>(path: string, body: unknown, token?: string) =>
  apiRequest<T>(path, { method: 'POST', body, token });

export const patch = <T>(path: string, body: unknown, token?: string) =>
  apiRequest<T>(path, { method: 'PATCH', body, token });

export const del = <T>(path: string, token?: string) =>
  apiRequest<T>(path, { method: 'DELETE', token });