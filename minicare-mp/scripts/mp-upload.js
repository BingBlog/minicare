#!/usr/bin/env node
/**
 * minicare-mp 体验版上传脚本
 *
 * 用途：构建最新小程序包并上传为微信体验版（不发布线上）。
 *
 * 版本管理：
 *   - 当前线上包版本记录在 scripts/version.json 的 latest 字段
 *   - 默认自动递增 patch 版本（2.2.1 → 2.2.2）作为上传版本，上传成功后写回 version.json
 *   - 也可用 --version 显式指定（必须大于 latest，否则微信拒绝）
 *
 * 使用方式：
 *   node scripts/mp-upload.js [--version 2.2.2] [--desc "更新说明"] [--robot 1]
 *
 * 前置条件（与 mp-preview.js 相同）：
 *   1. 微信公众平台已生成「代码上传密钥」→ minicare-mp/private.wxac792556967d5838.key
 *   2. 电脑公网 IP 已加入微信公众平台 IP 白名单
 *   3. miniprogram-ci 已安装（npm install miniprogram-ci --save-dev）
 *
 * 说明：本脚本只执行 ci.upload（假设 dist 已构建）；
 *       如需构建+上传一体，可先运行 npm run build:weapp 再执行本脚本。
 */

const path = require('path')
const fs = require('fs')
const { execSync } = require('child_process')

// ── 强制 IPv4 DNS 解析，防止 IPv6 地址导致 IP 白名单校验失败 ──
if (!process.env.NODE_OPTIONS || !process.env.NODE_OPTIONS.includes('ipv4first')) {
  process.env.NODE_OPTIONS = (process.env.NODE_OPTIONS || '').trim() + ' --dns-result-order=ipv4first'
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
const DEFAULT_KEY_PATH = path.join(PROJECT_ROOT, `private.${APPID}.key`)
const VERSION_FILE = path.join(PROJECT_ROOT, 'scripts', 'version.json')

/** 读取 version.json 中记录的当前线上版本（latest） */
function loadLatestVersion() {
  try {
    const raw = fs.readFileSync(VERSION_FILE, 'utf8')
    const json = JSON.parse(raw)
    return typeof json.latest === 'string' ? json.latest : ''
  } catch {
    return ''
  }
}

/** 版本号 patch 位 +1：2.2.1 → 2.2.2（支持 x.y.z[-suffix] 形式） */
function bumpPatch(version) {
  const m = version.match(/^(\d+)\.(\d+)\.(\d+)(.*)$/)
  if (!m) return ''
  const [_, major, minor, patch, suffix] = m
  return `${major}.${minor}.${Number(patch) + 1}${suffix || ''}`
}

// ── 解析参数 ──
const args = process.argv.slice(2)
let version = ''
let desc = '体验版上传'
let robot = 1
let privateKeyPath = DEFAULT_KEY_PATH

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--version' && args[i + 1]) version = args[++i]
  if (args[i] === '--desc' && args[i + 1]) desc = args[++i]
  if (args[i] === '--robot' && args[i + 1]) robot = parseInt(args[++i])
  if (args[i] === '--pkp' && args[i + 1]) privateKeyPath = args[++i]
}

// 未显式指定版本时：读取 version.json 的 latest 自动递增 patch
if (!version) {
  const latest = loadLatestVersion()
  if (!latest) {
    console.error('❌ 未指定 --version，且 scripts/version.json 无 latest 记录！')
    process.exit(1)
  }
  version = bumpPatch(latest)
  if (!version) {
    console.error(`❌ 无法从 ${latest} 推导递增版本，请用 --version 显式指定！`)
    process.exit(1)
  }
  console.log(`  ℹ️ 自动版本号：${latest} → ${version}（version.json 记录递增）`)
}

// ── Step 1: 检查密钥文件 ──
if (!fs.existsSync(privateKeyPath)) {
  console.error('❌ 密钥文件不存在！')
  console.error(`   期望路径: ${privateKeyPath}`)
  console.error('请前往微信公众平台 → 开发管理 → 开发设置 → 小程序代码上传 → 生成密钥')
  process.exit(1)
}

// ── Step 2: 检查构建产物 ──
if (!fs.existsSync(path.join(DIST_DIR, 'app.json'))) {
  console.error('❌ 未找到构建产物 dist/app.json！')
  console.error('   请先执行: npm run build:weapp（Node 18）')
  process.exit(1)
}

console.log(`✅ 密钥文件: ${privateKeyPath}`)
console.log(`✅ 构建产物: ${DIST_DIR}`)

// ── Step 3: 清除代理，上传体验版 ──
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

const uploadOptions = {
  project,
  version,
  desc,
  setting: {
    es6: true,
    enhance: true,
    minify: true,
    minifyWXML: true,
    minifyWXSS: true,
  },
  robot,
  onProgressUpdate: (progress) => {
    if (progress._status === 'done') {
      console.log(`  ✓ ${progress._msg || '步骤完成'}`)
    }
  },
}

;(async () => {
  try {
    console.log(`\n📦 上传体验版 v${version} (robot=${robot})...`)
    const uploadResult = await ci.upload(uploadOptions)

    console.log('\n✅ 体验版上传成功！')
    console.log(`   版本号: ${version}`)
    console.log(`   描述: ${desc}`)

    // 上传成功 → 将 version.json 的 latest 更新为本次上传版本（下次自动递增）
    fs.writeFileSync(VERSION_FILE, JSON.stringify({ latest: version }, null, 2) + '\n')
    console.log(`   📝 已更新 scripts/version.json latest = ${version}`)

    if (uploadResult.subPackageInfo) {
      console.log('\n📦 包信息:')
      for (const pkg of uploadResult.subPackageInfo) {
        const name = pkg.name === '__APP__' ? '主包' : pkg.name === '__FULL__' ? '整包' : pkg.name
        console.log(`   ${name}: ${(pkg.size / 1024).toFixed(1)} KB`)
      }
    }

    console.log('\n📱 下一步：在微信公众平台「版本管理 → 开发版本」中将该版本设为体验版')
    console.log('   或直接告知用户扫码体验（体验版二维码在公众平台生成）')
  } catch (err) {
    console.error('❌ 上传失败！')
    console.error(`   错误: ${err.message}`)

    if (err.message.includes('ip')) {
      console.error('\n💡 IP 白名单问题：请在微信公众平台配置 IP 白名单')
      console.error('   当前电脑公网 IP: 可通过 curl ifconfig.me 查看')
    }
    if (err.message.includes('key') || err.message.includes('private')) {
      console.error('\n💡 密钥问题：请确认密钥文件路径正确且内容有效')
    }
    if (err.message.includes('version')) {
      console.error('\n💡 版本号问题：请确认 version 格式为 x.y.z')
    }
    process.exit(1)
  }
})()
