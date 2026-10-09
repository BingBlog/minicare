// 把 pdfjs-dist 的运行时静态资源拷到 public/pdfjs/，供浏览器同源加载。
//
// 为什么必须有这一步：Vite 只会打包我们 import 的 JS，**不会**带上这些数据文件，而它们
// 都是运行期按需 fetch 的：
//   · cmaps/          —— CJK 等 CID 字体的字符映射（没有它中文渲染不出字形）
//   · standard_fonts/ —— PDF 标准 14 字体的替代字体
//   · wasm/           —— jbig2 / openjpeg / qcms 解码器（部分扫描件与图像需要）
// MinerU 的做法等价：它把整套 pdf.js 连资源一起 vendor 到
// `mineru/resources/pdf_preview/vendor/pdfjs/`（6.2MB，284 个文件）。
//
// 目标目录已 gitignore（体积大且可由本脚本再生）。
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const src = join(root, 'node_modules', 'pdfjs-dist')
const dest = join(root, 'public', 'pdfjs')

const DIRS = ['cmaps', 'standard_fonts', 'wasm']

/**
 * 版本标记文件：**目标已是最新就直接跳过**，不做整目录删除 + 重拷。
 *
 * 这不只是省时间。整目录 `rm` 会撞上运行环境的**批量删除护栏**
 * （超过 50 项需人工确认），报 `SAFE_DELETE_BULK_CONFIRM_REQUIRED` 并让整个
 * `npm run dev` 失败 —— 前端直接起不来。`public/pdfjs` 有近 200 项，必中。
 * 而它平时根本不需要重拷（只有升级 pdfjs-dist 才会变），所以用版本号短路最稳。
 */
const MARK = join(dest, '.pdfjs-dist-version')

async function exists(p) {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

async function main() {
  if (!(await exists(src))) {
    console.error('[copy-pdfjs] 找不到 node_modules/pdfjs-dist，请先 npm install')
    process.exit(1)
  }

  const want = JSON.parse(await readFile(join(src, 'package.json'), 'utf8')).version
  const have = await readFile(MARK, 'utf8').catch(() => '')
  if (have === want && (await exists(join(dest, 'cmaps')))) {
    console.log(`[copy-pdfjs] public/pdfjs 已是最新（pdfjs-dist ${want}），跳过`)
    return
  }

  await rm(dest, { recursive: true, force: true })
  await mkdir(dest, { recursive: true })
  const done = []
  for (const d of DIRS) {
    const from = join(src, d)
    if (!(await exists(from))) continue
    await cp(from, join(dest, d), { recursive: true })
    done.push(d)
  }
  await writeFile(MARK, want)
  console.log(`[copy-pdfjs] 已拷贝到 public/pdfjs: ${done.join(', ') || '(无)'}（pdfjs-dist ${want}）`)
}

await main()
