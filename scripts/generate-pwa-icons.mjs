// #466 (NBR reskin): generate the PWA / home-screen icons with "NBR" text in bold
// white on the chrome-dark background #0e0e0e. Rendered with Playwright's Chromium
// so the text stays crisp at any size. Re-run after any branding change:
//   node scripts/generate-pwa-icons.mjs
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
const BG = '#0e0e0e' // chrome dark (NBR brand)
const TEXT = 'NBR'

// textRatio = text block width as a fraction of the canvas side. Smaller for the
// maskable variant so the text sits inside Android's ~80% safe zone.
const ICONS = [
  { out: 'public/icon-192.png', size: 192, textRatio: 0.72 },
  { out: 'public/icon-512.png', size: 512, textRatio: 0.72 },
  { out: 'public/icon-512-maskable.png', size: 512, textRatio: 0.52 },
  { out: 'app/icon.png', size: 512, textRatio: 0.72 },
  { out: 'app/apple-icon.png', size: 180, textRatio: 0.72 },
]

const html = (size, textRatio) => `<!doctype html><html><head><meta charset="utf-8">
<style>
  html,body{margin:0;padding:0}
  .icon{
    width:${size}px;height:${size}px;background:${BG};
    display:flex;align-items:center;justify-content:center;overflow:hidden;
  }
  .label{
    color:#ffffff;
    font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;
    font-weight:800;
    font-size:${Math.round(size * textRatio / 2.4)}px;
    line-height:1;
    letter-spacing:-0.02em;
  }
</style></head><body><div class="icon"><span class="label">${TEXT}</span></div></body></html>`

const browser = await chromium.launch()
try {
  for (const { out, size, textRatio } of ICONS) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
    await page.setContent(html(size, textRatio), { waitUntil: 'load' })
    const el = await page.locator('.icon')
    await el.screenshot({ path: path.join(ROOT, out), omitBackground: false })
    await page.close()
    console.log(`wrote ${out} (${size}×${size})`)
  }
} finally {
  await browser.close()
}
