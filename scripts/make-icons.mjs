// Regenerates icons/*.png from icons/icon.svg (dev-only; the PNGs are committed).
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const root = new URL('../', import.meta.url);
const svg = await readFile(new URL('icons/icon.svg', root), 'utf8');
const browser = await chromium.launch({ channel: 'msedge' });
for (const size of [16, 32, 48, 128]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`);
  await writeFile(new URL(`icons/icon-${size}.png`, root), await page.screenshot({ omitBackground: true }));
}
await browser.close();
