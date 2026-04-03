// keepalive-ping — CloudBase 定时云函数
// 每 20 分钟触发一次，HTTP GET CloudRun /health 端点
// 作用：防止 CloudRun 缩容至 0，确保容器内 TasksService.keepDatabaseAlive（每 8 分钟 SELECT 1）持续运行
// 对应 INFRA-cloudbase.md 阶段八 § 8.3 层二
// 注意：CloudRun MinNum=0 时冷启动可能需要 30~60s，函数超时设为 60s，HTTP 请求超时设为 55s
const https = require('https');

const HEALTH_URL =
  process.env.CLOUDRUN_HEALTH_URL ||
  'https://minicare-api-240137-10-1253854169.sh.run.tcloudbase.com/health';

exports.main = async (event, context) => {
  return new Promise((resolve) => {
    const req = https.get(HEALTH_URL, { timeout: 55000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        console.log(`[keepalive] status=${res.statusCode} body=${body}`);
        resolve({ statusCode: res.statusCode, body });
      });
    });
    req.on('error', (err) => {
      console.error('[keepalive] error:', err.message);
      resolve({ error: err.message });
    });
    req.on('timeout', () => {
      req.destroy();
      console.error('[keepalive] timeout after 55s');
      resolve({ error: 'timeout' });
    });
  });
};
