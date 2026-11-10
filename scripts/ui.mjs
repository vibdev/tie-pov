// layout stills of the interface: node scripts/ui.mjs [outdir]
import { chromium } from 'playwright';
const out = process.argv[2] ?? 'looks-preview';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const shots = [
  ['pov', 1440, 900, 'knot=four-in-hand&step=3', null],
  ['mirror', 1440, 900, 'knot=four-in-hand&step=3&view=mirror', null],
  ['settings', 1440, 900, 'knot=windsor&step=5', () => { document.getElementById('settings').open = true; document.getElementById('opt-notation').click(); }],
  ['bow', 1280, 720, 'knot=bow-tie&step=4', null],
  ['phone', 390, 844, 'knot=four-in-hand&step=3', null],
  ['phone-last', 390, 844, 'knot=bow-tie&step=7', null],
  ['landscape', 844, 390, 'knot=four-in-hand&step=3', null],
];
for (const [name, w, h, hash, fn] of shots) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', (e) => console.log(name, 'pageerror', e.message));
  await page.goto(`http://localhost:5199/?s=${name}#${hash}`);
  await page.waitForTimeout(2500);
  if (fn) { await page.evaluate(fn); await page.waitForTimeout(800); }
  await page.screenshot({ path: `${out}/ui-${name}.png` });
  await page.close();
}
await browser.close();
