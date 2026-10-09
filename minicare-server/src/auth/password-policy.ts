/**
 * 密码策略 —— 单一真相源（后端）
 *
 * 🚨 前端镜像文件：`minicare-mp/src/lib/passwordPolicy.ts`
 *    Taro 编译期无法共享后端 TS 文件，规则与文案在两处各存一份。
 *    **修改本文件必须同步修改前端镜像文件**，否则会出现「前端放行、后端 400」的口径不一致。
 *
 * 规则：8–20 位；必须同时包含字母与数字；允许 !@#$%^&*._- 等常用符号；禁止空格与中文。
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 20;

/**
 * 允许字符集：英文字母 + 数字 + `!@#$%^&*._-`
 * 两个前瞻断言分别保证「至少一个字母」与「至少一个数字」。
 */
export const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d!@#$%^&*._-]{8,20}$/;

export const PASSWORD_HINT = `密码需为 ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} 位，且同时包含字母和数字`;
