/**
 * GET /diag — 容器环境诊断（定位 Claude CLI 启动问题，M8 tech §6）
 * 直接检查：CLI 二进制存在性/权限、动态库依赖、可写目录、关键 env。
 */
export function diagRoute(_config) {
  return async (_req, res) => {
    const { execFileSync, execSync } = await import('node:child_process')
    const fs = await import('node:fs')
    const path = await import('node:path')
    const out = { env: {}, cli: {}, dirs: {} }

    for (const k of ['CLAUDE_CONFIG_DIR', 'HOME', 'PATH', 'OAK_DEBUG', 'DEEPSEEK_API_KEY', 'PORT', 'TCB_ENV_ID']) {
      out.env[k] = process.env[k] ? (k === 'DEEPSEEK_API_KEY' ? '***set***' : process.env[k]) : null
    }

    try {
      const cliPath = path.join(process.cwd(), 'node_modules', '@anthropic-ai', 'claude-agent-sdk-linux-x64', 'claude')
      out.cli.expectedPath = cliPath
      out.cli.exists = fs.existsSync(cliPath)
      if (out.cli.exists) {
        const st = fs.statSync(cliPath)
        out.cli.mode = (st.mode & 0o777).toString(8)
        out.cli.sizeMB = Math.round(st.size / 1024 / 1024)
        try {
          out.cli.ldd = execSync(`ldd "${cliPath}" 2>&1 || true`, { encoding: 'utf8' }).split('\n').slice(0, 15)
        } catch (e) {
          out.cli.ldd = ['ldd failed: ' + e.message]
        }
        try {
          out.cli.version = execFileSync(cliPath, ['--version'], {
            encoding: 'utf8',
            timeout: 15000,
            env: { ...process.env, CLAUDE_CONFIG_DIR: '/tmp/oak-claude' },
          }).slice(0, 100)
        } catch (e) {
          out.cli.versionError = (e?.message || String(e)).slice(0, 300)
          out.cli.stderr = (e?.stderr || '').slice(0, 300)
        }
      }
    } catch (e) {
      out.cli.error = (e?.message || String(e)).slice(0, 300)
    }

    for (const d of ['/tmp', '/tmp/oak-claude', process.cwd(), '/app']) {
      try {
        fs.accessSync(d, fs.constants.W_OK)
        out.dirs[d] = 'writable'
      } catch {
        out.dirs[d] = 'NOT writable'
      }
    }

    res.json(out)
  }
}
