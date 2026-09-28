// 查询 minicare-agent CloudRun 服务详情（获取默认访问域名）
import cloudbase from '@cloudbase/manager-node'

const app = cloudbase.init({
  env: process.env.TCB_ENV_ID,
  secretId: process.env.TCB_SECRET_ID,
  secretKey: process.env.TCB_SECRET_KEY,
})
const res = await app.cloudrun.detail({ serverName: 'minicare-agent' })
// 域名可能在不同字段
const s = JSON.stringify(res, null, 2)
const match = s.match(/https?:\/\/[a-zA-Z0-9.-]*\.sh\.run\.tcloudbase\.com/)
console.log(match ? `域名: ${match[0]}` : '未找到域名，打印详情:')
if (!match) console.log(s.slice(0, 1500))
process.exit(0)
