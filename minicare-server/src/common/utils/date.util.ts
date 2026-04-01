/**
 * 日期工具函数
 *
 * 全链路统一使用北京时间（CST, UTC+8）存储，无需时区转换。
 * 数据库连接已配置 timezone: '+08:00'，mysql2 会以 CST 解读 DATETIME 字段。
 *
 * 核心规则：
 *  - 前端传入 ISO 字符串（不带 Z，如 '2026-04-01T07:18:00'）视为北京时间
 *  - 后端用本地时间分量写入 MySQL，Date() 构造时不加 Z 则 JS 按本地时区解析
 *  - 查询时直接用 DATE(field) = 'YYYY-MM-DD'，字段和日期均为 CST，无偏差
 */

/**
 * 将日期字符串/Date 对象格式化为 MySQL DATETIME 字符串（CST 本地时间）
 *
 * 输入：'2026-04-01T07:18:00'（视为本地时间）或 Date 对象
 * 输出：'2026-04-01 07:18:00'
 *
 * 注意：若输入带 Z 后缀（UTC），Node.js 进程时区会影响结果。
 *       前端统一不发送带 Z 的字符串，后端不会收到 UTC ISO 字符串。
 */
export function toMysqlDatetime(isoString: string | Date): string {
  const date = typeof isoString === 'string' ? new Date(isoString) : isoString;
  // 使用本地时间分量，与 timezone: '+08:00' 的连接保持一致
  const y  = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d  = String(date.getDate()).padStart(2, '0');
  const h  = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const s  = String(date.getSeconds()).padStart(2, '0');
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
}

/**
 * 将日期字符串/Date 对象格式化为 MySQL DATE 字符串（CST 本地日期）
 *
 * 输入：'2026-04-01' 或 Date 对象
 * 输出：'2026-04-01'
 */
export function toMysqlDate(isoString: string | Date): string {
  const date = typeof isoString === 'string' ? new Date(isoString) : isoString;
  const y  = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d  = String(date.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}
