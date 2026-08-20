#!/usr/bin/env node
/**
 * minicare-mp 远程预览脚本
 * 
 * 用途：在手机上通过 WorkBuddy 助理远程控制电脑，
 *       执行此脚本构建小程序并生成预览二维码，
 *       二维码图片可回传到手机，扫码即可在微信中预览。
 * 
 * 使用方式：
 *   node scripts/mp-preview.js [--staging] [--robot 1] [--page pages/index/index]
 * 
 * 前置条件：
 *   1. 在微信公众平台下载「代码上传密钥」
 *      路径：微信公众平台 → 管理 → 开发管理 → 开发设置 → 小程序代码上传
 *   2. 将密钥文件保存为 private.wxac792556967d5838.key
 *      放在 minicare-mp/ 根目录（或通过 --pkp 参数指定路径）
 *   3. 配置 IP 白名单（建议开启，将电脑公网 IP 加入）
 *   4. 安装依赖：cd minicare-mp && npm install miniprogram-ci --save-dev
 */

const path = require('path')
const fs = require('fs')
const { execSync } = require('child_process')

// ── 强制 IPv4 DNS 解析，防止 IPv6 地址导致 IP 白名单校验失败 ──
// NODE_OPTIONS --dns-result-order=ipv4first 必须在进程启动时设置，无法中途修改
// 如果当前进程未设置，自动重启动自身并带上该参数
if (!process.env.NODE_OPTIONS || !process.env.NODE_OPTIONS.includes('ipv4first')) {
  process.env.NODE_OPTIONS = (process.env.NODE_OPTIONS || '').trim() + ' --dns-result-order=ipv4first'
  // 清除代理环境变量（重启动时也生效）
  for (const k of ['HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy', 'ALL_PROXY', 'all_proxy']) {
    delete process.env[k]
  }
  console.log('  ℹ️ 自动启用 IPv4 DNS 解析 + 清除代理（避免 IP 白名单校验失败）')
  const result = execSync(`node "${__filename}" ${process.argv.slice(2).join(' ')}`, {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
    env: process.env,
  })
  process.exit(0)
}

// ── 配置 ──
const APPID = 'wxac792556967d5838'
const PROJECT_ROOT = path.resolve(__dirname, '..')
const DIST_DIR = path.join(PROJECT_ROOT, 'dist')
const QRCODE_DIR = path.join(PROJECT_ROOT, '.preview')
const DEFAULT_KEY_PATH = path.join(PROJECT_ROOT, `private.${APPID}.key`)

// ── 解析参数 ──
const args = process.argv.slice(2)
let mode = 'production' // 默认生产构建
let robot = 1
let pagePath = ''
let privateKeyPath = DEFAULT_KEY_PATH

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--staging') mode = 'staging'
  if (args[i] === '--robot' && args[i + 1]) robot = parseInt(args[++i])
  if (args[i] === '--page' && args[i + 1]) pagePath = args[++i]
  if (args[i] === '--pkp' && args[i + 1]) privateKeyPath = args[++i]
}

// ── Step 1: 检查密钥文件 ──
if (!fs.existsSync(privateKeyPath)) {
  console.error('❌ 密钥文件不存在！')
  console.error(`   期望路径: ${privateKeyPath}`)
  console.error('')
  console.error('请前往微信公众平台下载代码上传密钥：')
  console.error('  微信公众平台 → 管理 → 开发管理 → 开发设置 → 小程序代码上传 → 生成密钥')
  console.error(`  将密钥文件保存为 private.${APPID}.key 放在 minicare-mp/ 目录下`)
  process.exit(1)
}

console.log(`✅ 密钥文件: ${privateKeyPath}`)

// ── Step 2: 构建小程序 ──
console.log(`\n📦 开始构建小程序 (${mode} 模式)...`)

const buildCmd = mode === 'staging'
  ? 'npm run build:weapp:staging'
  : 'npm run build:weapp'

try {
  execSync(buildCmd, {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    timeout: 120000 // 2分钟超时
  })
} catch (err) {
  console.error('❌ 构建失败！请检查代码是否有编译错误。')
  process.exit(1)
}

// 检查构建产物
if (!fs.existsSync(DIST_DIR)) {
  console.error('❌ 构建产物 dist/ 目录不存在！')
  process.exit(1)
}

