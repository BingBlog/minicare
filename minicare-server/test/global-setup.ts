/**
 * Jest globalSetup — 测试前确认后端服务可访问
 */
export default async function globalSetup() {
  const url = 'http://localhost:3001/health';
  try {
    const res = await fetch(url);
    const data = await res.json() as { status: string };
    if (data.status !== 'ok') {
      throw new Error('Health check 返回 status != ok');
    }
    console.log('\n[E2E] 后端服务已就绪 (localhost:3001)');
  } catch (err) {
    throw new Error(
      `[E2E] 无法连接后端服务 ${url}。\n` +
      `请先运行：cd minicare-server && npm run start:dev\n` +
      `原因: ${(err as Error).message}`,
    );
  }
}