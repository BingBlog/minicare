/**
 * 日期工具函数
 *
 * MySQL DATETIME 字段不接受 ISO 8601 格式（带 T 和 Z 的字符串）。
 * 本工具将 ISO 日期字符串转换为 MySQL 兼容的 'YYYY-MM-DD HH:MM:SS' 格式。
 */

/**
 * 将 ISO 8601 日期字符串转换为 MySQL DATETIME 格式
 *
 * 输入：'2026-04-01T08:00:00.000Z'
 * 输出：'2026-04-01 08:00:00'
 *
 * @param isoString ISO 8601 格式的日期字符串，或 Date 对象
 * @returns MySQL DATETIME 格式的字符串
 */
export function toMysqlDatetime(isoString: string | Date): string {
  const date = typeof isoString === 'string' ? new Date(isoString) : isoString;
  // 格式化为 MySQL DATETIME 格式：YYYY-MM-DD HH:MM:SS（使用 UTC 时间）
  return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

/**
 * 将 ISO 8601 日期字符串转换为 MySQL DATE 格式
 *
 * 输入：'2026-04-01' 或 '2026-04-01T00:00:00.000Z'
 * 输出：'2026-04-01'
 *
 * @param isoString 日期字符串
 * @returns MySQL DATE 格式的字符串
 */
export function toMysqlDate(isoString: string | Date): string {
  const date = typeof isoString === 'string' ? new Date(isoString) : isoString;
  return date.toISOString().split('T')[0];
}