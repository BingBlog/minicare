import { loadLocalEnv } from '../src/lib/env.js'

loadLocalEnv()
import cloudbase from '@cloudbase/manager-node'
const app = cloudbase.init({
  // manager-node 5.x：init 参数从 env 改名为 envId
  envId: process.env.TCB_ENV_ID,
  secretId: process.env.TCB_SECRET_ID,
  secretKey: process.env.TCB_SECRET_KEY,
})
const res = await app.cloudrun.detail({ serverName: 'minicare-agent' })
const s = JSON.stringify(res)
// 提取关键状态字段
for (const key of ['Status', 'State', 'VersionName', 'OnlineVersion', 'CreateTime', 'UpdateTime', 'DeployState', 'BuildState', 'BuildMessage', 'CurrentStatus']) {
  const m = s.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`))
  if (m) console.log(`${key}: ${m[1]}`)
}
// 查找构建相关数组
const versions = s.match(/"OnlineVersionInfos"\s*:\s*(\[[^\]]*\])/)
if (versions) console.log('OnlineVersionInfos:', versions[1].slice(0, 300))
const records = s.match(/"DeployRecords"\s*:\s*(\[[^\]]*\])/)
if (records) console.log('DeployRecords:', records[1].slice(0, 400))
process.exit(0)