console.log('✅ 构建成功')

// ── Step 3: 使用 miniprogram-ci 生成预览二维码 ──
console.log('\n🔍 生成预览二维码...')

// 清除代理环境变量，避免 miniprogram-ci 通过代理发出 IPv6 请求导致 IP 白名单校验失败
// 注意：脚本启动时已清除代理并重启动（见顶部 ipv4first 检查），此处为二次保险
const proxyEnvVars = ['HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy', 'ALL_PROXY', 'all_proxy']
const savedProxy = {}
for (const key of proxyEnvVars) {
  if (process.env[key]) {
    savedProxy[key] = process.env[key]
    delete process.env[key]
  }
}
if (Object.keys(savedProxy).length > 0) {
  console.log('  ℹ️ 已临时清除代理环境变量（避免 IPv6 导致 IP 白名单校验失败）')
}

// 确保 .preview 目录存在
if (!fs.existsSync(QRCODE_DIR)) {
  fs.mkdirSync(QRCODE_DIR, { recursive: true })
}

// 时间戳用于文件命名
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const qrcodeFile = path.join(QRCODE_DIR, `preview-${timestamp}.jpg`)

// 检查 miniprogram-ci 是否安装
const ciModulePath = path.join(PROJECT_ROOT, 'node_modules', 'miniprogram-ci')
if (!fs.existsSync(ciModulePath)) {
  console.error('❌ miniprogram-ci 未安装！')
  console.error('   请执行: cd minicare-mp && npm install miniprogram-ci --save-dev')
  process.exit(1)
}

const ci = require(ciModulePath)

const project = new ci.Project({
  appid: APPID,
  type: 'miniProgram',
  projectPath: PROJECT_ROOT,
  privateKeyPath: privateKeyPath,
  ignores: ['node_modules/**/*', '.preview/**', 'scripts/**'],
})

const previewOptions = {
  project,
  desc: `预览 - ${mode} - ${timestamp}`,
  setting: {
    es6: true,
    enhance: true,
    minify: true,
    minifyWXML: true,
    minifyWXSS: true,
  },
  qrcodeFormat: 'image',
  qrcodeOutputDest: qrcodeFile,
  robot,
  onProgressUpdate: (progress) => {
    if (progress._status === 'done') {
      console.log(`  ✓ ${progress._msg || '步骤完成'}`)
    }
  },
}

if (pagePath) {
  previewOptions.pagePath = pagePath
}

;(async () => {
  try {
    const previewResult = await ci.preview(previewOptions)
    
    console.log('\n✅ 预览二维码已生成！')
    console.log(`   二维码文件: ${qrcodeFile}`)
    console.log('')
    
    if (previewResult.subPackageInfo) {
      console.log('📦 包信息:')
      for (const pkg of previewResult.subPackageInfo) {
        const name = pkg.name === '__APP__' ? '主包' : pkg.name === '__FULL__' ? '整包' : pkg.name
        console.log(`   ${name}: ${(pkg.size / 1024).toFixed(1)} KB`)
      }
      console.log('')
    }
    
    console.log('📱 使用方式：')
    console.log('   1. 在微信中扫描二维码图片即可预览')
    console.log('   2. 通过 WorkBuddy 助理将二维码图片发送到手机')
    console.log('   3. 也可以直接在手机微信「小程序助手」中查看开发版')
    console.log('')
    console.log('💡 WorkBuddy 助理远程操作示例：')
    console.log('   在手机微信中发送: "帮我预览小程序，执行 node scripts/mp-preview.js"')
    console.log('   WorkBuddy 会在电脑端执行构建+生成二维码，并将图片回传到手机')
    
  } catch (err) {
    console.error('❌ 生成预览失败！')
    console.error(`   错误: ${err.message}`)
    
    if (err.message.includes('ip')) {
      console.error('')
      console.error('💡 IP 白名单问题：请在微信公众平台配置 IP 白名单')
      console.error('   当前电脑公网 IP: 可通过 curl ifconfig.me 查看')
    }
    
    if (err.message.includes('key') || err.message.includes('private')) {
      console.error('')
      console.error('💡 密钥问题：请确认密钥文件路径正确且内容有效')
    }
    
    process.exit(1)
  }
})()
