'use strict'

/**
 * Taro 4 CLI 依赖 Node >= 18（使用 node:path 等前缀）。
 * 在 Node 12 上会报 Cannot find module 'node:path'，此处提前给出可操作提示。
 */
var match = /^v(\d+)/.exec(process.version)
var major = match ? parseInt(match[1], 10) : 0

if (major < 18) {
  console.error('')
  console.error('[minicare-mp] 需要 Node.js >= 18，当前为 ' + process.version)
  console.error('')
  console.error('若已安装 nvm，在本目录执行：')
  console.error('  nvm install')
  console.error('  nvm use')
  console.error('（版本见 .nvmrc）')
  console.error('')
  console.error('或其它方式安装 Node 18+ 后重试：npm run dev:weapp')
  console.error('')
  process.exit(1)
}
