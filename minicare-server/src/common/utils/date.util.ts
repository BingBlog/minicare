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
 * 输入：'2026-04-01T07:18:00'（不带时区，视为北京时间）或 Date 对象
 * 输出：'2026-04-01 07:18:00'
 *
 * ⚠️ 重要：对于不带时区后缀的字符串（如 '2026-04-14T00:24:42'），
 *    ES 规范在不同 V8 版本中行为不一致（有时按 UTC 解析，有时按本地时区），
 *    因此使用 new Date() 会引入 8 小时偏差（UTC+8 环境下）。
 *    解决方案：直接用正则提取字符串中的时间分量，完全绕过 Date 构造解析。
 *
 * 若输入为 Date 对象，则使用本地时间分量（与 DB timezone '+08:00' 保持一致）。
 */
export function toMysqlDatetime(isoString: string | Date): string {
  if (typeof isoString === 'string') {
    // 直接从字符串提取分量，规避 new Date() 的时区解析歧义
    // 支持格式：'2026-04-01T07:18:00'、'2026-04-01T07:18:00.000'、'2026-04-01 07:18:00'
    const m = isoString.match(
      /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/,
    );
    if (m) {
      return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`;
    }
    // 兜底：仅有日期 'YYYY-MM-DD'
    const d = isoString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (d) {
      return `${d[1]}-${d[2]}-${d[3]} 00:00:00`;
    }
  }

  // Date 对象：使用本地时间分量，与 timezone: '+08:00' 的连接保持一致
  const date = typeof isoString === 'string' ? new Date(isoString) : isoString;
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
 *
 * ⚠️ 同 toMysqlDatetime：对纯日期字符串 'YYYY-MM-DD' 直接提取分量，
 *    避免 new Date('2026-04-01') 按 UTC 解析在 CST+8 下偏移到前一天。
 */
export function toMysqlDate(isoString: string | Date): string {
  if (typeof isoString === 'string') {
    const m = isoString.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  const date = typeof isoString === 'string' ? new Date(isoString) : isoString;
  const y  = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d  = String(date.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

/**
 * 将 mysql2 查询结果中的日期列安全格式化为 YYYY-MM-DD 字符串。
 *
 * 适用于 mysql2 返回的 DATE / DATE_FORMAT 列：
 *   - mysql2 会将 MySQL DATE 类型列解析为 JS Date，以 UTC 零点补零
 *     （如 '2026-04-18' → 2026-04-18T00:00:00.000Z）。
 *   - 若 Node.js 进程时区为 UTC+8，toISOString() 返回 '2026-04-17T16:00:00.000Z'，
 *     slice(0,10) 得 '2026-04-17'，比实际日期少一天，导致图表 X 轴日期偏移。
 *
 * 正确做法：使用本地时间分量 getFullYear/getMonth/getDate，不受时区影响。
 * 若列值已是字符串（如 DATE_FORMAT 结果），直接截取前 10 位即可。
 */
export function formatSqlDate(d: unknown): string {
  if (d instanceof Date) {
    const y   = d.getFullYear();
    const m   = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return String(d).slice(0, 10);
}
