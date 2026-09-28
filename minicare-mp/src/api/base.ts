/**
 * API 基础地址统一出口（2026-09-05 新增）
 *
 * 规则：
 * - 小程序端（weapp）与 H5 生产构建：直接使用 .env 编译注入的绝对地址
 *   （.env.development = http://127.0.0.1:3001；.env.staging/.env.production = CloudRun HTTPS），
 *   其中 .env 里已有各环境说明，本文件不再重复。
 * - H5 dev（dev:h5）：手机用局域网 IP 访问（如 http://192.168.1.16:10086）时，
 *   127.0.0.1 会指向手机自身导致连不上后端。故 H5 开发态返回空串，
 *   请求走同源相对路径 '/api/...'，由 devServer 代理转发到本机 3001
 *   （见 config/dev.ts h5.devServer.proxy），局域网/本机均可用。
 *
 * 注意：Taro 编译期会把 process.env.NODE_ENV / TARO_ENV / TARO_APP_* 替换为字面量，
 * 这里的分支在构建时就已定死，小程序运行时无 process，不影响。
 */
const ABS_BASE = process.env.TARO_APP_API_BASE_URL || 'http://localhost:3001'

export const API_BASE_URL =
  process.env.NODE_ENV === 'development' && process.env.TARO_ENV === 'h5' ? '' : ABS_BASE
