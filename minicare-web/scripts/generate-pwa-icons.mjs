/**
 * 从 public/icon.svg 生成 PWA / Apple 所需 PNG（修改 SVG 后重新执行）。
 *   npm run generate-pwa-icons
 */
import sharp from 'sharp'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const svg = path.join(root, 'public', 'icon.svg')

const targets = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]

for (const [name, size] of targets) {
  const out = path.join(root, 'public', name)
  await sharp(svg).resize(size, size).png().toFile(out)
  console.log('wrote', out)
}
