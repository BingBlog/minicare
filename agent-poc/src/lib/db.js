/**
 * MySQL 只读连接池（lib/db.js，P1 知识库）
 *
 * 知识库检索用只读连接（SELECT 专用）。缺 DB 配置时返回 null，
 * 由调用方降级（search_knowledge 返回"未找到"，/health db=false），
 * 避免容器因配置缺失崩溃进入 Back-off 重启循环（M8 tech §6）。
 *
 * 环境变量：DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD
 *   （与 minicare-platform/api/.env 及迁移脚本命名一致）
 */
import mysql from 'mysql2/promise'

let pool = null

export function initDb(config) {
  if (!config.db) return null
  const { host, port, name, user, password } = config.db
  pool = mysql.createPool({
    host,
    port,
    database: name,
    user,
    password,
    charset: 'utf8mb4',
    connectionLimit: 2,
    waitForConnections: true,
    enableKeepAlive: true,
    timezone: '+08:00',   // 业务时区：DATETIME 按北京时间解析，SQL DATE() 分组一致
    dateStrings: true,    // 日期返回字符串（YYYY-MM-DD HH:mm:ss），工具输出友好、无时区歧义
    // 只读：显式关闭写能力（连接级 session 变量，应用层保护）
    namedPlaceholders: false,
  })
  // 会话时区锁定 +08:00（CynosDB 默认可能 UTC，避免按天分组错一天）
  pool.query("SET time_zone = '+08:00'").catch(() => {})
  return pool
}

export function getDb() {
  return pool
}

/** 健康探测：SELECT 1，失败返回 false（不抛异常） */
export async function pingDb() {
  if (!pool) return false
  try {
    await pool.query('SELECT 1')
    return true
  } catch {
    return false
  }
}

/** 关闭连接池（测试/优雅退出用） */
export async function closeDb() {
  if (pool) {
    await pool.end()
    pool = null
  }
}
