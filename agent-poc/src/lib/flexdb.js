/**
 * CloudBase 凭证（FlexDB 会话持久化）
 *
 * 复用 config.getTcbCredentials()：环境变量优先（生产），本地 tcb CLI 登录态兜底（开发）。
 * POC 已确认：client-tool 回传依赖 FlexDB session store（patchSentinelToolResult），
 * 必须注入 credentials 才可用。
 */
import { getTcbCredentials } from '../config.js'

export { getTcbCredentials as getCloudBaseCredentials }
