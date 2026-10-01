// #478 (Story A): generate the PWA / home-screen icons from the 🐯🐺 emoji on a
// brand-orange background. Rendered with Playwright's Chromium (Apple Color Emoji
// on macOS) so the glyphs stay crisp at any size — favicon.ico is too low-res to
// scale up. Re-run after any branding change:  node scripts/generate-pwa-icons.mjs
//
// Outputs (paths relative to repo root):
//   public/icon-192.png          192  "any"      — manifest
//   public/icon-512.png          512  "any"      — manifest
//   public/icon-512-maskable.png 512  maskable   — manifest (Android adaptive)
//   app/icon.png                 512  "any"      — Next icon convention
//   app/apple-icon.png           180  "any"      — iOS home screen (ignores manifest)
import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BG = '#f97316' // brand orange (orange-500)
const EMOJI = '🐯🐺'

// emojiRatio = emoji block width as a fraction of the canvas side. Smaller for the
// maskable variant so the two glyphs sit inside Android's ~80% safe zone.
const ICONS = [
  { out: 'public/icon-192.png', size: 192, emojiRatio: 0.82 },
  { out: 'public/icon-512.png', size: 512, emojiRatio: 0.82 },
  { out: 'public/icon-512-maskable.png', size: 512, emojiRatio: 0.6 },
  { out: 'app/icon.png', size: 512, emojiRatio: 0.82 },
  { out: 'app/apple-icon.png', size: 180, emojiRatio: 0.82 },
]

const html = (size, emojiRatio) => `<!doctype html><html><head><meta charset="utf-8">
<style>
  html,body{margin:0;padding:0}
  .icon{
    width:${size}px;height:${size}px;background:${BG};
    display:flex;align-items:center;justify-content:center;overflow:hidden;
    /* two emoji ≈ 2× font-size wide; target block width = emojiRatio * side */
    font-size:${(size * emojiRatio) / 2}px;line-height:1;letter-spacing:-0.08em;
  }
</style></head><body><div class="icon">${EMOJI}</div></body></html>`

const browser = await chromium.launch()
try {
  for (const { out, size, emojiRatio } of ICONS) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
    await page.setContent(html(size, emojiRatio), { waitUntil: 'load' })
    const el = await page.locator('.icon')
    await el.screenshot({ path: path.join(ROOT, out), omitBackground: false })
    await page.close()
    console.log(`wrote ${out} (${size}×${size})`)
  }
} finally {
  await browser.close()
}
